/**
 * ページ右上の「書き出す」口。
 *
 * 投稿された HTML に当初からある PDF ボタンを、アイコンだけにしてメニューにする。
 * 配信し直さなくても既存のページに乗るよう、道具箱とは別にページ側へ差し込む。
 * 社外の人の画面にも PDF ボタンは元からあるので、そこを置き換えるだけなら
 * コメントの道具箱を組み立てたことにはならない。
 *
 * コメントを含めるかは、道具箱が出せる相手にだけ見せる。
 */

import { writeClipboardText } from "../../lib/workspace/clipboard";
import { type PageComment } from "../../lib/comments/types";
import { t } from "../shared/i18n";
import { SUCCESS_LIFE_MS } from "../shared/toast";
import { ICON_SIZE, TOKENS } from "../shared/tokens";
import {
  COPY_CHECK_STROKE,
  EXPORT_TAG,
  ICON_CHECK,
  ICON_DOWNLOAD,
  download,
  el,
  icon,
  readStored,
  writeStored,
} from "../shared/util";

export { EXPORT_TAG };

const STORAGE_COMMENTS = "surprise-pages:export:include-comments";

const STYLES = `${TOKENS}
:host {
  position: relative;
  display: inline-flex;
  z-index: 2147483001;
  font-family: 'Noto Sans JP', 'Inter', -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif;
  font-size: var(--font-base);
  line-height: var(--leading-normal);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}
*, *::before, *::after { box-sizing: border-box; }
button { font: inherit; color: inherit; background: transparent; border: 0; padding: 0; cursor: pointer; }
:focus-visible { outline: var(--rule-thick) solid var(--accent); outline-offset: var(--rule-thick); }
.icon { display: inline-flex; align-items: center; flex: none; }
.icon svg { display: block; }
[hidden] { display: none !important; }

.trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--size-control);
  height: var(--size-control);
  border-radius: var(--radius-sm);
  color: var(--muted);
  transition: background var(--duration) var(--ease), color var(--duration) var(--ease);
}
.trigger:hover { background: var(--surface-sunken); color: var(--text); }
.trigger.is-open { color: var(--text); }

.menu {
  position: absolute;
  right: 0;
  top: calc(100% + var(--space-1));
  min-width: var(--size-bubble-max);
  padding: var(--space-1);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.item {
  display: inline-flex;
  align-items: center;
  min-height: var(--size-touch);
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--font-base);
  color: var(--muted);
  text-align: left;
  white-space: nowrap;
  transition: background var(--duration) var(--ease), color var(--duration) var(--ease);
}
.item:hover { background: var(--surface-sunken); color: var(--text); }
.rule {
  height: var(--rule-thin);
  margin: var(--space-1) 0;
  background: var(--border-light);
  border: 0;
}
.check-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--size-touch);
  padding: 0 var(--space-3);
  cursor: pointer;
  user-select: none;
}
.check-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.check-mark {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--size-check);
  height: var(--size-check);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-sm);
  color: transparent;
  transition: background var(--duration) var(--ease), border-color var(--duration) var(--ease),
    color var(--duration) var(--ease);
}
.check-input:checked + .check-mark {
  background: var(--muted);
  border-color: var(--muted);
  color: var(--surface);
}
.check-label {
  font-size: var(--font-base);
  color: var(--muted);
  transition: color var(--duration) var(--ease);
}
.check-input:checked ~ .check-label { color: var(--text); }
@media (hover: hover) {
  .check-row:hover .check-mark { border-color: var(--accent); }
  .check-row:hover .check-label { color: var(--text); }
}
.check-input:focus-visible + .check-mark {
  border-color: var(--accent);
  box-shadow: 0 0 0 var(--rule-thick) var(--accent-soft);
}
@media print {
  :host { display: none !important; }
}
`;

type ExportSource = {
  comments: () => readonly PageComment[];
};

let source: ExportSource = { comments: () => [] };
let commentsAvailable = false;
const hosts = new Set<PageExportElement>();

export function bindExportSource(next: ExportSource): void {
  source = next;
}

export function setExportCommentsAvailable(on: boolean): void {
  commentsAvailable = on;
  for (const host of hosts) host.sync();
}

function includeComments(): boolean {
  return commentsAvailable && readStored(STORAGE_COMMENTS) === "1";
}

function pageUrl(): string {
  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
}

function markdownFileName(): string {
  const path = window.location.pathname.replace(/\/+$/, "");
  const parts = path.split("/").filter((part) => part.length > 0 && part !== "internal" && part !== "public");
  const base = parts.join("-");
  return `${base.length > 0 ? base : "page"}.md`;
}

/**
 * 本文の書き出しの部品。スライドの設定（と入力の確かめの部品）を連れてくるので、最初の読み込みには入れず、
 * 書き出しの入口を置いたあと手が空いてから読む（押した瞬間には読み終えている・docs/design/app-speed.md）。
 */
type MarkdownModule = typeof import("../../lib/pages/markdown");
let markdownModule: MarkdownModule | null = null;
let markdownLoading: Promise<MarkdownModule> | null = null;
function loadMarkdown(): Promise<MarkdownModule> {
  markdownLoading ??= import("../../lib/pages/markdown").then((loaded) => {
    markdownModule = loaded;
    return loaded;
  }, (error: unknown) => {
    markdownLoading = null;
    throw error;
  });
  return markdownLoading;
}
function warmMarkdown(): void {
  const go = (): void => { loadMarkdown().catch(() => undefined); };
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(go, { timeout: 5000 });
  else window.setTimeout(go, 1500);
}
/** 読み終えていれば、押した操作の中でそのまま書き出す（コピーは押した操作の中でないと断る端末がある）。まだなら読んでから。 */
function withMarkdown(run: (markdown: string) => void): void {
  if (markdownModule !== null) { run(currentMarkdown(markdownModule)); return; }
  void loadMarkdown().then((loaded) => run(currentMarkdown(loaded)), () => undefined);
}

function currentMarkdown({ pageToMarkdown }: MarkdownModule): string {
  const title = document.title.trim();
  return pageToMarkdown({
    title: title.length > 0 ? title : null,
    url: pageUrl(),
    root: document.body,
    comments: includeComments() ? source.comments() : null,
  });
}

function triggerLook(copied: boolean): { paths: readonly string[]; label: string } {
  if (copied) return { paths: ICON_CHECK, label: t("toolbox.common.copied") };
  return { paths: ICON_DOWNLOAD, label: t("toolbox.export.trigger") };
}

class PageExportElement extends HTMLElement {
  #root: ShadowRoot;
  #sheet: HTMLStyleElement;
  #open = false;
  #copied = false;
  #copiedTimer = 0;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
    this.#sheet = el("style");
    this.#sheet.textContent = STYLES;
    this.#root.appendChild(this.#sheet);
  }

  connectedCallback(): void {
    hosts.add(this);
    this.sync();
    document.addEventListener("click", this.#onDocumentClick, true);
    document.addEventListener("keydown", this.#onKey);
  }

  disconnectedCallback(): void {
    hosts.delete(this);
    document.removeEventListener("click", this.#onDocumentClick, true);
    document.removeEventListener("keydown", this.#onKey);
    window.clearTimeout(this.#copiedTimer);
  }

  sync(): void {
    this.#render();
  }

  #onDocumentClick = (event: Event): void => {
    if (!this.#open) return;
    const path = event.composedPath();
    if (path.includes(this)) return;
    this.#open = false;
    this.#render();
  };

  #onKey = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !this.#open) return;
    this.#open = false;
    this.#render();
  };

  #paintTrigger(button: HTMLButtonElement): void {
    const look = triggerLook(this.#copied);
    button.title = look.label;
    button.setAttribute("aria-label", look.label);
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", this.#open ? "true" : "false");
    button.className = this.#open ? "trigger is-open" : "trigger";
    const stroke = this.#copied ? COPY_CHECK_STROKE : 2;
    const next = icon(look.paths, ICON_SIZE.medium, stroke);
    const current = button.querySelector(".icon");
    if (current !== null) current.replaceWith(next);
    else button.appendChild(next);
  }

  #markCopied(): void {
    this.#copied = true;
    window.clearTimeout(this.#copiedTimer);
    this.#copiedTimer = window.setTimeout(() => {
      this.#copied = false;
      this.#render();
    }, SUCCESS_LIFE_MS);
    this.#render();
  }

  #close(): void {
    this.#open = false;
    this.#render();
  }

  #copy(): void {
    withMarkdown((body) => {
      void writeClipboardText(body).then((written) => {
        this.#close();
        if (written) this.#markCopied();
      });
    });
  }

  #save(): void {
    withMarkdown((body) => {
      download(markdownFileName(), "text/markdown", body);
      this.#close();
    });
  }

  #print(): void {
    this.#close();
    window.print();
  }

  #toggleComments(on: boolean): void {
    writeStored(STORAGE_COMMENTS, on ? "1" : "0");
  }

  #render(): void {
    const trigger = el("button", this.#open ? "trigger is-open" : "trigger");
    trigger.type = "button";
    this.#paintTrigger(trigger);
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      this.#open = !this.#open;
      this.#render();
    });

    const box = el("div");
    box.appendChild(trigger);

    if (this.#open) {
      const menu = el("div", "menu");
      menu.setAttribute("role", "menu");

      const copy = el("button", "item", t("toolbox.export.copy"));
      copy.type = "button";
      copy.setAttribute("role", "menuitem");
      copy.addEventListener("click", () => this.#copy());
      menu.appendChild(copy);

      const save = el("button", "item", t("toolbox.export.save"));
      save.type = "button";
      save.setAttribute("role", "menuitem");
      save.addEventListener("click", () => this.#save());
      menu.appendChild(save);

      if (commentsAvailable) {
        const commentsRule = el("hr", "rule");
        menu.appendChild(commentsRule);

        const row = el("label", "check-row");
        const input = el("input");
        input.type = "checkbox";
        input.className = "check-input";
        input.checked = includeComments();
        const mark = el("span", "check-mark");
        mark.appendChild(icon(ICON_CHECK, ICON_SIZE.small));
        row.appendChild(input);
        row.appendChild(mark);
        row.appendChild(el("span", "check-label", t("toolbox.export.includeComments")));
        input.addEventListener("change", () => this.#toggleComments(input.checked));
        row.addEventListener("click", (event) => event.stopPropagation());
        menu.appendChild(row);
      }

      const rule = el("hr", "rule");
      menu.appendChild(rule);

      const pdf = el("button", "item", "PDF");
      pdf.type = "button";
      pdf.setAttribute("role", "menuitem");
      pdf.addEventListener("click", () => this.#print());
      menu.appendChild(pdf);

      box.appendChild(menu);
    }

    this.#root.replaceChildren(this.#sheet, box);
  }
}

function defineExport(): void {
  if (typeof customElements === "undefined") return;
  if (customElements.get(EXPORT_TAG) !== undefined) return;
  customElements.define(EXPORT_TAG, PageExportElement);
}

/**
 * もともとある PDF ボタンを、こちらの口に置き換える。
 *
 * ボタンが無いページには何も足さない。社外の人の「ただの記事」に、
 * 元から無い道具を生やさないため。
 */
export function findPrintSlot(root: ParentNode = document): Element | null {
  const named = root.querySelector(".no-print");
  if (named !== null) return named;
  const button = root.querySelector("button[onclick*='print']");
  if (button === null) return null;
  return button.parentElement;
}

export function mountPageExport(): void {
  defineExport();
  if (document.querySelector(EXPORT_TAG) !== null) return;
  const slot = findPrintSlot();
  if (slot === null) return;
  for (const button of [...slot.querySelectorAll("button")]) button.remove();
  const host = document.createElement(EXPORT_TAG);
  slot.appendChild(host);
  warmMarkdown();
}
