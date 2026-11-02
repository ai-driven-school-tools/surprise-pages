import { VERSION_BANNER_MARK } from "../../lib/comments/types";
import { FIRST_PAINT_MARK } from "../../lib/first-paint/mark";
import { activeReadingEntry, readOutline, readingHref, READING_TAG, revealReadingTarget, withoutReadingNumber, type ReadingEntry, type ReadingOutline } from "./outline";
import { t } from "../shared/i18n";
import { readingPageRules, READING_STYLES } from "./nav-styles";
import { ICON_SIZE, READING_LAYOUT } from "../shared/tokens";
import { topInset } from "./top-inset";
import { el, icon, ICON_CHEVRON_DOWN } from "../shared/util";

/** top は控えた時点の画面上の位置。scrollY はそのときのスクロール量（あとから指で動いたぶんを差し引くため）。 */
interface Position { range: Range; top: number; scrollY: number }
interface ReadingOptions {
  onDialogChange: (open: boolean) => void;
}

/** 原本の木を包み直さず、読む場所だけを控える。折り返しが変わっても同じ文字へ戻せる。 */
function capturePosition(main: HTMLElement, line: number): Position | null {
  if (window.scrollY <= READING_LAYOUT.edge) return null;
  const rect = main.getBoundingClientRect();
  const x = Math.max(rect.left, 0) + READING_LAYOUT.edge;
  const range = document.caretRangeFromPoint?.(x, line);
  if (range && main.contains(range.startContainer)) {
    if (range.startContainer instanceof Text && range.startOffset < range.startContainer.length) {
      range.setEnd(range.startContainer, range.startOffset + 1);
    }
    const box = range.getBoundingClientRect();
    if (box.height > 0 && box.bottom >= line && box.top < window.innerHeight) return { range, top: box.top, scrollY: window.scrollY };
  }
  for (const node of main.querySelectorAll("p,h1,h2,h3,li,td")) {
    const box = node.getBoundingClientRect();
    if (node.getClientRects().length === 0 || box.bottom < line || box.top > window.innerHeight) continue;
    const fallback = document.createRange();
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      if (!(text instanceof Text) || !text.textContent?.trim()) continue;
      fallback.setStart(text, 0);
      fallback.setEnd(text, Math.min(1, text.length));
      const first = fallback.getBoundingClientRect();
      if (first.height > 0) return { range: fallback, top: first.top, scrollY: window.scrollY };
    }
  }
  return null;
}

export class ReadingNavigation {
  private outline: ReadingOutline;
  private host = document.createElement(READING_TAG);
  private shadow = this.host.attachShadow({ mode: "open" });
  private rail = el("nav", "rail");
  /** 章の木。章の行の中に、いま読んでいる章の節だけを入れる。縦に長いときはここだけが送れる */
  private tree = el("div", "tree");
  private chapterList = el("ol", "chapter-list");
  private sectionList = el("ol", "section-list");
  private rows: HTMLLIElement[] = [];
  private relatedBox = el("div", "related");
  /** 画面の組みの高さ（ブラウザのツールバーを畳んだときの高さ）を測る目盛り。読む人には見えない */
  private viewport = el("div", "viewport");
  private trigger = el("button", "trigger");
  private chapterLine = el("span", "chapter-line");
  private sectionLine = el("span", "section-line");
  private sheet = el("dialog", "sheet");
  private sheetHeader = el("div", "sheet-header");
  private sheetContent = el("div", "sheet-content");
  private links: HTMLAnchorElement[] = [];
  private chapter = -1;
  private section = -1;
  private displayedChapter = -1;
  private right = 0;
  private compact = true;
  private interacting = false;
  private focused = false;
  private queued = false;
  private resizing = false;
  private printing = false;
  private destroyed = false;
  private applying = false;
  private lastPosition: Position | null = null;
  private fingerprint = "";
  private resizeObserver: ResizeObserver | null = null;
  private mutationObserver: MutationObserver;
  private original: { left: string; right: string; top: string; transition: string; maxWidth: string; printWidth: string };
  private pageStyle = el("style");
  private stopWatchingTop: () => void = () => undefined;

  constructor(outline: ReadingOutline, private options: ReadingOptions) {
    this.outline = outline;
    const html = document.documentElement;
    this.original = { left: html.style.paddingLeft, right: html.style.paddingRight, top: html.style.paddingTop, transition: html.style.transition, maxWidth: outline.main.style.maxWidth, printWidth: getComputedStyle(outline.main).maxWidth };
    const style = el("style");
    style.textContent = READING_STYLES;
    this.viewport.setAttribute("aria-hidden", "true");
    this.shadow.append(style, this.viewport, this.rail, this.trigger, this.sheet);
    this.rail.setAttribute("aria-label", t("toolbox.reading.railLabel"));
    this.rail.append(this.tree, this.relatedBox);
    this.trigger.type = "button";
    this.trigger.setAttribute("aria-haspopup", "dialog");
    this.trigger.setAttribute("aria-expanded", "false");
    const copy = el("span", "trigger-copy");
    copy.append(this.chapterLine, this.sectionLine);
    const label = el("span", "trigger-label", t("toolbox.reading.contents"));
    label.append(icon(ICON_CHEVRON_DOWN, ICON_SIZE.small));
    this.trigger.append(copy, label);
    this.trigger.addEventListener("click", () => this.open());
    this.sheet.setAttribute("aria-label", t("toolbox.reading.sheetLabel"));
    this.sheet.append(this.sheetHeader, this.sheetContent);
    this.sheet.addEventListener("close", () => this.finishClose());
    this.sheet.addEventListener("cancel", (event) => { event.preventDefault(); this.close(); });
    this.sheet.addEventListener("keydown", (event) => {
      // 文書全体の Esc（コメント下書きの破棄・比較終了）へ渡さない。
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); this.close(); }
    });
    this.rail.addEventListener("pointerenter", () => { this.interacting = true; });
    this.rail.addEventListener("pointerleave", () => { this.interacting = false; this.queue(); });
    this.rail.addEventListener("focusin", () => { this.focused = true; });
    this.rail.addEventListener("focusout", () => { this.focused = false; this.queue(); });
    // 本文の index が旧目次を数えるため、削除しない。新しいUIは影の中にだけ置く。
    this.pageStyle.textContent = `${readingPageRules("html[data-surprise-reading]")}
      @media print {
        html[data-surprise-reading] { padding-left:${this.original.left || "0"} !important; padding-right:${this.original.right || "0"} !important; padding-top:${this.original.top || "0"} !important; }
        html[data-surprise-reading] main { max-width:${this.original.printWidth || "none"} !important; }
      }`;
    document.head.append(this.pageStyle);
    document.body.append(this.host);
    html.setAttribute("data-surprise-reading", "");
    this.buildRail();
    topInset.setScrollGap(READING_LAYOUT.edge);
    // 上端の帯に字を入れてから高さを測る。空の帯で測ると、字が入って帯が伸びるまでの 1 回の描画だけ、
    // 本文の上の余白が帯より狭くなり、本文が上へずれて戻る
    this.sync();
    this.layout();
    this.sync();
    this.remember();
    // ほかの帯（現在地の行・版の見比べ）の高さが変わったら、読んでいる場所を保ったまま置き直す。
    // 知らせが届くのは余白が動いたあとなので、戻す先は動く前に控えてあった場所
    this.stopWatchingTop = topInset.watch(() => { if (!this.applying) this.preserve(() => this.layout(), this.lastPosition); });
    window.addEventListener("scroll", this.onScroll, { passive: true });
    window.addEventListener("resize", this.onResize);
    window.addEventListener("hashchange", this.onHash);
    window.addEventListener("popstate", this.onHash);
    window.addEventListener("beforeprint", this.beforePrint);
    window.addEventListener("afterprint", this.afterPrint);
    this.mutationObserver = new MutationObserver((records) => {
      const changed = records.some(record => {
        const owner = record.target instanceof Element ? record.target : record.target.parentElement;
        if (owner?.closest("h1,h2,h3")) return true;
        return [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element && (node.matches("h1,h2,h3,article,details") || node.querySelector("h1,h2,h3")));
      });
      if (changed) this.refreshOutline();
      this.queue();
    });
    this.mutationObserver.observe(outline.main, { subtree: true, childList: true, characterData: true });
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.onResize());
      this.resizeObserver.observe(outline.main);
      this.resizeObserver.observe(this.trigger);
      const banner = document.querySelector(`[${VERSION_BANNER_MARK}]`);
      if (banner) this.resizeObserver.observe(banner);
    }
    outline.main.addEventListener("toggle", this.onResize, true);
    document.fonts?.ready.then(() => this.onResize());
    // ブラウザの初期アンカー移動後に、固定欄の余白を反映する。
    if (window.location.hash) requestAnimationFrame(this.onHash);
  }

  private entryLink(entry: ReadingEntry, number?: string): HTMLAnchorElement {
    const link = el("a", number ? "entry numbered" : "entry");
    if (number) {
      // 原本にある章番号は固定列へ移す。名前を書き直したり、番号を二重に足したりしない。
      const label = withoutReadingNumber(entry.title, number);
      link.append(el("span", "entry-number", number), el("span", "entry-title", label));
      link.setAttribute("aria-label", entry.title);
    } else link.textContent = entry.title;
    link.href = readingHref(window.location.href, entry.target.id);
    link.dataset.target = entry.target.id;
    link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      this.go(entry);
    });
    return link;
  }

  private addRelated(box: HTMLElement): void {
    box.replaceChildren();
    for (const related of this.outline.related) {
      const link = el("a", "", `${related.title} ↗`);
      link.href = related.href;
      box.append(link);
    }
    const top = el("a", "", t("toolbox.reading.top"));
    top.href = readingHref(window.location.href, "sp-top");
    top.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      this.close(false);
      const url = new URL(window.location.href); url.hash = "";
      history.pushState(null, "", url.href);
      window.scrollTo({ top: 0, behavior: "instant" });
      this.queue();
    });
    box.append(top);
  }

  private buildRail(): void {
    this.fingerprint = this.outline.chapters.map(ch => `${ch.target.id}:${ch.title}:${ch.sections.map(s => `${s.target.id}:${s.title}`).join("|")}`).join("\n");
    const title = el("p", "rail-title", t("toolbox.reading.overview"));
    title.append(el("span", "count", t("toolbox.reading.chapterCount", { count: this.outline.chapters.length })));
    this.chapterList.replaceChildren();
    this.links = [];
    this.rows = [];
    for (const [index, chapter] of this.outline.chapters.entries()) {
      const row = el("li", "chapter");
      const link = this.entryLink(chapter, String(index + 1).padStart(2, "0"));
      this.links.push(link); this.rows.push(row); row.append(link); this.chapterList.append(row);
    }
    this.sectionList.remove();
    this.tree.replaceChildren(title, this.chapterList);
    this.addRelated(this.relatedBox);
    this.displayedChapter = -1;
  }

  private refreshOutline(): void {
    const next = readOutline(document);
    if (!next) return;
    const fingerprint = next.chapters.map(ch => `${ch.target.id}:${ch.title}:${ch.sections.map(s => `${s.target.id}:${s.title}`).join("|")}`).join("\n");
    if (fingerprint === this.fingerprint) return;
    this.outline = next;
    this.buildRail();
    if (this.sheet.open) this.showChapters();
  }

  private get bannerHeight(): number {
    const banner = document.querySelector(`[${VERSION_BANNER_MARK}]`);
    return banner?.getBoundingClientRect().height ?? 0;
  }
  /** 自分より上にある帯（環境の帯・現在地の行・版の見比べ）と、過去の版の帯の下。 */
  private get baseTop(): number { return topInset.above("reading") + this.bannerHeight; }
  get top(): number { return this.baseTop + (this.compact ? this.trigger.getBoundingClientRect().height : 0); }
  /**
   * 左の目次を出すかを決める高さ。見えている高さ（innerHeight）ではなく、ツールバーを畳んだときの組みの高さで決める——
   * iPad の Safari は上へ戻すたびにツールバーを出して見えている高さだけを縮めるので、それで決めると左の目次と
   * 上端の帯がスクロールのたびに入れ替わる。ツールバーが出ている間は左の目次の下端だけが上がり、章の木はその中で送れる。
   * ツールバーが畳まれない画面（パソコン）では、見えている高さと同じ値になる
   */
  private get layoutHeight(): number {
    return Math.max(window.innerHeight, this.viewport.getBoundingClientRect().height);
  }
  /** 読み始めの上部2割を見る。見出しの上の余白や出典行だけを現在地にしない。 */
  private get readingLine(): number {
    return this.top + Math.max(READING_LAYOUT.edge * 2, Math.min(READING_LAYOUT.readingLineMax, (window.innerHeight - this.top) * READING_LAYOUT.readingLineFraction));
  }

  /** コメントと現在地帯で余白の持ち主を取り合わない。 */
  setPanel(width: number): void {
    if (this.right === width) return;
    this.preserve(() => { this.right = width; this.layout(); });
  }

  private preserve(change: () => void, position = capturePosition(this.outline.main, this.readingLine)): void {
    const atTop = window.scrollY <= READING_LAYOUT.edge;
    change();
    if (position && position.range.startContainer.isConnected) {
      // 控えたあとに指で進めたぶんは読む人の操作なので戻さない。直すのは折り返しや余白で本文が動いたぶんだけ。
      // スマホのアドレスバーの出入り（高さだけの resize）では本文は動かないので、何もしない（戻すと「カクッ」と見え、慣性も止まる）。
      const expected = position.top - (window.scrollY - position.scrollY);
      const shift = position.range.getBoundingClientRect().top - expected;
      if (Math.abs(shift) > 1) {
        const difference = shift + expected - Math.max(expected, this.top + READING_LAYOUT.edge);
        if (Math.abs(difference) > 1) window.scrollBy({ top: difference, behavior: "instant" });
      }
    } else if (atTop) window.scrollTo({ top: 0, behavior: "instant" });
    this.sync();
    this.remember();
  }

  private layout(): void {
    if (this.printing || this.destroyed) return;
    const html = document.documentElement;
    const available = html.clientWidth - this.right;
    const baseTop = this.baseTop;
    this.host.style.setProperty("--reading-top", `${baseTop}px`);
    this.host.style.setProperty("--reading-right", `${this.right}px`);
    this.host.style.setProperty("--reading-left", `${Math.max(READING_LAYOUT.edge, (available - READING_LAYOUT.minWidth) / 2 + READING_LAYOUT.edge)}px`);
    this.rail.hidden = false;
    const rowHeight = Number.parseFloat(getComputedStyle(this.host).getPropertyValue("--size-touch")) || 44;
    // 章の行と節の最小行数ぶんが入るか。いま読んでいる章の節の数は数えない（章を移るたびに
    // 小型と左目次を行き来しないため）。節が多い章は木の中で送る
    const titleHeight = this.tree.firstElementChild?.getBoundingClientRect().height ?? 0;
    const chapterHeight = this.links.reduce((sum, link) => sum + link.getBoundingClientRect().height, 0);
    const needed = titleHeight + chapterHeight + rowHeight * READING_LAYOUT.minSectionRows + this.relatedBox.offsetHeight + rowHeight + READING_LAYOUT.edge * 4;
    // 左の目次を出せる幅か。コメントの板が開いていない間は画面の幅（スクロールバーを含む）で見る——配信のときに先に描く目次
    // （src/lib/first-paint/chrome.ts）は CSS の画面の大きさの条件で同じ判断をするので、見る幅をそろえる（そろえないと、
    // スクロールバーが場所を取る環境で境目の幅だけ、届いた瞬間に左の目次と上端の帯が入れ替わる）
    const room = this.right === 0 ? window.innerWidth : available;
    this.compact = room < READING_LAYOUT.minWidth || this.layoutHeight - baseTop < needed;
    this.rail.hidden = this.compact;
    this.trigger.hidden = !this.compact;
    const readingTop = this.compact ? this.trigger.getBoundingClientRect().height : 0;
    html.style.transition = "none";
    html.style.paddingRight = this.right ? `${this.right}px` : this.original.right;
    html.style.paddingLeft = this.compact ? this.original.left : `${READING_LAYOUT.railWidth + READING_LAYOUT.gap}px`;
    this.outline.main.style.maxWidth = `${READING_LAYOUT.bodyWidth}px`;
    // 上の余白は、上端の帯の持ち主が配る。届けるのは自分の帯の高さだけ（届けた知らせで、もう一度置き直さない）
    this.applying = true;
    topInset.set("reading", readingTop);
    this.applying = false;
  }

  private sync(force = false): void {
    if (this.destroyed) return;
    // スクロール先は整数に丸められることがあるので、1px の端数は同じ場所とみなす。
    const line = this.readingLine + 1;
    const atEnd = window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;
    const chapter = Math.max(0, activeReadingEntry(this.outline.chapters, atEnd ? Number.POSITIVE_INFINITY : line));
    const current = this.outline.chapters[chapter];
    if (!current) return;
    const section = activeReadingEntry(current.sections, atEnd ? Number.POSITIVE_INFINITY : line);
    this.chapter = chapter;
    this.section = section;
    this.chapterLine.textContent = t("toolbox.reading.chapterLine", { at: String(chapter + 1).padStart(2, "0"), total: String(this.outline.chapters.length).padStart(2, "0"), title: withoutReadingNumber(current.title, String(chapter + 1)) });
    this.sectionLine.textContent = current.sections[section]?.title ?? t("toolbox.reading.chapterStart");
    this.trigger.title = t("toolbox.reading.triggerTitle", { chapter: current.title, section: this.sectionLine.textContent });
    this.links.forEach((link, index) => {
      if (index === chapter) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
    if (!force && (this.interacting || this.focused)) return;
    if (this.displayedChapter !== chapter) {
      const list = current.sections.map((entry, index) => { const row = el("li"); row.append(this.entryLink(entry, `${chapter + 1}.${index + 1}`)); return row; });
      this.sectionList.replaceChildren(...list);
      // 節は、その章の行の中に字下げして入れる。章の外に別の枠で出すと、どの章の節かを
      // 読む人が見出しの文で突き合わせることになる
      this.sectionList.remove();
      if (list.length) this.rows[chapter]?.append(this.sectionList);
      this.displayedChapter = chapter;
      // 明示移動の直後は、移動前の控えへ戻してはいけない。新しい場所を測ってから整える。
      requestAnimationFrame(() => {
        if (!this.destroyed) this.preserve(() => this.layout());
      });
    }
    const selected = current.sections[section]?.target.id;
    let focus: HTMLElement | undefined = this.links[chapter];
    for (const link of this.sectionList.querySelectorAll("a")) {
      const active = link.dataset.target === selected;
      if (active) { link.setAttribute("aria-current", "location"); focus = link; }
      else link.removeAttribute("aria-current");
    }
    // 木が縦に長いときは、いま読んでいる行が見える位置まで木だけを送る
    if (focus && !this.compact) {
      const row = focus.getBoundingClientRect(), container = this.tree.getBoundingClientRect();
      if (row.top < container.top) this.tree.scrollTop += row.top - container.top;
      else if (row.bottom > container.bottom) this.tree.scrollTop += row.bottom - container.bottom;
    }
  }

  private sheetFrame(back: boolean): void {
    const title = el("h2", "sheet-title", t("toolbox.reading.chapterCount", { count: this.outline.chapters.length }));
    let first: HTMLElement = title;
    if (back) {
      const button = el("button", "control", `‹ ${t("toolbox.reading.chapterCount", { count: this.outline.chapters.length })}`);
      button.type = "button";
      button.addEventListener("click", () => { this.showChapters(); this.sheetHeader.querySelector("button")?.focus(); });
      first = button;
    }
    const close = el("button", "control", t("toolbox.common.close"));
    close.type = "button";
    close.addEventListener("click", () => this.close());
    this.sheetHeader.replaceChildren(first, close);
    this.sheetContent.replaceChildren();
    this.sheetContent.scrollTop = 0;
  }

  private showChapters(): void {
    this.sheetFrame(false);
    const list = el("ol");
    this.outline.chapters.forEach((chapter, index) => {
      const row = el("li", "chapter-row");
      const link = this.entryLink(chapter, String(index + 1).padStart(2, "0"));
      if (index === this.chapter) link.setAttribute("aria-current", "location");
      row.append(link);
      if (index === this.chapter) row.append(el("p", "current-note", t("toolbox.reading.current", { section: chapter.sections[this.section]?.title ?? t("toolbox.reading.chapterStart") })));
      if (chapter.sections.length) {
        const extra = el("div", "chapter-extra");
        const drill = el("button", "control drill", `${t("toolbox.reading.sectionCount", { count: chapter.sections.length })} ›`);
        drill.type = "button";
        drill.setAttribute("aria-label", t("toolbox.reading.drillLabel", { chapter: chapter.title, count: chapter.sections.length }));
        drill.addEventListener("click", () => this.showSections(index));
        extra.append(drill); row.append(extra);
      }
      list.append(row);
    });
    const related = el("div", "related");
    this.addRelated(related);
    this.sheetContent.append(list, related);
  }

  private showSections(index: number): void {
    const chapter = this.outline.chapters[index];
    if (!chapter) return;
    this.sheetFrame(true);
    const heading = el("h2", "sheet-heading", chapter.title);
    const list = el("ol", "section-entries");
    chapter.sections.forEach((entry, i) => {
      const row = el("li");
      const link = this.entryLink(entry, `${index + 1}.${i + 1}`);
      if (index === this.chapter && i === this.section) link.setAttribute("aria-current", "location");
      row.append(link); list.append(row);
    });
    this.sheetContent.append(heading, list);
    this.sheetHeader.querySelector("button")?.focus();
  }

  open(): void {
    if (this.sheet.open) return;
    this.options.onDialogChange(true);
    this.showChapters();
    this.trigger.setAttribute("aria-expanded", "true");
    this.sheet.showModal();
  }
  close(restoreFocus = true): void {
    if (!this.sheet.open) return;
    this.sheet.close();
    this.finishClose();
    if (restoreFocus && this.compact) this.trigger.focus({ preventScroll: true });
  }
  private finishClose(): void {
    // close は非同期でも届く。閉じた直後に開き直した目次には触らない。
    if (this.sheet.open) return;
    this.trigger.setAttribute("aria-expanded", "false");
    this.options.onDialogChange(false);
  }

  private go(entry: ReadingEntry): void {
    this.close(false);
    revealReadingTarget(entry.target);
    this.layout();
    history.pushState(null, "", readingHref(window.location.href, entry.target.id));
    entry.target.scrollIntoView({ block: "start", behavior: "instant" });
    const previous = entry.target.getAttribute("tabindex");
    entry.target.tabIndex = -1;
    entry.target.focus({ preventScroll: true });
    entry.target.addEventListener("blur", () => {
      if (previous === null) entry.target.removeAttribute("tabindex");
      else entry.target.setAttribute("tabindex", previous);
    }, { once: true });
    this.sync(true);
    this.remember();
  }

  private remember(): void { this.lastPosition = capturePosition(this.outline.main, this.readingLine); }
  private queue(): void {
    if (this.queued || this.printing || this.destroyed) return;
    this.queued = true;
    requestAnimationFrame(() => { this.queued = false; this.sync(); this.remember(); });
  }
  private onScroll = (): void => this.queue();
  private onResize = (): void => {
    if (this.resizing || this.printing || this.destroyed) return;
    this.resizing = true;
    const position = this.lastPosition;
    requestAnimationFrame(() => {
      this.preserve(() => this.layout(), position);
      this.resizing = false;
    });
  };
  private onHash = (): void => {
    this.close(false);
    let id: string;
    try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    if (target instanceof HTMLElement && this.outline.main.contains(target)) {
      revealReadingTarget(target);
      this.layout();
      target.scrollIntoView({ block: "start", behavior: "instant" });
    }
    this.queue();
  };
  private beforePrint = (): void => { this.printing = true; this.close(false); };
  private afterPrint = (): void => { this.printing = false; this.layout(); this.queue(); };

  destroy(): void {
    this.close(false);
    this.destroyed = true;
    window.removeEventListener("scroll", this.onScroll);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("hashchange", this.onHash);
    window.removeEventListener("popstate", this.onHash);
    window.removeEventListener("beforeprint", this.beforePrint);
    window.removeEventListener("afterprint", this.afterPrint);
    this.outline.main.removeEventListener("toggle", this.onResize, true);
    this.resizeObserver?.disconnect();
    this.mutationObserver.disconnect();
    const html = document.documentElement;
    html.removeAttribute("data-surprise-reading");
    html.style.paddingLeft = this.original.left; html.style.paddingRight = this.original.right;
    this.stopWatchingTop();
    topInset.set("reading", 0);
    topInset.setScrollGap(0);
    html.style.transition = this.original.transition;
    this.outline.main.style.maxWidth = this.original.maxWidth;
    this.host.remove(); this.pageStyle.remove();
  }
}

/**
 * 目次を組み立てる。配信のときに先に描いた目次（src/lib/first-paint/chrome.ts。同じ形・同じ場所の、押せない写し）があれば、
 * 本物を置く同じ処理の中で外す——間に描画が挟まらないので、入れ替わりは目に見えない。
 */
export function mountReadingNavigation(options: ReadingOptions): ReadingNavigation | null {
  for (const early of document.querySelectorAll(`${READING_TAG}[${FIRST_PAINT_MARK}]`)) early.remove();
  if (document.querySelector(READING_TAG)) return null;
  const outline = readOutline(document);
  return outline ? new ReadingNavigation(outline, options) : null;
}
