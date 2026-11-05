import { EASE, MOTION } from "../../lib/settings/ui-motion";
import { DECK_ID } from "../../lib/deck/design/design";
import { intlLocale } from "../../lib/i18n/locales";
import { t, widgetLocale } from "../shared/i18n";
import { DECK_CUSTOMIZATION_CHANGE_EVENT } from "../../lib/deck/design/focus";
import { writeDeckOverrides } from "../../lib/deck/design/dom";
import { writeDeckFocusOverrides, writeDeckLogoOverrides } from "../../lib/deck/edit/customization-dom";
import { createDeckDesigner, type DeckDesigner } from "../deck/edit/design-editor";
import { EDIT_PREVIEW_MARK as PREVIEW_MARK } from "../../lib/comments/types";
import { loadEditSource, saveEdit } from "../shared/api";
import {
  clearDraft,
  draftUsable,
  purgeExpiredDrafts,
  readDraft,
  writeDraft,
  type EditDraft,
} from "./draft";
import { blockToMarkdown, collectEditableBlocks, forbiddenTagIn, inlineHtmlOf, splitBlocks } from "./markdown";
import { el, icon, ICON_CHECK, ICON_CLOSE } from "../shared/util";
import { ICON_SIZE } from "../shared/tokens";
import { isDeckHtml } from "../../lib/deck/deck";
import { deckEditSessionActive } from "../deck/edit/state";
import { carryPlace } from "../reading/position";

/**
 * ページの本文を、その場で直す画面。
 *
 * ## 作り
 *
 * 木（DOM）を 2 本持つ。
 *
 *   正本の木     … 保管庫から取り寄せた HTML をそのまま読んだもの。保存はこれを書き出す
 *   プレビューの木 … 配信と同じ差し込み（<base> と vendor）を済ませた HTML を iframe に
 *                    描いたもの。人が見て・押すのはこちら
 *
 * 2 本は同じ本文から作られるので、押せるブロックは**同じ数え方**（collectEditableBlocks）で
 * 数えれば 1 対 1 に並ぶ。押されたら正本の木の同じ場所を直し、プレビューにも同じ直しを
 * 映す。**目印を付けるのはプレビューの木だけ**——正本の木に付けると、
 * 剥がし忘れた目印が保管庫に焼き付く。付けない作りなら、剥がす処理そのものが要らない。
 *
 * ## 直し方
 *
 * 押した 1 ブロックの中身をマークダウン風の文字にして見せ、直したら HTML に戻して
 * はめ直す（src/widget/editor/markdown.ts）。押していないブロックには 1 文字も触らない。
 * ページの構え（div の格子・図・表の枠）はここでは直せない——それはマークダウンの
 * 語彙の外にあるもので、無理に文字列へ畳むと直すどころか壊す道具になる。
 *
 * ## 保存
 *
 * 正本の木を 1 枚の HTML に書き出し、取り寄せたときの版の目印を添えて送る。
 * 積み方はサーバー側が投稿と同じ道（commitRevision）を通すので、版の履歴・
 * すれ違いの検知はここでは持たない。
 */

type Notify = (text: string) => void;

export type EditorHooks = {
  pageSlug: string;
  /** ウィジェットの影の根。編集の画面はこの中に載せる（ページの CSS と混ぜない） */
  host: ShadowRoot;
  notify: Notify;
  fail: Notify;
  /** The launcher can be recreated while panels close; restore its current instance. */
  restoreFocus?: () => void;
  /** Reader resumes without navigating; refresh data only after editing has ended. */
  onClosed?: () => void;
  /**
   * 新しい版を積んだ直後。これからページを読み直す。
   *
   * 直した箇所に付いていたコメントの物語を、読み直したあとに出すための合図。
   * 呼ばない／渡せないときは、一覧の物語だけが頼りになる。
   */
  onSaved?: (info: { baseVersionId: string }) => void;
  /** スライドを編集画面ではなく発表者画面から開く（読む画面の入口）。窓は押した瞬間に開いたもの。 */
  presenter?: { audienceWindow: Window | null; slide: string | null };
};

type Session = {
  hooks: EditorHooks;
  baseVersionId: string;
  /** 保存の土台。目印は一切付けない */
  masterDoc: Document;
  sourceHtml: string;
  designer: DeckDesigner | null;
  /**
   * 正本の木の、押して直せるブロックの並び。取り除いたところは null で埋める
   * （詰めると番号がずれる）。プレビュー側の相手は持たない——iframe の本文は
   * 外の script（Tailwind）の読み込みが済むまで解析が終わらず、開いた直後に
   * 引きに行くと空振りする。押された要素そのものを目印の番号ごと受け取る。
   */
  masterBlocks: (Element | null)[];
  /**
   * DOMParser で読んだプレビューの木。iframe に描く前の復元はここに再生する
   * （描いたあとの iframe の本文は、外の script の読み込み待ちで空振りすることがある）。
   */
  previewDoc: Document;
  screen: HTMLElement;
  frame: HTMLIFrameElement;
  saveButton: HTMLButtonElement;
  /** 保存ボタンの文字（忙しい間だけ言い換える。絵柄は触らない） */
  saveLabel: HTMLElement;
  countLabel: HTMLElement;
  messageInput: HTMLInputElement;
  alertBox: HTMLElement;
  /** 保存していない直しかけを戻すか聞く行。無いときは隠す */
  resumeBox: HTMLElement;
  /** 直したブロックの番号。数を出すのと、保存を押せるかに使う */
  touched: Set<number>;
  /**
   * 直しの記録。**起きた順**（番号順ではない）。控えに書き、戻すときもこの順で再生する。
   */
  log: EditDraft["log"];
  /** いま開いている 1 ブロックの編集箱の後始末。開けるのは同時に 1 つだけ */
  closeBlockEditor: (() => void) | null;
  /** 「やめる」の念押しを出しているか */
  confirmingClose: boolean;
  busy: boolean;
};

let session: Session | null = null;

/** 編集中のブロックに付ける見た目の印（iframe の中の CSS が読む）。 */
const EDITING_CLASS = "sp-editing";

/**
 * iframe の中に差し込む見た目。
 *
 * ページ本体の上に描くので、影の中のトークンは届かない。値はウィジェットの
 * トークン（tokens.ts）と同じ目盛りから写し、明暗は iframe 側の設定に追わせる。
 */
const FRAME_STYLES = `
[${PREVIEW_MARK}] { cursor: pointer; outline: 2px solid transparent; outline-offset: 2px; transition: outline-color ${MOTION.quick}ms ${EASE}; }
[${PREVIEW_MARK}]:hover { outline-color: rgba(200, 168, 110, .55); }
[${PREVIEW_MARK}].${EDITING_CLASS} { outline-color: #c8a86e; }
.sp-block-editor { position: absolute; z-index: 2147482500; padding: 8px; border: 1px solid #e3e5e9; border-radius: 8px; background: #ffffff; box-shadow: 0 8px 30px rgba(15, 17, 25, .14); font-family: 'Noto Sans JP', 'Inter', -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif; }
.sp-block-editor textarea { display: block; width: 100%; box-sizing: border-box; min-height: 72px; padding: 8px; border: 1px solid #e3e5e9; border-radius: 4px; background: #ffffff; color: #1a1a2e; font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; resize: vertical; }
.sp-block-editor .sp-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.sp-block-editor .sp-hint { margin: 0; flex: 1; font-size: 11px; color: #6b7280; }
.sp-block-editor .sp-error { margin: 8px 0 0; font-size: 11px; color: #dc2626; }
.sp-block-editor button { font: 12px/1.35 inherit; padding: 6px 12px; border: 1px solid #e3e5e9; border-radius: 999px; background: #ffffff; color: #1a1a2e; cursor: pointer; }
.sp-block-editor button.sp-apply { background: #1a1a2e; border-color: #1a1a2e; color: #ffffff; }
@media (prefers-color-scheme: dark) {
  .sp-block-editor { border-color: rgba(255, 255, 255, .12); background: #1c2035; box-shadow: 0 8px 30px rgba(0, 0, 0, .45); }
  .sp-block-editor textarea { border-color: rgba(255, 255, 255, .12); background: #171a2b; color: #e8e6e3; }
  .sp-block-editor .sp-hint { color: #9a9ba4; }
  .sp-block-editor .sp-error { color: #f87171; }
  .sp-block-editor button { border-color: rgba(255, 255, 255, .12); background: #1c2035; color: #e8e6e3; }
  .sp-block-editor button.sp-apply { background: #e8e6e3; border-color: #e8e6e3; color: #1a1a2e; }
}
`;

/** いま編集の画面が開いているか（開いている間は 2 枚目を開かない）。 */
export function editorActive(): boolean {
  return session !== null || deckEditSessionActive();
}

function sessionBusy(current: Session): boolean {
  return current.busy || (current.designer?.busy() ?? false);
}

/**
 * 直しかけがあるあいだ、ブラウザ標準の離脱警告を出す。
 *
 * 控えがあるから閉じても戻れるが、警告は保険として残す
 * （控えが書けなかった環境でも、閉じる直前にもう一度気づける）。
 */
function warnIfLeaving(event: BeforeUnloadEvent): void {
  if (session === null || (!sessionBusy(session) && session.touched.size === 0 && !session.designer?.dirty())) return;
  event.preventDefault();
}

/** いまの直しを控えに書く。log が空のときは書かない（空で古い直しかけを消さない）。 */
function persistDraft(): void {
  if (session === null || (session.log.length === 0 && !session.designer?.dirty())) return;
  const customization = session.designer?.customization();
  writeDraft(session.hooks.pageSlug, {
    baseVersionId: session.baseVersionId,
    log: session.log,
    message: session.messageInput.value,
    savedAt: new Date().toISOString(),
    ...(customization?.appearance ? { appearance: customization.appearance } : {}),
    ...(customization?.focus ? { focus: customization.focus } : {}),
    ...(customization?.logo ? { logo: customization.logo } : {}),
  });
}

function hideResume(current: Session): void {
  current.resumeBox.hidden = true;
  current.resumeBox.replaceChildren();
}

/** 控えに残っていた時刻を、人の目で読める短い形にする。 */
function formatDraftSavedAt(iso: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return iso;
  return new Intl.DateTimeFormat(intlLocale(widgetLocale()), {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(at));
}

/**
 * 再生が途中で止まったときに、開いた直後の 2 本の木へ戻す。
 *
 * 途中まで直した正本と、まだ描いていないプレビューが食い違ったまま進むと、
 * 押した場所と違うブロックが保存される。
 */
function restoreOpenedTrees(current: Session, masterHtml: string, previewHtml: string): void {
  const parser = new DOMParser();
  current.masterDoc = parser.parseFromString(masterHtml, "text/html");
  current.previewDoc = parser.parseFromString(previewHtml, "text/html");
  current.masterBlocks = [...collectEditableBlocks(current.masterDoc.body)];
  current.log = [];
  current.touched.clear();
}

/**
 * 控えの log を、記録された順にプレビューの木と正本の木へ再生する。
 *
 * 並べ替えない。分割で後から付いた番号が途中に混ざるので、番号順にすると
 * まだ生まれていないブロックを先に直そうとして壊れる。
 */
function resumeDraft(current: Session, draft: EditDraft): void {
  if (session !== current) return;

  const openedMaster = serializeDocument(current.masterDoc);
  const openedPreview = serializeDocument(current.previewDoc);

  for (const { at, markdown } of draft.log) {
    const master = current.masterBlocks[at] ?? null;
    const preview = current.previewDoc.querySelector(`[${PREVIEW_MARK}="${at}"]`);
    if (master === null || preview === null) {
      clearDraft(current.hooks.pageSlug);
      hideResume(current);
      restoreOpenedTrees(current, openedMaster, openedPreview);
      current.hooks.notify(t("toolbox.editor.draftMismatch"));
      return;
    }
    applyBlockEdit(at, preview, markdown);
  }

  current.log = draft.log.map((entry) => ({ at: entry.at, markdown: entry.markdown }));
  for (const { at } of draft.log) current.touched.add(at);
  if (current.designer) {
    current.designer.restoreCustomization({
      version: 1,
      ...(draft.appearance ? { appearance: draft.appearance } : {}),
      ...(draft.focus ? { focus: draft.focus } : {}),
      ...(draft.logo ? { logo: draft.logo } : {}),
    });
    const customization = current.designer.customization();
    if (customization.appearance) {
      writeDeckOverrides(current.masterDoc, customization.appearance);
      writeDeckOverrides(current.previewDoc, customization.appearance);
    }
    if (customization.focus) {
      writeDeckFocusOverrides(current.masterDoc, customization.focus);
      writeDeckFocusOverrides(current.previewDoc, customization.focus);
    }
    if (customization.logo) {
      writeDeckLogoOverrides(current.masterDoc, customization.logo);
      writeDeckLogoOverrides(current.previewDoc, customization.logo);
    }
  }
  current.messageInput.value = draft.message;
  hideResume(current);

  const doc = mountPreview(current.frame, serializeDocument(current.previewDoc));
  if (doc === null) {
    current.hooks.fail(t("toolbox.editor.previewFailed"));
    teardown();
    return;
  }
  renderEditState();
}

function offerResume(current: Session, draft: EditDraft): void {
  const text = el(
    "span",
    undefined,
    draft.appearance || draft.focus || draft.logo
      ? t("toolbox.editor.resumeWithDesign", { count: draft.log.length, when: formatDraftSavedAt(draft.savedAt) })
      : t("toolbox.editor.resume", { count: draft.log.length, when: formatDraftSavedAt(draft.savedAt) }),
  );
  const resume = el("button", "edit-button");
  resume.type = "button";
  resume.textContent = t("toolbox.editor.resumeButton");
  resume.addEventListener("click", () => resumeDraft(current, draft));

  const discard = el("button", "edit-button");
  discard.type = "button";
  discard.textContent = t("toolbox.editor.discard");
  discard.addEventListener("click", () => {
    clearDraft(current.hooks.pageSlug);
    hideResume(current);
  });

  current.resumeBox.replaceChildren(text, el("span", "spacer"), resume, discard);
  current.resumeBox.hidden = false;
}

/**
 * 木を 1 枚の HTML に書き出す。
 *
 * DOCTYPE は読み込んだ木が持っているものから作る（無いページには足さない）。
 *
 * 一度木に読んでから書き出すので、**属性の書き方だけは一度そろう**
 * （属性の中の `<` が `&lt;` になる・値の無い属性に `=""` が付く、の類）。
 * 意味は 1 ミリも変わらない（ブラウザは同じものとして読む）が、初めて
 * ブラウザで直した版の差分に、頭（head）のその行が混ざることがある。
 * 本文の赤入れは文章だけを数えるので、履歴の見え方には効かない。
 */
export function serializeDocument(doc: Document): string {
  const type = doc.doctype;
  const doctype = type === null ? "" : `<!DOCTYPE ${type.name}>\n`;
  return `${doctype}${doc.documentElement.outerHTML}`;
}

/**
 * タグと属性だけを写した空の要素を作る。
 *
 * cloneNode を使わないのは、iframe の中の要素が**別の世界（realm）の生まれ**で、
 * こちらの Element と instanceof で突き合わせられないため。ownerDocument から
 * 作れば、どちらの木の要素でも同じやり方で写せる。
 */
function shallowCloneOf(element: Element): Element {
  const clone = element.ownerDocument.createElement(element.tagName.toLowerCase());
  for (const attribute of element.attributes) {
    clone.setAttribute(attribute.name, attribute.value);
  }
  return clone;
}

/** 2 本の木の押せるブロックが 1 対 1 に並んでいるか（数とタグで確かめる）。 */
function alignedBlocks(master: readonly Element[], preview: readonly Element[]): boolean {
  if (master.length !== preview.length) return false;
  return master.every((block, at) => block.tagName === preview[at].tagName);
}

/**
 * 直したマークダウン風の文字を、正本とプレビューの両方の木へはめ直す。
 *
 * 空行で割れた 2 つめ以降は、**元のブロックと同じタグ・同じ属性**の要素として
 * すぐ後ろに足す（Tailwind で組まれたページでも、足した段落だけ浮かない）。
 * 全部消していたら、そのブロックごと取り除く。
 */
function applyBlockEdit(at: number, preview: Element, markdown: string): void {
  if (session === null) return;
  // 範囲外（ページ側 script が目印の番号を書き換えた等）は undefined が返る。
  // === null だけでは素通りするので、欠測も同じ「無い」に落とす
  const master = session.masterBlocks[at] ?? null;
  if (master === null) return;

  const segments = splitBlocks(markdown);

  if (segments.length === 0) {
    master.remove();
    preview.remove();
    session.masterBlocks[at] = null;
    return;
  }

  const htmls = segments.map((segment) => inlineHtmlOf(segment));
  master.innerHTML = htmls[0];
  // プレビューの木はページ側の仕掛けで入れ替わっていることがある（正本だけは必ず直す）
  if (preview.isConnected) preview.innerHTML = htmls[0];

  let masterTail = master;
  let previewTail = preview;
  for (const html of htmls.slice(1)) {
    const masterNext = shallowCloneOf(master);
    masterNext.innerHTML = html;
    masterTail.after(masterNext);
    masterTail = masterNext;

    const previewNext = shallowCloneOf(preview);
    previewNext.innerHTML = html;
    // 足したブロックもそのまま押して直せるように、新しい番号で並びに載せる
    previewNext.setAttribute(PREVIEW_MARK, String(session.masterBlocks.length));
    if (previewTail.isConnected) previewTail.after(previewNext);
    previewTail = previewNext;

    session.masterBlocks.push(masterNext);
    session.touched.add(session.masterBlocks.length - 1);
  }
}

/**
 * アイコン（<i data-lucide>）を含む直しのあとに、iframe の中で絵に起こし直す。
 *
 * 呼び方は iframe へ script を 1 本落とすだけ。こちらの世界から iframe の
 * lucide に触ると、型の言い訳（キャスト）が要る——それはこの製品では使わない。
 */
function redrawFrameIcons(doc: Document): void {
  const script = doc.createElement("script");
  script.textContent = "window.lucide && window.lucide.createIcons && window.lucide.createIcons();";
  doc.body.appendChild(script);
  script.remove();
}

/** 上のバーの「直した数」と保存ボタンの押せる・押せないをそろえる。 */
function renderEditState(): void {
  if (session === null) return;
  const designChanged = session.designer?.dirty() ?? false;
  const count = session.touched.size + (designChanged ? 1 : 0);
  const busy = sessionBusy(session);
  session.countLabel.textContent = count === 0
    ? t("toolbox.editor.pickBlock")
    : designChanged
      ? t("toolbox.editor.touchedWithDesign", { count: session.touched.size })
      : t("toolbox.editor.touched", { count: session.touched.size });
  session.saveButton.disabled = count === 0 || busy;
  session.frame.inert = busy;
  session.messageInput.disabled = busy;
  if (session.designer) {
    session.designer.root.inert = busy;
    session.designer.modeButton.disabled = busy;
  }
}

/** 出しっぱなしの断り書きを消す。 */
function clearAlert(): void {
  if (session === null) return;
  session.alertBox.hidden = true;
  session.alertBox.textContent = "";
}

/** 断り書きを 1 行出す（保存に失敗したとき・すれ違ったとき）。 */
function showAlert(text: string): void {
  if (session === null) return;
  session.alertBox.hidden = false;
  session.alertBox.textContent = text;
}

/**
 * 1 ブロックの編集箱を iframe の中に開く。
 *
 * 箱はブロックのすぐ下に浮かべる（ブロックの中へ差し込まない）。td や li の中に
 * 別の箱を差し込むと、表や一覧の形が崩れる——浮かべる形なら、どのタグでも同じで済む。
 */
function openBlockEditor(at: number, preview: Element): void {
  if (session === null) return;
  const current = session;
  // 範囲外（ページ側 script が目印の番号を書き換えた等）は undefined が返る。
  // === null だけでは素通りするので、欠測も同じ「無い」に落とす
  const master = current.masterBlocks[at] ?? null;
  if (master === null) return;

  // 開けるのは 1 つだけ。前の箱は書きかけごと畳む（押した先が新しい対象）
  current.closeBlockEditor?.();

  const doc = preview.ownerDocument;
  const frameWindow = doc.defaultView;
  if (frameWindow === null) return;

  const original = blockToMarkdown(master);

  const box = doc.createElement("div");
  box.className = "sp-block-editor";

  const input = doc.createElement("textarea");
  input.value = original;
  box.appendChild(input);

  const row = doc.createElement("div");
  row.className = "sp-row";
  const hint = doc.createElement("p");
  hint.className = "sp-hint";
  hint.textContent = t("toolbox.editor.markdownHint");
  row.appendChild(hint);

  const cancel = doc.createElement("button");
  cancel.type = "button";
  cancel.textContent = t("toolbox.common.cancel");
  row.appendChild(cancel);

  const apply = doc.createElement("button");
  apply.type = "button";
  apply.className = "sp-apply";
  apply.textContent = t("toolbox.editor.apply");
  row.appendChild(apply);
  box.appendChild(row);

  /*
   * 置き場所はブロックの下端。紙の座標（スクロールを足した位置）で置くので、
   * 画面を送っても箱はブロックに付いていく。
   */
  const rect = preview.getBoundingClientRect();
  const width = Math.min(Math.max(rect.width, 320), doc.documentElement.clientWidth - 24);
  box.style.left = `${Math.max(12, rect.left + frameWindow.scrollX)}px`;
  box.style.top = `${rect.bottom + frameWindow.scrollY + 4}px`;
  box.style.width = `${width}px`;
  doc.body.appendChild(box);

  preview.classList.add(EDITING_CLASS);

  const fit = (): void => {
    input.style.height = "auto";
    input.style.height = `${Math.max(72, input.scrollHeight)}px`;
  };
  fit();
  input.focus();

  let errorLine: HTMLParagraphElement | null = null;
  const clearBlockError = (): void => {
    errorLine?.remove();
    errorLine = null;
  };
  input.addEventListener("input", () => {
    fit();
    clearBlockError();
  });

  const close = (): void => {
    box.remove();
    if (preview.isConnected) preview.classList.remove(EDITING_CLASS);
    if (current.closeBlockEditor === close) current.closeBlockEditor = null;
  };
  current.closeBlockEditor = close;

  const commit = (): void => {
    const written = input.value;
    // 1 文字も変わっていなければ、木にも数にも触らない
    if (written === original) {
      close();
      return;
    }
    /*
     * かたまりの中に構えや仕掛けのタグが混ざると、次にページを開いたとき
     * ブラウザが木を組み替えて、押せるブロックの数え上げがずれる。
     * ここで止めて箱は残す（打ちかけを消さない）。
     */
    for (const segment of splitBlocks(written)) {
      const forbidden = forbiddenTagIn(inlineHtmlOf(segment));
      if (forbidden !== null) {
        const text = t("toolbox.editor.forbiddenTag", { tag: `<${forbidden}>` });
        if (errorLine === null) {
          errorLine = doc.createElement("p");
          errorLine.className = "sp-error";
          row.before(errorLine);
        }
        errorLine.textContent = text;
        return;
      }
    }
    close();
    applyBlockEdit(at, preview, written);
    current.touched.add(at);
    current.log.push({ at, markdown: written });
    // 提示を無視して先に直したので、古い控えは新しい log で上書きする
    hideResume(current);
    persistDraft();
    if (written.includes("data-lucide")) redrawFrameIcons(doc);
    clearAlert();
    renderEditState();
  };

  cancel.addEventListener("click", close);
  apply.addEventListener("click", commit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      commit();
    }
  });
}

/**
 * プレビューを iframe に描いて、押せるブロックを配線する。
 *
 * リンクはここでは殺す（押した拍子にプレビューがよそのページへ飛ぶと、
 * 直しかけの木だけが取り残される）。
 */
function mountPreview(frame: HTMLIFrameElement, previewHtml: string): Document | null {
  const doc = frame.contentDocument;
  if (doc === null) return null;
  doc.open();
  doc.write(previewHtml);
  doc.close();

  const style = doc.createElement("style");
  style.textContent = FRAME_STYLES;
  doc.head.appendChild(style);

  doc.addEventListener("click", (event) => {
    /*
     * iframe の中の要素は**別の世界（realm）の生まれ**なので、こちらの Element と
     * instanceof で突き合わせても偽になる。突き合わせる相手は iframe 側の窓が持つ
     * Element にする（それなら型もそのまま狭まる）。
     */
    const frameWindow = doc.defaultView;
    if (frameWindow === null) return;
    const target = event.target;
    if (!(target instanceof frameWindow.Element)) return;

    // 編集箱の中は素通し（ボタンと textarea に働いてもらう）
    if (target.closest(".sp-block-editor") !== null) return;

    // リンクはプレビューでは飛ばさない（飛ぶと直しかけの木が取り残される）
    if (target.closest("a[href]") !== null) event.preventDefault();

    if (session?.designer?.active()) {
      if (session.designer.selectTarget(target)) {
        event.preventDefault();
        return;
      }
      const slide = target.closest(`[${DECK_ID}]`);
      if (slide) session.designer.select(slide.getAttribute(DECK_ID) ?? "");
      return;
    }
    if (doc.querySelector('[data-deck-design-runtime="3"]') && !doc.body.hasAttribute("data-deck-design-ready")) return;
    const block = target.closest(`[${PREVIEW_MARK}]`);
    if (block === null) return;
    event.preventDefault();
    /*
     * 押された要素そのものを渡す。番号から引き直さないのは、iframe の本文が
     * 外の script の読み込み待ちで**あとから**解析されるため——開いた直後に
     * 引いた控えは空振りしていることがある。押せたということは、その要素は
     * もう木に居る。
     */
    const at = Number(block.getAttribute(PREVIEW_MARK));
    if (Number.isInteger(at)) openBlockEditor(at, block);
  });

  return doc;
}

/** 編集の画面を畳む。 */
function teardown(): void {
  if (session === null) return;
  session.closeBlockEditor?.();
  session.screen.remove();
  window.removeEventListener("beforeunload", warnIfLeaving);
  session = null;
}

/** 保存。正本の木を書き出して、取り寄せたときの版の目印と一緒に送る。 */
async function save(): Promise<void> {
  if (session === null || sessionBusy(session)) return;
  const current = session;
  if ((current.touched.size === 0 && !current.designer?.dirty())) return;

  current.busy = true;
  current.saveLabel.textContent = t("toolbox.editor.saving");
  renderEditState();

  const result = await saveEdit({
    pageSlug: current.hooks.pageSlug,
    html: current.touched.size === 0 ? current.sourceHtml : serializeDocument(current.masterDoc),
    ...(current.designer ? { deckCustomization: current.designer.customization() } : {}),
    baseVersionId: current.baseVersionId,
    message: current.messageInput.value,
  });

  if (session !== current) return;
  current.busy = false;
  current.saveLabel.textContent = t("toolbox.editor.saveButton");

  if (!result.ok) {
    // すれ違い（409）も通信の失敗も、直しかけを道連れにしない。画面は開けたまま断る
    showAlert(result.message);
    renderEditState();
    return;
  }

  clearDraft(current.hooks.pageSlug);
  const hooks = current.hooks;
  const baseVersionId = current.baseVersionId;
  teardown();
  if (result.value.unchanged) {
    hooks.notify(t("toolbox.editor.unchanged"));
    return;
  }
  hooks.onSaved?.({ baseVersionId });
  hooks.notify(t("toolbox.editor.saved"));
  // 読み込み直した新しい版でも、直していた段落から見せる（src/widget/reading/position.ts）
  carryPlace();
  window.location.reload();
}

/**
 * 「やめる」。直しがあるときは、その場で 1 度だけ念を押す
 * （画面を移らずに、同じボタンの並びが問いに変わる）。
 */
function requestClose(): void {
  if (session === null || sessionBusy(session)) return;
  if ((session.touched.size === 0 && !session.designer?.dirty()) || session.confirmingClose) {
    // 2 度押しで直しを捨てて閉じるときだけ控えも消す。
    // 直していない（選ばせる行を残したまま閉じた）ときは、次に開いたとき戻せるように残す。
    if (session.confirmingClose) clearDraft(session.hooks.pageSlug);
    teardown();
    return;
  }
  session.confirmingClose = true;
  showAlert(t("toolbox.editor.unsavedAlert"));
}

/** 上のバー（題・一言・やめる・保存）。 */
function buildTopBar(current: Session, title: string): HTMLElement {
  const bar = el("div", "edit-bar");

  const name = el("span", "edit-title", title.length > 0 ? t("toolbox.editor.titleNamed", { title }) : t("toolbox.editor.title"));
  bar.appendChild(name);

  current.countLabel = el("span", "edit-count");
  bar.appendChild(current.countLabel);

  bar.appendChild(el("span", "spacer"));

  current.messageInput = el("input", "edit-message");
  current.messageInput.type = "text";
  current.messageInput.placeholder = t("toolbox.editor.messagePlaceholder");
  current.messageInput.maxLength = 200;
  current.messageInput.addEventListener("input", () => persistDraft());
  bar.appendChild(current.messageInput);

  const close = el("button", "edit-button");
  close.type = "button";
  close.appendChild(icon(ICON_CLOSE, ICON_SIZE.medium));
  close.appendChild(el("span", undefined, t("toolbox.common.cancel")));
  close.addEventListener("click", () => requestClose());
  bar.appendChild(close);

  current.saveButton = el("button", "edit-button is-primary");
  current.saveButton.type = "button";
  current.saveButton.appendChild(icon(ICON_CHECK, ICON_SIZE.medium));
  current.saveLabel = el("span", undefined, t("toolbox.editor.saveButton"));
  current.saveButton.appendChild(current.saveLabel);
  current.saveButton.addEventListener("click", () => void save());
  bar.appendChild(current.saveButton);

  return bar;
}

/**
 * 編集の画面を開く。
 *
 * 取り寄せ → 2 本の木を組む → プレビューを描く、まで。開けないときは
 * 1 行で断って、何も残さない。
 */
/**
 * スライドの直接編集を開く。編集の部品はここで初めて読む（記事を読むだけの人には送らない・docs/design/app-speed.md）。
 */
async function openDeckEdit(hooks: EditorHooks): Promise<void> {
  let session: typeof import("../deck/edit/session");
  try {
    session = await import("../deck/edit/session");
  } catch {
    // 公開をまたいで開いたままの画面では、前の版の部品がもう配られていない（src/app/comments-widget.js が断る）
    hooks.fail(t("toolbox.editor.deckEditorLoadFailed"));
    return;
  }
  await session.openDeckEditSession(hooks);
}

export async function openPageEditor(hooks: EditorHooks, options: { designOnly?: boolean } = {}): Promise<void> {
  if (editorActive()) return;

  // The rendered document already identifies decks. The deck endpoint still
  // checks both permission and the latest source; do not fetch the HTML twice.
  if (!options.designOnly && document.body.hasAttribute("data-deck")) {
    await openDeckEdit(hooks);
    return;
  }

  const source = await loadEditSource(hooks.pageSlug);
  if (!source.ok) {
    hooks.fail(source.message);
    return;
  }
  if (source.value.baseVersionId === null) {
    hooks.fail(t("toolbox.editor.noVersion"));
    return;
  }

  if (!options.designOnly && isDeckHtml(source.value.html)) {
    await openDeckEdit(hooks);
    return;
  }

  const parser = new DOMParser();
  const masterDoc = parser.parseFromString(source.value.html, "text/html");
  const previewDoc = parser.parseFromString(source.value.previewHtml, "text/html");

  const masterBlocks = collectEditableBlocks(masterDoc.body);
  const previewBlocks = collectEditableBlocks(previewDoc.body);
  if (masterBlocks.length === 0) {
    hooks.fail(t("toolbox.editor.noBlocks"));
    return;
  }
  /*
   * 2 本の木がずれていたら開かない。ずれたまま進むと、押した場所と違うブロックが
   * 直る（見た目は合っているのに、保存された本文だけ別の場所が変わる）。
   */
  if (!alignedBlocks(masterBlocks, previewBlocks)) {
    hooks.fail(t("toolbox.editor.cannotEdit"));
    return;
  }

  // 目印はプレビューの木にだけ付けてから描く（正本の木は保存にそのまま出る）
  previewBlocks.forEach((block, at) => block.setAttribute(PREVIEW_MARK, String(at)));

  const screen = el("div", "edit-screen");
  const frame = el("iframe", "edit-frame");
  frame.setAttribute("title", t("toolbox.editor.frameTitle"));

  const current: Session = {
    hooks,
    baseVersionId: source.value.baseVersionId,
    masterDoc,
    sourceHtml: source.value.html,
    designer: null,
    previewDoc,
    masterBlocks: [...masterBlocks],
    screen,
    frame,
    saveButton: el("button"),
    saveLabel: el("span"),
    countLabel: el("span"),
    messageInput: el("input"),
    alertBox: el("p", "edit-alert"),
    resumeBox: el("div", "edit-resume"),
    touched: new Set<number>(),
    log: [],
    closeBlockEditor: null,
    confirmingClose: false,
    busy: false,
  };
  session = current;
  window.addEventListener("beforeunload", warnIfLeaving);

  screen.appendChild(buildTopBar(current, source.value.title));
  current.resumeBox.hidden = true;
  screen.appendChild(current.resumeBox);
  current.alertBox.hidden = true;
  screen.appendChild(current.alertBox);
  current.designer = createDeckDesigner({
    master: masterDoc, frame, pageSlug: hooks.pageSlug,
    stateChanged: renderEditState,
    changed: () => {
      if (!current.designer) return;
      const customization = current.designer.customization();
      if (customization.appearance) {
        writeDeckOverrides(current.masterDoc, customization.appearance);
        writeDeckOverrides(current.previewDoc, customization.appearance);
      }
      if (customization.focus) {
        writeDeckFocusOverrides(current.masterDoc, customization.focus);
        writeDeckFocusOverrides(current.previewDoc, customization.focus);
      }
      if (customization.logo) {
        writeDeckLogoOverrides(current.masterDoc, customization.logo);
        writeDeckLogoOverrides(current.previewDoc, customization.logo);
      }
      const shown = current.frame.contentDocument;
      if (shown && customization.focus) writeDeckFocusOverrides(shown, customization.focus);
      if (shown && customization.logo) writeDeckLogoOverrides(shown, customization.logo);
      if (shown && (customization.appearance || customization.focus || customization.logo)) {
        const view = shown.defaultView;
        if (view !== null) shown.dispatchEvent(new view.CustomEvent(DECK_CUSTOMIZATION_CHANGE_EVENT));
      }
      current.confirmingClose = false;
      renderEditState();
      if (!current.designer.dirty() && current.log.length === 0) clearDraft(current.hooks.pageSlug);
      else persistDraft();
    },
    fail: showAlert,
    clearFail: clearAlert,
  });
  if (current.designer) {
    screen.querySelector(".edit-bar")?.insertBefore(current.designer.modeButton, current.countLabel);
    screen.appendChild(current.designer.root);
  } else screen.appendChild(frame);
  hooks.host.appendChild(screen);

  /*
   * 控えの判定は iframe に描く前に済ませる。戻すならプレビューの木へ先に再生して
   * から描く、ではなく、描くのは復元前の状態のまま。[続きから直す] が押されてから
   * 再生し、木を serialize して iframe を描き直す。押されるまでは普通に見える。
   */
  const now = new Date();
  purgeExpiredDrafts(now);
  const draft = readDraft(hooks.pageSlug);
  if (draftUsable(draft, source.value.baseVersionId, now)) {
    offerResume(current, draft);
  }

  // iframe は画面に載ってから中身を書く（載る前の contentDocument は空振りする）
  const doc = mountPreview(frame, serializeDocument(previewDoc));
  if (doc === null) {
    teardown();
    hooks.fail(t("toolbox.editor.previewFailed"));
    return;
  }

  if (options.designOnly) current.designer?.modeButton.click();
  renderEditState();
}
