import { t } from "../shared/i18n";
import { NOTE_CHROME_CSS } from "./note-styles";
import { noteEditorClasses } from "./note-schema";
import { ICON_SIZE } from "../shared/tokens";
import { el, icon, HOST_TAG } from "../shared/util";

/**
 * メモ帳の編集の部品のうち、本文と別の根（Shadow DOM）に置く部品（取っ手・落ちる先の線・ブロックの一覧・
 * URL の小窓・保存の 1 行・キーボードの上の道具）。本文の字には 1 つも触らない。
 */

const ICON_GRIP = [5, 12, 19].flatMap((y) => [9, 15].map((x) => `M${x} ${y - 1}a1 1 0 1 0 0 2a1 1 0 1 0 0-2z`));
const ICON_PLUS = ["M5 12h14", "M12 5v14"];

/** 一覧の 1 行。`hint` は右端の薄い案内（近道の札か、行頭に打つ印）。 */
export type MenuChoice = { id: string; label: string; icon: readonly string[]; hint: string };
type MenuSpec = { x: number; y: number; label: string; choices: readonly MenuChoice[]; index: number; pick: (id: string) => void };
/** 保存の 1 行。押せる操作は 2 つまで（控えを「戻す」「捨てる」）。 */
export type StatusAction = { label: string; run: () => void };
export type StatusSpec = { text: string; actions?: readonly StatusAction[] };
/** キーボードの上の道具の 1 つ（src/widget/editor/note-touch.ts）。 */
export type ToolbarItem = { id: string; label: string; icon: readonly string[]; run: () => void };
/** つかみ始め。取っ手を押した指先（ポインタ）か、行を長押しした指の高さ（タッチ）。 */
export type DragStart = PointerEvent | { touchY: number };
type DragSpec = { target: (y: number) => { index: number; top: number; left: number; width: number }; drop: (index: number) => void; end?: () => void };

/**
 * 編集の部品が本文に持ち込むクラス（絵・トグル・表・埋め込みのブロック）を、開いたときに見た目の道具（Tailwind）へ先に見せておく。
 * 道具は本文に知らないクラスが現れるたびに、絵を描く前（同じ手番の続き）で CSS を丸ごと組み直す。まだ絵の無いメモに
 * 落とすと、その組み直しが「落としてから絵が出るまで」にそのまま乗る。
 * 置き場は部品の根（Shadow DOM）の持ち主の素の子。スロットが無いので描かれず、部品の一覧にも本文の文字にも出ない。
 * クラスはスキーマと同じ一覧から採る（書き写さない・src/widget/editor/note-schema.ts の noteEditorClasses）。
 */
function classCarriers(): HTMLElement[] {
  // 編集の芯（ProseMirror）が空の行（落とした直後の添え書きなど）の末尾に置く改行の印も同じ扱い
  const classes = [...noteEditorClasses(), "ProseMirror-trailingBreak"];
  const carriers = classes.map((className) => {
    const carrier = document.createElement("span");
    carrier.className = className;
    return carrier;
  });
  return carriers;
}

/** 本文と別の根に置く部品。色は道具箱の色の名前だけ、色を持つのは落ちる先の線だけ。 */
export class Chrome {
  private readonly host: HTMLElement;
  private readonly root: ShadowRoot;
  private readonly handle: HTMLElement;
  private readonly lineEl: HTMLElement;
  private menuEl: HTMLElement | null = null;
  private linkEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private toolbarEl: HTMLElement | null = null;
  dragging = false;
  onPlus: () => void = () => undefined;
  onGrab: (event: PointerEvent) => void = () => undefined;

  constructor() {
    this.host = document.createElement("sp-note-chrome");
    this.root = this.host.attachShadow({ mode: "open" });
    const style = el("style");
    style.textContent = NOTE_CHROME_CSS;
    this.handle = el("div", "handle");
    const plus = el("button");
    plus.type = "button";
    plus.setAttribute("aria-label", t("notes.editor.add"));
    plus.title = t("notes.editor.add");
    plus.append(icon(ICON_PLUS, ICON_SIZE.medium));
    plus.addEventListener("click", () => this.onPlus());
    const grip = el("button", "grip");
    grip.type = "button";
    grip.setAttribute("aria-label", t("notes.editor.handle"));
    grip.title = t("notes.editor.handle");
    grip.append(icon(ICON_GRIP, ICON_SIZE.medium));
    grip.addEventListener("pointerdown", (event) => this.onGrab(event));
    this.handle.append(plus, grip);
    this.lineEl = el("div", "line");
    this.root.append(style, this.handle, this.lineEl);
    this.host.append(...classCarriers());
    document.body.append(this.host);
  }

  showHandle(dom: HTMLElement, listItem: boolean): void {
    const rect = dom.getBoundingClientRect();
    const line = Number.parseFloat(getComputedStyle(dom).lineHeight);
    const lineHeight = Number.isFinite(line) ? line : 24;
    // 箇条書きの行は、行頭の印（字の外側に約 20px）のさらに左へ
    const left = rect.left - (listItem ? 20 : 0) - 52;
    this.handle.style.left = `${Math.max(4, left)}px`;
    this.handle.style.top = `${rect.top + Math.max(0, (Math.min(lineHeight, rect.height) - 24) / 2)}px`;
    this.handle.classList.add("is-shown");
  }

  hideHandle(): void {
    if (this.dragging || !this.handle.classList.contains("is-shown")) return;
    this.handle.classList.remove("is-shown");
  }

  line(target: { top: number; left: number; width: number } | null): void {
    if (target === null) {
      this.lineEl.classList.remove("is-shown");
      return;
    }
    this.lineEl.style.top = `${target.top - 1}px`;
    this.lineEl.style.left = `${target.left}px`;
    this.lineEl.style.width = `${target.width}px`;
    this.lineEl.classList.add("is-shown");
  }

  /** つかんで動かす。写しが指に付いてきて、落ちる先に線が出る。端では画面が送られ、Escape でやめる。 */
  drag(start: DragStart, dom: HTMLElement, listItem: boolean, spec: DragSpec): void {
    const touch = "touchY" in start;
    if (!touch) {
      start.preventDefault();
      const grip = start.currentTarget instanceof HTMLElement ? start.currentTarget : null;
      grip?.setPointerCapture(start.pointerId);
    }
    const startY = touch ? start.touchY : start.clientY;
    this.dragging = true;
    const rect = dom.getBoundingClientRect();
    const ghost = document.createElement("div");
    ghost.setAttribute("data-note-ghost", "");
    ghost.setAttribute("aria-hidden", "true");
    const cloned = dom.cloneNode(true);
    let copy: HTMLElement = cloned instanceof HTMLElement ? cloned : document.createElement("div");
    if (listItem && dom.parentElement !== null) {
      // 箇条書きの 1 行は、行頭の印が出るように同じ入れ物で包む
      const wrapper = document.createElement(dom.parentElement.tagName.toLowerCase());
      wrapper.className = dom.parentElement.className;
      wrapper.append(copy);
      copy = wrapper;
    }
    ghost.append(copy);
    ghost.style.width = `${rect.width}px`;
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    document.body.append(ghost);
    const offsetY = startY - rect.top;
    let y = startY;
    let index: number | null = null;
    let frame = 0;
    const place = (): void => {
      ghost.style.top = `${y - offsetY}px`;
      const target = spec.target(y);
      index = target.index;
      this.line(target);
    };
    const scroll = (): void => {
      const edge = 64;
      const speed = y < edge ? -Math.ceil((edge - y) / 4) : y > window.innerHeight - edge ? Math.ceil((y - (window.innerHeight - edge)) / 4) : 0;
      if (speed !== 0) {
        window.scrollBy(0, speed);
        place();
      }
      frame = window.requestAnimationFrame(scroll);
    };
    frame = window.requestAnimationFrame(scroll);
    place();
    const move = (next: PointerEvent): void => {
      y = next.clientY;
      place();
    };
    // 指でつかんだ間は、画面の送りを止めて指に付いてくる（受け口は送りを止められる形で付ける）
    const touchMove = (next: TouchEvent): void => {
      next.preventDefault();
      const point = next.touches[0];
      if (point === undefined) return;
      y = point.clientY;
      place();
    };
    const finish = (commit: boolean): void => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("touchmove", touchMove);
      window.removeEventListener("touchend", up);
      window.removeEventListener("touchcancel", cancel);
      window.removeEventListener("keydown", key, true);
      ghost.remove();
      this.line(null);
      this.dragging = false;
      spec.end?.();
      this.hideHandle();
      if (commit && index !== null) spec.drop(index);
    };
    const up = (): void => finish(true);
    const cancel = (): void => finish(false);
    const key = (next: KeyboardEvent): void => {
      if (next.key !== "Escape") return;
      next.preventDefault();
      next.stopPropagation();
      finish(false);
    };
    if (touch) {
      window.addEventListener("touchmove", touchMove, { passive: false });
      window.addEventListener("touchend", up);
      window.addEventListener("touchcancel", cancel);
    } else {
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
    }
    window.addEventListener("keydown", key, true);
  }

  menu(spec: MenuSpec | null): void {
    if (spec === null) {
      this.menuEl?.remove();
      this.menuEl = null;
      return;
    }
    const menu = this.menuEl ?? el("div", "menu");
    if (this.menuEl === null) {
      menu.setAttribute("role", "listbox");
      // 押しても本文の焦点を奪わない（打っている行のまま選べる）
      menu.addEventListener("mousedown", (event) => event.preventDefault());
      this.root.append(menu);
      this.menuEl = menu;
    }
    // 表の中では表の操作の一覧になるので、名前は開くたびに付け直す
    menu.setAttribute("aria-label", spec.label);
    menu.replaceChildren();
    if (spec.choices.length === 0) menu.append(el("div", "empty", t("notes.editor.menuEmpty")));
    spec.choices.forEach((choice, at) => {
      const row = el("div");
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", at === spec.index ? "true" : "false");
      row.append(icon(choice.icon, ICON_SIZE.medium), el("span", undefined, choice.label));
      if (choice.hint.length > 0) row.append(el("span", "hint", choice.hint));
      row.addEventListener("click", () => spec.pick(choice.id));
      menu.append(row);
      if (at === spec.index) row.scrollIntoView({ block: "nearest" });
    });
    const height = Math.min(menu.offsetHeight || 320, 320);
    // 画面のキーボードが出ている指の画面では、見えている範囲（visualViewport）の下端で折り返す（キーボードの裏に隠さない）
    const visible = window.visualViewport === null ? window.innerHeight : window.visualViewport.offsetTop + window.visualViewport.height;
    const below = spec.y + 4 + height < visible;
    menu.style.left = `${Math.min(spec.x, window.innerWidth - 240)}px`;
    menu.style.top = `${below ? spec.y + 4 : Math.max(8, spec.y - height - 28)}px`;
    menu.style.maxHeight = "320px";
    menu.style.overflowY = "auto";
  }

  /** URL を 1 つ受ける小窓（リンク・埋め込み）。`label` は読み上げの名前。 */
  link(spec: { x: number; y: number; label: string; value: string; done: (href: string) => void; cancel: () => void }): void {
    this.linkEl?.remove();
    const box = el("div", "link");
    const input = el("input");
    input.type = "url";
    input.value = spec.value;
    input.placeholder = "https://";
    input.setAttribute("aria-label", spec.label);
    box.append(input);
    box.style.left = `${Math.min(spec.x, window.innerWidth - 300)}px`;
    box.style.top = `${spec.y + 4}px`;
    // 焦点のある欄を外すとブラウザは外している途中に blur を送る。その blur から 2 度目の close が走って remove が例外を投げ、
    // Enter で入れた URL が捨てられる。先に印を外してから取り除く（2 度目は何もしない）
    let closed = false;
    const close = (): void => {
      if (closed) return;
      closed = true;
      if (this.linkEl === box) this.linkEl = null;
      box.remove();
    };
    input.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "Enter") {
        event.preventDefault();
        close();
        spec.done(input.value);
      } else if (event.key === "Escape") {
        event.preventDefault();
        close();
        spec.cancel();
      }
    });
    input.addEventListener("blur", () => {
      if (this.linkEl === box) close();
    });
    this.root.append(box);
    this.linkEl = box;
    input.focus();
  }

  /**
   * 保存の 1 行（失敗のときだけ）。道具箱の上に置き、保存が戻るまで残す。
   * 入れられなかったファイルなど 1 回きりの失敗はここに出さず、道具箱の知らせで告げる（時計で消える 1 行を作らない）。
   */
  status(spec: StatusSpec | null): void {
    if (spec === null) {
      this.statusEl?.remove();
      this.statusEl = null;
      return;
    }
    const line = this.statusEl ?? el("div", "status");
    line.setAttribute("role", "status");
    line.replaceChildren(el("span", undefined, spec.text));
    for (const action of spec.actions ?? []) {
      const button = el("button", undefined, action.label);
      button.type = "button";
      button.addEventListener("click", () => action.run());
      line.append(button);
    }
    if (this.statusEl === null) {
      this.root.append(line);
      this.statusEl = line;
    }
    // 道具箱（右下）の上に置く
    const toolbox = document.querySelector(HOST_TAG)?.shadowRoot?.querySelector(".bar");
    const anchor = toolbox instanceof HTMLElement ? toolbox.getBoundingClientRect() : null;
    line.style.right = `${anchor !== null ? Math.max(16, window.innerWidth - anchor.right) : 16}px`;
    line.style.bottom = `${anchor !== null ? window.innerHeight - anchor.top + 8 : 16}px`;
  }

  /**
   * キーボードの上の 1 列の道具。見えている範囲の下端（画面のキーボードの上端）から `bottom` だけ上に置く。
   * 押しても本文の焦点を奪わない（打っている行のまま当てる）。
   */
  toolbar(spec: { bottom: number; items: readonly ToolbarItem[] } | null): void {
    if (spec === null) {
      this.toolbarEl?.remove();
      this.toolbarEl = null;
      return;
    }
    const bar = this.toolbarEl ?? el("div", "toolbar");
    if (this.toolbarEl === null) {
      bar.setAttribute("role", "toolbar");
      bar.setAttribute("aria-label", t("notes.editor.toolbar"));
      bar.addEventListener("pointerdown", (event) => event.preventDefault());
      bar.addEventListener("mousedown", (event) => event.preventDefault());
      this.root.append(bar);
      this.toolbarEl = bar;
    }
    bar.replaceChildren(...spec.items.map((item) => {
      const button = el("button");
      button.type = "button";
      button.setAttribute("aria-label", item.label);
      button.title = item.label;
      button.append(icon(item.icon, ICON_SIZE.medium));
      button.addEventListener("click", () => item.run());
      return button;
    }));
    // 道具箱（右下の「終える」）が同じ高さに見えていたら、その上に置く（重ねると「終える」が押せない）
    const toolbox = document.querySelector(HOST_TAG)?.shadowRoot?.querySelector(".bar");
    const anchor = toolbox instanceof HTMLElement ? toolbox.getBoundingClientRect() : null;
    const band = window.innerHeight - spec.bottom;
    const lifted = anchor !== null && anchor.height > 0 && anchor.bottom > band - 64 && anchor.top < band ? window.innerHeight - anchor.top + 8 : spec.bottom;
    bar.style.bottom = `${lifted}px`;
  }

  dispose(): void {
    this.host.remove();
  }
}

