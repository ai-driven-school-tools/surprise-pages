import { baseKeymap, chainCommands, setBlockType, toggleMark } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { InputRule, inputRules } from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import { Fragment, type MarkType, type Node as PMNode, type ResolvedPos } from "prosemirror-model";
import { liftListItem, sinkListItem, splitListItem } from "prosemirror-schema-list";
import { EditorState, Plugin, PluginKey, TextSelection, type Command, type Transaction } from "prosemirror-state";
import { EditorView, type NodeView } from "prosemirror-view";
import { NOTE_BLOCKS, noteKeysLabel } from "../../lib/notes/blocks";
import { CLEAN_COPY_DOCUMENT_ATTR, type NoteMediaKind } from "../../lib/notes/model";
import { t } from "../shared/i18n";
import { backspaceInCell, blockCommand, cellAt, EmbedView, enterInCaptionOf, enterInCell, enterInSummary, enterOnEmptyToggleLine, itemDepth, itemToParagraph, moveCell, nestedItem, paragraphToList, pastedUrl, placeUrl, TABLE_ACTIONS, tableCommand, tableShape, ToggleView, toggleOpen, unwrapToggle } from "./note-block-edit";
import { Chrome, type DragStart, type MenuChoice } from "./note-chrome";
import { noteFaithful } from "./note-fidelity";
import { setNoteEditing } from "./note-guard";
import { MediaView, type Upload } from "./note-media-view";
import { chooseNoteFiles, noteFileKind, noteFileTooLarge, uploadNoteFile } from "./note-media";
import { clearNoteDraft, NoteSaver, purgeNoteDrafts, readNoteDraft, type NoteSaveStatus, type NoteSnapshot } from "./note-save";
import { bodyHtml, docFromParts, LINK_HREF, noteHeadingClass, noteSchema, parseNoteMain, titleText } from "./note-schema";
import { NOTE_LIGHT_CSS } from "./note-styles";
import { arrowUpAtBodyStart, deleteAtTitleEnd, placeholders } from "./note-title";
import { mountNoteTouch } from "./note-touch";

/**
 * メモ帳の編集の部品。配信された清書の本文（main）の上に、そのまま乗る。
 *
 * - 読む画面と書く画面を分けない。本文の DOM は清書と同じ形のまま、編集の芯（ProseMirror）がそれを直に動かす
 * - 取っ手・落ちる先の線・ブロックの一覧・保存の 1 行だけ、本文と別の根（Shadow DOM）に置く
 * - 道具箱の最初の読み込みには入れない（道具箱が `import()` で後から読む・src/widget/editor/note-loader.ts）
 * - 乗せる前に、本文がメモ帳の書ける形だけでできているかを確かめる（src/widget/editor/note-fidelity.ts）。
 *   書けない部分（図・脚注・ページの中のリンクなど）が 1 つでもあれば乗らない（黙って落として保存しない）
 *
 * 打鍵の決まり: 行頭の `## ` で見出し・`- ` で箇条書き・`/` でブロックの一覧・⌘B / ⌘I / ⌘E / ⌘K・Tab で字下げ・
 * ⌘⇧↑↓ でブロックを動かす・⌘⌥0〜8 でブロックの種類（台帳の `keys`）。
 */

const S = noteSchema.nodes;
const M = noteSchema.marks;

export type NoteEditorOptions = {
  pageSlug: string;
  /** 直し始める版の目印（保存の土台）。下の source と同じ版 */
  baseVersionId: string;
  /**
   * 直し始める版の本文（main）。配信された画面の本文ではなく、直す口（src/app/api/pages/edit）から取り寄せた保存の正本を
   * 読み込みの外の文書に読んだもの——画面を開いたあとに積まれた版の上へ、古い画面の本文を土台として乗せない
   */
  source: HTMLElement;
  /** 1 回きりの失敗の知らせ（道具箱の知らせの列） */
  notify(text: string): void;
  /** 乗せると決まった直後・本文に触る前（道具箱が本文の印を外す・src/widget/comments/comments.ts） */
  prepare(): void;
};

/** finish: 送り残しを送って保存が落ち着くのを待つ（全部受け取られたら true）。destroy: 外す。 */
export type NoteEditorHandle = { destroy(): void; finish(): Promise<boolean> };

let active: NoteEditorHandle | null = null;

/** 編集の部品が乗っているか。 */
export function noteEditorActive(): boolean {
  return active !== null;
}

// ---------------------------------------------------------------------------
// 書ける形を変える小さな操作
// ---------------------------------------------------------------------------

/** いまの行が入っているブロックの位置（入れ子の箇条書きなら、いちばん内側の 1 行）。題は含めない。 */
type Unit = { pos: number; node: PMNode; depth: number };

function unitOf($pos: ResolvedPos): Unit | null {
  const depth = itemDepth($pos) ?? ($pos.depth >= 1 ? 1 : null);
  if (depth === null) return null;
  const node = $pos.node(depth);
  if (node.type === S.title) return null;
  return { pos: $pos.before(depth), node, depth };
}

/** 行頭で Backspace。見出し・引用・コードは段落に、箇条書きは段落に戻す。 */
const backspaceAtStart: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const parent = $from.parent;
  if (parent.type === S.title) return $from.pos === 1;
  // 題のすぐ下の本文の頭では、字を題へ吸い込ませない。空の行だけは消して題へ戻れる
  if (parent.type === S.paragraph && $from.depth === 1 && $from.index(0) === 1 && parent.content.size > 0) return true;
  if (parent.type === S.item_text && $from.index($from.depth - 1) === 0) return itemToParagraph(state, dispatch);
  if (parent.type === S.heading || parent.type === S.quote || parent.type === S.callout || parent.type === S.code_block) return setBlockType(S.paragraph)(state, dispatch);
  return false;
};

/** 空の箇条書きの行で Enter。箇条書きを抜けて段落に戻る。 */
const enterOnEmptyItem: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type !== S.item_text || $from.parent.content.size > 0) return false;
  const depth = itemDepth($from);
  if (depth === null || $from.node(depth).childCount > 1) return false;
  return itemToParagraph(state, dispatch);
};

/** 題で Enter。カーソルの後ろの字を連れて、本文の 1 行目へ。 */
export const enterInTitle: Command = (state, dispatch) => {
  const { $from, $to } = state.selection;
  if ($from.parent.type !== S.title) return false;
  if (!dispatch) return true;
  const tr = state.tr.deleteSelection();
  const at = tr.selection.$from;
  const rest = at.parent.content.cut(at.parentOffset);
  tr.delete(at.pos, at.end());
  const after = tr.mapping.map($to.after(1));
  tr.insert(after, S.paragraph.create(null, rest));
  dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView());
  return true;
};

/**
 * 見出し。清書の目次（src/widget/reading/outline.ts）が飛び先の id を見出しに振るので、その id を芯に消させない
 * （id の付け足しは字の変化ではない。芯が読み直すと見出しを描き直し、目次の飛び先が切れる）。
 */
class HeadingView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  constructor(private node: PMNode) {
    this.dom = document.createElement(node.attrs.level === 3 ? "h3" : "h2");
    this.dom.className = noteHeadingClass(node.attrs.level === 3 ? 3 : 2);
    this.contentDOM = this.dom;
  }
  update(node: PMNode): boolean {
    if (node.type !== this.node.type || node.attrs.level !== this.node.attrs.level) return false;
    this.node = node;
    return true;
  }
  ignoreMutation(mutation: MutationRecord | { type: "selection"; target: Node }): boolean {
    return mutation.type === "attributes" && mutation.target === this.dom && mutation.attributeName === "id";
  }
}

/** 添え書きで Enter。絵を 2 つに割らず、絵の後ろの行へ出る。 */
const enterInCaption: Command = enterInCaptionOf(S.media);
const enterInEmbedCaption: Command = enterInCaptionOf(S.embed);

/** 開いた本文の末尾が段落でなければ、空の段落を 1 つ足す（絵や区切り線のあとにも打てる場所を残す）。 */
function withTrailingParagraph(doc: PMNode): PMNode {
  const last = doc.lastChild;
  if (last !== null && last.type === S.paragraph && doc.childCount > 1) return doc;
  return doc.copy(doc.content.append(Fragment.from(S.paragraph.create())));
}

/** いまのブロック（箇条書きなら 1 行）を 1 つ上・下へ。 */
export function moveUnit(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const unit = unitOf(state.selection.$from);
    if (unit === null) return false;
    const $unit = state.doc.resolve(unit.pos);
    const parent = $unit.parent;
    const index = $unit.index();
    const target = index + direction;
    // 題の前へは動かさない
    if (target < (parent.type === S.doc ? 1 : 0) || target >= parent.childCount) return true;
    if (!dispatch) return true;
    const neighbor = parent.child(target);
    const tr = state.tr;
    const offset = state.selection.from - unit.pos;
    if (direction === -1) {
      const neighborPos = unit.pos - neighbor.nodeSize;
      tr.delete(unit.pos, unit.pos + unit.node.nodeSize).insert(neighborPos, unit.node);
      dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(neighborPos + offset))).scrollIntoView());
    } else {
      const insertAt = unit.pos + neighbor.nodeSize;
      tr.delete(unit.pos, unit.pos + unit.node.nodeSize).insert(insertAt, unit.node);
      dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + offset))).scrollIntoView());
    }
    return true;
  };
}

/** Tab / Shift+Tab。箇条書きの中でだけ字下げ・戻し（ほかでは焦点を外へ逃がさない）。 */
function indent(deeper: boolean): Command {
  return (state, dispatch) => {
    const depth = itemDepth(state.selection.$from);
    if (depth === null) return false;
    const type = state.selection.$from.node(depth).type;
    if (type === S.task_item) return true;
    if (deeper) return sinkListItem(S.list_item)(state, dispatch) || true;
    if (!nestedItem(state.selection.$from, depth)) return true;
    return liftListItem(S.list_item)(state, dispatch) || true;
  };
}

// ---------------------------------------------------------------------------
// 打ち終わった瞬間に形が変わる決まり
// ---------------------------------------------------------------------------

/** 行頭の印で段落を変える（段落の中でだけ。題・箇条書きの中では効かない）。 */
function blockRule(pattern: RegExp, apply: (state: EditorState, start: number, end: number, match: RegExpMatchArray) => Transaction | null): InputRule {
  return new InputRule(pattern, (state, match, start, end) => {
    const $start = state.doc.resolve(start);
    if ($start.parent.type !== S.paragraph) return null;
    return apply(state, start, end, match);
  });
}

/** `**太字**` `*斜め*` `` `コード` `` を、打ち終わった瞬間に飾りへ。 */
function markRule(pattern: RegExp, type: MarkType, open: string, close: string): InputRule {
  return new InputRule(pattern, (state, match, start, end) => {
    const $start = state.doc.resolve(start);
    if (!$start.parent.type.allowsMarkType(type)) return null;
    const inner = match[1];
    if (inner === undefined) return null;
    const innerStart = start + match[0].length - close.length - inner.length;
    const openStart = innerStart - open.length;
    const tr = state.tr;
    if (innerStart + inner.length < end) tr.delete(innerStart + inner.length, end);
    tr.delete(openStart, innerStart);
    tr.addMark(openStart, openStart + inner.length, type.create());
    tr.removeStoredMark(type);
    return tr;
  });
}

function noteInputRules(): Plugin {
  const heading = (level: number) => (state: EditorState, start: number, end: number) => {
    // 見出しを置けない場所（トグルの中）では形を変えない（印の字はそのまま残る）
    const $start = state.doc.resolve(start);
    if (!$start.node(-1).canReplaceWith($start.index(-1), $start.index(-1) + 1, S.heading)) return null;
    const tr = state.tr.delete(start, end);
    const $at = tr.doc.resolve(start);
    return tr.setBlockType($at.before(), $at.after(), S.heading, { level });
  };
  return inputRules({
    rules: [
      // 日本語の入力のままでも効くよう、全角の印（＃・－・＊・＞・１．・［］・｀・ーーー）と全角の空白も受ける
      blockRule(/^[#＃]{3}\s$/, heading(3)),
      blockRule(/^[#＃]{1,2}\s$/, heading(2)),
      blockRule(/^\s*[-+*・－＊＋]\s$/, (state, start, end) => paragraphToList(state, S.bullet_list, start, end)),
      blockRule(/^([0-9]+|[０-９]+)[.．]\s$/, (state, start, end) => paragraphToList(state, S.ordered_list, start, end)),
      blockRule(/^[[［]( |　|x|X|ｘ|Ｘ)?[\]］]\s$/, (state, start, end, match) => paragraphToList(state, S.task_list, start, end, /[xXｘＸ]/.test(match[1] ?? ""))),
      blockRule(/^[>＞]\s$/, (state, start, end) => {
        const tr = state.tr.delete(start, end);
        const $at = tr.doc.resolve(start);
        return tr.setBlockType($at.before(), $at.after(), S.quote);
      }),
      blockRule(/^(?:```|｀｀｀)$/, (state, start, end) => {
        const tr = state.tr.delete(start, end);
        const $at = tr.doc.resolve(start);
        return tr.setBlockType($at.before(), $at.after(), S.code_block);
      }),
      blockRule(/^(?:---|－－－|ーーー)$/, (state, start) => {
        const $start = state.doc.resolve(start);
        const tr = state.tr.replaceWith($start.before(), $start.after(), [S.rule.create(), S.paragraph.create()]);
        return tr.setSelection(TextSelection.create(tr.doc, $start.before() + 2));
      }),
      blockRule(/^※(\s)$/, (state, start, end, match) => {
        // ※ は字として残す（清書でも「※ で始まる段落」が注記）。打った空白も入れてから形だけ変える
        const tr = state.tr.insertText(match[1] ?? " ", end);
        const $at = tr.doc.resolve(start);
        return tr.setBlockType($at.before(), $at.after(), S.callout);
      }),
      markRule(/\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, M.strong, "**", "**"),
      markRule(/(?<![*\w])\*([^*\s](?:[^*]*[^*\s])?)\*$/, M.em, "*", "*"),
      markRule(/`([^`]+)`$/, M.code, "`", "`"),
    ],
  });
}

/** 本文の末尾は必ず段落（絵や区切り線のあとにも打てる場所を残す）。 */
const trailingParagraph = new Plugin({
  appendTransaction(_transactions, _old, state) {
    const last = state.doc.lastChild;
    if (last !== null && last.type === S.paragraph && state.doc.childCount > 1) return null;
    return state.tr.insert(state.doc.content.size, S.paragraph.create()).setMeta("addToHistory", false);
  },
});

/** 「/」の一覧の 1 行と、選んだときの操作（「/」と絞り込みの字を消したあとの本文に当てる）。 */
type SlashChoice = MenuChoice & { run(view: EditorView): void };
type SlashHost = { place(id: "embed" | NoteMediaKind, view: EditorView): void };

function isApple(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac OS X/.test(navigator.userAgent);
}

/**
 * 「/」の一覧。ブロックの台帳（src/lib/notes/blocks.ts）の並びのうち、いまの行で使えるもの（操作に dispatch を渡さずに聞く）だけ。
 * 表のセルの中では、表の操作の一覧になる。右端の案内は近道の札（無ければ行頭に打つ印）。
 */
function slashChoices(state: EditorState, query: string, host: SlashHost): SlashChoice[] {
  const needle = query.trim().toLowerCase();
  const hit = (label: string, words: string) => needle.length === 0 || label.toLowerCase().includes(needle) || words.includes(needle);
  if (cellAt(state) !== null) {
    return TABLE_ACTIONS.filter((one) => hit(t(one.label), one.id) && tableCommand(one.id)(state)).map((one) => ({ id: one.id, label: t(one.label), icon: one.icon, hint: "", run: (view) => tableCommand(one.id)(view.state, view.dispatch) }));
  }
  const apple = isApple();
  return NOTE_BLOCKS.filter((block) => hit(t(block.label), block.words) && blockCommand(block.id)(state)).map((block) => ({
    id: block.id,
    label: t(block.label),
    icon: block.icon,
    hint: block.keys !== null ? noteKeysLabel(block.keys, apple) : (block.cue ?? ""),
    run: (view) => {
      if (block.id === "embed" || block.id === "image" || block.id === "video") host.place(block.id, view);
      else blockCommand(block.id)(view.state, view.dispatch);
    },
  }));
}

/** 「/」の一覧の状態。打ち始めた「/」の位置と、その後ろの絞り込みの字。 */
type SlashState = { from: number; query: string; index: number } | null;
const slashKey = new PluginKey<SlashState>("note-slash");

// ---------------------------------------------------------------------------
// 組み立て
// ---------------------------------------------------------------------------

export type MountResult = { ok: true; handle: NoteEditorHandle } | { ok: false; reason: "missing" | "unsupported" };

export function mountNoteEditor(options: NoteEditorOptions): MountResult {
  const found = document.querySelector<HTMLElement>(`main[${CLEAN_COPY_DOCUMENT_ATTR}]`);
  if (found === null || active !== null) return { ok: false, reason: "missing" };
  const main: HTMLElement = found;

  // 本文の末尾の出典の札は編集の外に出す（サーバーが直す前の札をそのまま引き継ぐ・src/lib/notes/document.ts）
  const copy = withoutSourceNote(options.source);
  const opened = parseNoteMain(copy);
  if (!noteFaithful(copy, opened)) return { ok: false, reason: "unsupported" };
  setNoteEditing(true);
  options.prepare();
  const sourceNote = main.querySelector<HTMLElement>("[data-source-note]");
  if (sourceNote !== null) main.after(sourceNote);

  purgeNoteDrafts();
  const styles = mountStyles();
  const chrome = new Chrome();
  const uploads = new Map<string, Upload>();
  let view: EditorView | null = null;
  let disposed = false;

  const snapshot = (): NoteSnapshot => {
    const doc = view?.state.doc ?? opened;
    return { title: titleText(doc), body: bodyHtml(doc) };
  };
  const saver = new NoteSaver({
    pageSlug: options.pageSlug,
    baseVersionId: options.baseVersionId,
    snapshot,
    status: (state) => showStatus(state),
    named: (name) => {
      // 答えを待つ間に題を書いていたら、題のほうが新しい
      if (view === null || titleText(view.state.doc).trim().length > 0) return;
      const named = name.length > 0 ? name : t("notes.editor.untitled");
      if (document.title !== named) document.title = named;
    },
  });

  function showStatus(state: NoteSaveStatus): void {
    if (state === "conflict") chrome.status({ text: t("notes.editor.conflict"), actions: [{ label: t("notes.editor.reload"), run: () => window.location.reload() }] });
    else if (state === "offline") chrome.status({ text: t("notes.editor.offline") });
    else if (state === "failed") chrome.status({ text: t("notes.editor.unsaved"), actions: [{ label: t("notes.editor.retry"), run: () => saver.retryNow() }] });
    else chrome.status(null);
  }

  // --- 絵を置く ---------------------------------------------------------------

  function startUpload(id: string): void {
    const upload = uploads.get(id);
    if (upload === undefined) return;
    upload.failed = false;
    upload.progress = 0;
    upload.abort = new AbortController();
    const notify = (): void => {
      for (const listener of upload.listeners) listener();
    };
    notify();
    uploadNoteFile(options.pageSlug, upload.file, upload.kind, (value) => { upload.progress = value; notify(); }, upload.abort.signal).then(
      (src) => {
        upload.done = src;
        upload.progress = 100;
        settleUploads();
      },
      () => {
        if (disposed) return;
        upload.failed = true;
        notify();
      },
    );
  }

  /** 上げ終わった絵を保管庫の道筋に差し替える（取り消しの段にしない——戻すと、上げ終わった絵が端末の中の絵に戻る）。 */
  function settleUploads(): void {
    if (view === null) return;
    const tr = settleTransaction(view.state);
    if (tr !== null) view.dispatch(tr);
  }
  function settleTransaction(state: EditorState): Transaction | null {
    const fixes: Array<{ pos: number; node: PMNode; src: string }> = [];
    state.doc.descendants((node, pos) => {
      if (node.type !== S.media || typeof node.attrs.upload !== "string") return true;
      const done = uploads.get(node.attrs.upload)?.done ?? null;
      if (done !== null) fixes.push({ pos, node, src: done });
      return false;
    });
    if (fixes.length === 0) return null;
    const tr = state.tr.setMeta("addToHistory", false);
    for (const fix of fixes) tr.setNodeMarkup(fix.pos, undefined, { ...fix.node.attrs, src: fix.src, upload: null });
    return tr;
  }

  /** ファイルを、本文の index 番目のブロックの前に置く（落とした順に並ぶ）。 */
  function insertFiles(files: readonly File[], index: number): void {
    if (view === null) return;
    const nodes: PMNode[] = [];
    const started: string[] = [];
    for (const file of files) {
      const kind = noteFileKind(file);
      if (kind === null) {
        options.notify(t("notes.editor.unsupported", { name: file.name }));
        continue;
      }
      if (noteFileTooLarge(file, kind)) {
        options.notify(t("notes.editor.tooLarge", { name: file.name }));
        continue;
      }
      const id = crypto.randomUUID();
      const local = URL.createObjectURL(file);
      uploads.set(id, { file, kind, progress: 0, failed: false, done: null, abort: new AbortController(), listeners: new Set() });
      // 動画は 1 コマ目を出す（端末の中の絵のまま、上げ終わりを待たない）
      nodes.push(S.media.create({ kind, src: kind === "video" ? `${local}#t=0.1` : local, alt: file.name, upload: id }));
      started.push(id);
    }
    if (nodes.length === 0) return;
    const state = view.state;
    const clamped = Math.max(1, Math.min(index, state.doc.childCount));
    let pos = 0;
    for (let at = 0; at < clamped; at += 1) pos += state.doc.child(at).nodeSize;
    // 空の段落の上に置くなら、その段落と入れ替える（「/」から選んだとき・空の行に落としたとき）
    const target = state.doc.maybeChild(clamped);
    const replaceEmpty = target !== null && target.type === S.paragraph && target.content.size === 0 && clamped < state.doc.childCount - 1;
    const tr = replaceEmpty ? state.tr.replaceWith(pos, pos + target.nodeSize, nodes) : state.tr.insert(pos, nodes);
    view.dispatch(tr.scrollIntoView());
    for (const id of started) startUpload(id);
  }

  /** いまの行の後ろ（題なら本文の 1 行目）の、本文のブロックの番号。 */
  function indexAfterSelection(state: EditorState): number {
    const { $from } = state.selection;
    return $from.depth === 0 ? state.doc.childCount : $from.index(0) + 1;
  }

  function pickFiles(kind: NoteMediaKind, index: number): void {
    chooseNoteFiles(kind, (files) => {
      insertFiles(files, index);
      view?.focus();
    });
  }

  // --- 「/」の一覧 -------------------------------------------------------------

  const slashHost: SlashHost = {
    place: (id, editor) => {
      if (id !== "embed") {
        // 空の行（「/」を消したあとの行）なら、その行と入れ替えて置く
        pickFiles(id, editor.state.selection.$from.index(0));
        return;
      }
      askUrl(editor, t("notes.editor.embedLabel"), "", (url) => {
        if (placeUrl(editor, url, true) === "linked") options.notify(t("notes.editor.embedRefused"));
      });
    },
  };
  const matches = (state: EditorState, query: string): SlashChoice[] => slashChoices(state, query, slashHost);

  /** URL を 1 つ受ける小窓を、いまの焦点の下に開く。 */
  function askUrl(editor: EditorView, label: string, value: string, done: (url: string) => void): void {
    const at = editor.coordsAtPos(editor.state.selection.from);
    chrome.link({ x: at.left, y: at.bottom, label, value, done: (url) => { done(url); editor.focus(); }, cancel: () => editor.focus() });
  }

  function runChoice(choice: SlashChoice, slash: NonNullable<SlashState>): void {
    if (view === null) return;
    const head = view.state.selection.from;
    view.dispatch(view.state.tr.delete(slash.from, Math.max(head, slash.from + 1)).setMeta(slashKey, null));
    view.focus(); // 先に本文へ戻してから当てる（埋め込みの URL の小窓へ移った焦点を、本文が奪い返さない）
    choice.run(view);
  }

  const slashPlugin = new Plugin<SlashState>({
    key: slashKey,
    state: {
      init: () => null,
      apply(tr, value, old, state) {
        const meta: unknown = tr.getMeta(slashKey);
        if (meta !== undefined) return meta === null ? null : isSlashState(meta) ? meta : value;
        const { $from, empty } = state.selection;
        if (value === null) {
          // 「/」（日本語の入力の「／」も）を、行頭か空白の後ろに 1 字打った瞬間に開く。変換を確定した字も同じ道を通る。
          // URL や分数の「/」では開かない
          if (!tr.docChanged || !empty || state.selection.from !== old.selection.from + 1) return null;
          const parent = $from.parent;
          if (parent.type === S.code_block || parent.type === S.title || parent.type === S.toggle_summary || !parent.isTextblock) return null;
          const offset = $from.parentOffset;
          const typed = parent.textBetween(Math.max(0, offset - 1), offset);
          if (typed !== "/" && typed !== "／") return null;
          if (offset >= 2 && !/\s/.test(parent.textBetween(offset - 2, offset - 1))) return null;
          return { from: $from.pos - 1, query: "", index: 0 };
        }
        const from = tr.mapping.map(value.from);
        const mark = state.doc.textBetween(from, Math.min(from + 1, state.doc.content.size));
        // 「/」の行から出た・「/」を消した・選んだ範囲を作ったら閉じる
        if (!empty || $from.pos <= from || (mark !== "/" && mark !== "／") || state.doc.resolve(from).start() !== $from.start()) return null;
        const query = state.doc.textBetween(from + 1, $from.pos);
        if (query.length > 24 || /\s{2}/.test(query)) return null;
        return { from, query, index: query === value.query ? value.index : 0 };
      },
    },
    props: {
      handleKeyDown(editor, event) {
        const slash = slashKey.getState(editor.state);
        if (slash === null || slash === undefined) return false;
        const list = matches(editor.state, slash.query);
        if (event.key === "Escape") {
          editor.dispatch(editor.state.tr.setMeta(slashKey, null));
          return true;
        }
        if (list.length === 0) return false;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          const step = event.key === "ArrowDown" ? 1 : -1;
          editor.dispatch(editor.state.tr.setMeta(slashKey, { ...slash, index: (slash.index + step + list.length) % list.length }));
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          if (event.isComposing) return false;
          runChoice(list[Math.min(slash.index, list.length - 1)], slash);
          return true;
        }
        return false;
      },
    },
    view: () => ({
      update(editor) {
        const slash = slashKey.getState(editor.state) ?? null;
        if (slash === null) {
          chrome.menu(null);
          return;
        }
        const list = matches(editor.state, slash.query);
        const at = editor.coordsAtPos(slash.from);
        chrome.menu({
          x: at.left,
          y: at.bottom,
          label: cellAt(editor.state) !== null ? t("notes.blocks.table") : t("notes.editor.menu"),
          choices: list,
          index: Math.min(slash.index, Math.max(0, list.length - 1)),
          pick: (id) => {
            const choice = list.find((one) => one.id === id);
            const current = slashKey.getState(editor.state);
            if (choice !== undefined && current !== null && current !== undefined) runChoice(choice, current);
          },
        });
      },
      destroy() {
        chrome.menu(null);
      },
    }),
  });

  // --- リンク（⌘K）------------------------------------------------------------

  const openLink: Command = (state, dispatch, editor) => {
    if (editor === undefined) return false;
    const { from, to, empty } = state.selection;
    if (!state.selection.$from.parent.type.allowsMarkType(M.link)) return false;
    if (!dispatch) return true;
    const existing = state.doc.rangeHasMark(from, to, M.link) ? state.selection.$from.marks().find((mark) => mark.type === M.link) : undefined;
    const at = editor.coordsAtPos(from);
    chrome.link({
      x: at.left,
      y: at.bottom,
      label: t("notes.editor.linkLabel"),
      value: existing === undefined ? "" : String(existing.attrs.href),
      done: (href) => {
        const tr = editor.state.tr;
        const text = href.trim();
        if (text.length === 0) tr.removeMark(from, to, M.link);
        else if (LINK_HREF.test(text)) {
          if (empty) tr.insertText(text, from).addMark(from, from + text.length, M.link.create({ href: text }));
          else tr.removeMark(from, to, M.link).addMark(from, to, M.link.create({ href: text }));
        }
        editor.dispatch(tr);
        editor.focus();
      },
      cancel: () => editor.focus(),
    });
    return true;
  };

  // --- 確認の箱を押す ----------------------------------------------------------

  function toggleTask(editor: EditorView, target: Element): boolean {
    const box = target.closest("[data-note-box]");
    if (box === null || !editor.dom.contains(box)) return false;
    const item = box.closest("li");
    if (item === null) return false;
    const pos = editor.posAtDOM(item, 0) - 1;
    const node = editor.state.doc.nodeAt(pos);
    if (node === null || node.type !== S.task_item) return false;
    editor.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { checked: node.attrs.checked !== true }));
    return true;
  }

  // --- 組み立てる --------------------------------------------------------------

  // 近道（台帳の keys）。本文に焦点があるときだけ効く（芯の keymap なので、本文の外では効かない）
  const blockKeys: Record<string, Command> = {};
  for (const block of NOTE_BLOCKS) if (block.keys !== null) blockKeys[block.keys] = blockCommand(block.id);

  function createState(doc: PMNode): EditorState {
    return EditorState.create({
      schema: noteSchema,
      doc: withTrailingParagraph(doc),
      plugins: [
        slashPlugin,
        noteInputRules(),
        keymap({
          "Mod-z": undo,
          "Shift-Mod-z": redo,
          "Mod-y": redo,
          "Mod-b": toggleMark(M.strong),
          "Mod-i": toggleMark(M.em),
          "Mod-e": toggleMark(M.code),
          "Mod-k": openLink,
          "Mod-Shift-ArrowUp": moveUnit(-1),
          "Mod-Shift-ArrowDown": moveUnit(1),
          Tab: chainCommands(moveCell(1), indent(true)),
          "Shift-Tab": chainCommands(moveCell(-1), indent(false)),
          "Mod-Enter": toggleOpen,
          Enter: chainCommands(enterInTitle, enterInCaption, enterInEmbedCaption, enterInCell, enterInSummary, enterOnEmptyToggleLine, enterOnEmptyItem, splitListItem(S.list_item), splitListItem(S.task_item)),
          "Shift-Enter": (state, dispatch) => {
            if (state.selection.$from.parent.type === S.title) return true;
            if (!state.selection.$from.parent.type.contentMatch.matchType(S.hard_break)) return false;
            if (dispatch) dispatch(state.tr.replaceSelectionWith(S.hard_break.create()).scrollIntoView());
            return true;
          },
          Backspace: chainCommands(backspaceInCell, unwrapToggle, backspaceAtStart),
          ArrowUp: arrowUpAtBodyStart,
          Delete: deleteAtTitleEnd,
          ...blockKeys,
        }),
        keymap(baseKeymap),
        history(),
        trailingParagraph,
        tableShape,
        placeholders(),
        new Plugin({
          appendTransaction: (_transactions, _old, next) => settleTransaction(next),
        }),
      ],
    });
  }

  function createView(state: EditorState): EditorView {
    return new EditorView(
      { mount: main },
      {
        state,
        nodeViews: { media: (node) => new MediaView(node, uploads, startUpload), heading: (node) => new HeadingView(node), toggle: (node, editor, getPos) => new ToggleView(node, editor, getPos), embed: (node) => new EmbedView(node) },
        attributes: { spellcheck: "true", "aria-label": t("notes.editor.label") },
        dispatchTransaction(tr) {
          const editor = view;
          if (editor === null) return;
          editor.updateState(editor.state.apply(tr));
          if (tr.docChanged) {
            saver.changed();
            // ページの名前は題があれば題。題が無ければ本文の冒頭から決まるので、保存の答え（named）で書き直す
            const title = titleText(editor.state.doc).trim();
            if (title.length > 0 && document.title !== title) document.title = title;
          }
          chrome.hideHandle();
        },
        handleDOMEvents: {
          mousedown(editor, event) {
            if (event.target instanceof Element && toggleTask(editor, event.target)) {
              event.preventDefault();
              return true;
            }
            return false;
          },
          dragover(editor, event) {
            if (!hasFiles(event)) return false;
            event.preventDefault();
            if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "copy";
            chrome.line(dropTarget(editor, event.clientY));
            return true;
          },
          dragleave(editor, event) {
            if (!(event.relatedTarget instanceof Node) || !editor.dom.contains(event.relatedTarget)) chrome.line(null);
            return false;
          },
          drop(editor, event) {
            if (!hasFiles(event) || event.dataTransfer === null) return false;
            event.preventDefault();
            const target = dropTarget(editor, event.clientY);
            chrome.line(null);
            insertFiles([...event.dataTransfer.files], target.index);
            return true;
          },
        },
        handlePaste(editor, event) {
          // URL を 1 つだけ貼ったら、許可した動画サイトは空の行で埋め込みに、それ以外はリンクに
          const url = pastedUrl(event);
          if (url !== null && editor.state.selection.$from.parent.type !== S.code_block && placeUrl(editor, url, false) !== null) return true;
          const files = [...(event.clipboardData?.files ?? [])];
          if (files.length === 0 || files.some((file) => noteFileKind(file) === null)) return false;
          insertFiles(files, indexAfterSelection(editor.state));
          return true;
        },
      },
    );
  }

  // 開いたときの本文（配信された清書）を読み、同じ見た目で描き直す
  view = createView(createState(opened));
  saver.settle();

  // 控えが残っていたら戻す（同じ版が土台なら黙って・違えば保存の 1 行で聞く）
  const draft = readNoteDraft(options.pageSlug);
  if (draft !== null) {
    const now = snapshot();
    if (draft.title !== now.title || draft.body !== now.body) {
      const restore = (): void => {
        if (view === null) return;
        const restored = docFromParts(draft.title, draft.body);
        view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, restored.content));
        chrome.status(null);
      };
      if (draft.base === options.baseVersionId) restore();
      else {
        chrome.status({
          text: t("notes.editor.draftFound"),
          actions: [
            { label: t("notes.editor.restore"), run: restore },
            { label: t("notes.editor.discard"), run: () => { clearNoteDraft(options.pageSlug); chrome.status(null); } },
          ],
        });
      }
    } else clearNoteDraft(options.pageSlug);
  }
  view.focus();

  // --- 取っ手（指を乗せた行の左にだけ）-------------------------------------

  let hovered: Unit | null = null;
  const onPointerMove = (event: PointerEvent): void => {
    // 指では取っ手を出さない（長押しでつかむ・src/widget/editor/note-touch.ts）
    if (view === null || chrome.dragging || event.pointerType === "touch") return;
    const box = main.getBoundingClientRect();
    if (event.clientY < box.top || event.clientY > box.bottom || event.clientX < box.left - 96 || event.clientX > box.right) {
      chrome.hideHandle();
      hovered = null;
      return;
    }
    const unit = unitAt(view, event.clientY);
    if (unit === null) {
      chrome.hideHandle();
      hovered = null;
      return;
    }
    hovered = unit;
    const dom = view.nodeDOM(unit.pos);
    if (dom instanceof HTMLElement) chrome.showHandle(dom, unit.node.type === S.list_item || unit.node.type === S.task_item);
  };
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  const onKeyDown = (): void => chrome.hideHandle();
  window.addEventListener("keydown", onKeyDown, true);

  /** いまの行の後ろに「/」だけの行を足して一覧を開く（取っ手の ＋・キーボードの上の道具）。 */
  const openBlocksAfter = (at: Unit | null): void => {
    if (view === null) return;
    const index = at === null ? view.state.selection.$from.index(0) + 1 : view.state.doc.resolve(at.pos).index(0) + 1;
    let pos = 0;
    for (let child = 0; child < Math.min(index, view.state.doc.childCount); child += 1) pos += view.state.doc.child(child).nodeSize;
    const tr = view.state.tr.insert(pos, S.paragraph.create(null, noteSchema.text("/")));
    tr.setSelection(TextSelection.create(tr.doc, pos + 2)).setMeta(slashKey, { from: pos + 1, query: "", index: 0 });
    view.dispatch(tr);
    view.focus();
  };
  chrome.onPlus = () => {
    if (hovered !== null) openBlocksAfter(hovered);
  };

  /** 1 つ（ブロック・箇条書きの 1 行）をつかんで動かす。取っ手からも、指の長押しからも同じ。 */
  const grab = (unit: Unit, start: DragStart): boolean => {
    if (view === null) return false;
    const editor = view;
    const siblings = siblingsOf(editor, unit.pos);
    const from = siblings.findIndex((one) => one.pos === unit.pos);
    const dom = editor.nodeDOM(unit.pos);
    if (from < 0 || !(dom instanceof HTMLElement)) return false;
    main.classList.add("is-note-grabbing");
    chrome.drag(start, dom, unit.node.type === S.list_item || unit.node.type === S.task_item, {
      end: () => main.classList.remove("is-note-grabbing"),
      target: (y) => boundary(siblings, y),
      drop: (index) => {
        if (index === from || index === from + 1) return;
        const insertAt = index >= siblings.length ? siblings[siblings.length - 1].pos + siblings[siblings.length - 1].node.nodeSize : siblings[index].pos;
        const tr = editor.state.tr.delete(unit.pos, unit.pos + unit.node.nodeSize);
        const mapped = tr.mapping.map(insertAt);
        tr.insert(mapped, unit.node);
        tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(mapped + 1, tr.doc.content.size))));
        editor.dispatch(tr.scrollIntoView());
        editor.focus();
      },
    });
    return true;
  };
  chrome.onGrab = (event) => {
    if (hovered !== null) grab(hovered, event);
  };

  const unmountTouch = mountNoteTouch({
    // 指の画面: 行の長押しでつかむ・キーボードの上の 1 列の道具
    main,
    chrome,
    focused: () => view !== null && view.hasFocus(),
    grab: (clientY) => {
      const unit = view === null ? null : unitAt(view, clientY);
      return unit !== null && grab(unit, { touchY: clientY });
    },
    apply: (id) => {
      if (view === null) return;
      if (id === "image" || id === "video" || id === "embed") slashHost.place(id, view);
      else blockCommand(id)(view.state, view.dispatch);
    },
    available: (id) => view !== null && blockCommand(id)(view.state),
    openBlocks: () => openBlocksAfter(null),
  });

  const handle: NoteEditorHandle = {
    finish: () => saver.finish(),
    destroy() {
      if (disposed) return;
      disposed = true;
      saver.flush(true);
      saver.dispose();
      for (const upload of uploads.values()) upload.abort.abort();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("keydown", onKeyDown, true);
      unmountTouch();
      view?.destroy();
      view = null;
      chrome.dispose();
      styles.remove();
      setNoteEditing(false);
      active = null;
    },
  };
  active = handle;
  return { ok: true, handle };
}

/** 出典の札を除いた本文の写し（読み込みの外の文書に作る。写しの絵が素材を取りに行かない）。 */
function withoutSourceNote(main: HTMLElement): HTMLElement {
  const inert = document.implementation.createHTMLDocument("");
  const copy = inert.importNode(main, true);
  for (const note of copy.querySelectorAll("[data-source-note]")) note.remove();
  return copy;
}

function isSlashState(value: unknown): value is NonNullable<SlashState> {
  return typeof value === "object" && value !== null && typeof Reflect.get(value, "from") === "number" && typeof Reflect.get(value, "query") === "string" && typeof Reflect.get(value, "index") === "number";
}

function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer !== null && [...event.dataTransfer.types].includes("Files");
}

/** 指の高さにある、動かせる 1 つ（箇条書きなら 1 行・それ以外は本文のブロック）。 */
function unitAt(view: EditorView, clientY: number): Unit | null {
  const box = view.dom.getBoundingClientRect();
  const probe = view.posAtCoords({ left: box.left + box.width / 2, top: clientY });
  if (probe === null) return null;
  const doc = view.state.doc;
  if (probe.inside >= 0) {
    const $inside = doc.resolve(probe.inside);
    const node = doc.nodeAt(probe.inside);
    if (node !== null && $inside.depth === 0 && node.type !== S.title && !node.isTextblock) return { pos: probe.inside, node, depth: 1 };
  }
  return unitOf(doc.resolve(probe.pos));
}

/** 同じ入れ物の中の兄弟（本文なら題を除く）。 */
function siblingsOf(view: EditorView, pos: number): Array<{ pos: number; node: PMNode; dom: HTMLElement }> {
  const $pos = view.state.doc.resolve(pos);
  const parent = $pos.parent;
  const start = $pos.start();
  const out: Array<{ pos: number; node: PMNode; dom: HTMLElement }> = [];
  parent.forEach((node, offset, index) => {
    if (parent.type === S.doc && index === 0) return;
    const dom = view.nodeDOM(start + offset);
    if (dom instanceof HTMLElement) out.push({ pos: start + offset, node, dom });
  });
  return out;
}

/** 指の高さに一番近いブロックの境（何番目の前か）と、線を引く場所。 */
function boundary(siblings: ReadonlyArray<{ dom: HTMLElement }>, y: number): { index: number; top: number; left: number; width: number } {
  let index = siblings.length;
  for (let at = 0; at < siblings.length; at += 1) {
    const rect = siblings[at].dom.getBoundingClientRect();
    if (y < rect.top + rect.height / 2) {
      index = at;
      break;
    }
  }
  const before = index > 0 ? siblings[index - 1].dom.getBoundingClientRect() : null;
  const after = index < siblings.length ? siblings[index].dom.getBoundingClientRect() : null;
  const top = before !== null && after !== null ? (before.bottom + after.top) / 2 : before !== null ? before.bottom + 4 : after !== null ? after.top - 4 : y;
  const anchor = after ?? before;
  return { index, top, left: anchor?.left ?? 0, width: anchor?.width ?? 0 };
}

/** ファイルを落とす先（本文のブロックの境・題の前には置かない）。 */
function dropTarget(view: EditorView, y: number): { index: number; top: number; left: number; width: number } {
  const siblings = siblingsOf(view, 0);
  const found = boundary(siblings, y);
  // 兄弟の番号は題を除いて数えているので、本文の番号に直す
  return { ...found, index: found.index + 1 };
}

function mountStyles(): HTMLStyleElement {
  const style = document.createElement("style");
  style.setAttribute("data-note-editor-style", "");
  style.textContent = NOTE_LIGHT_CSS;
  document.head.append(style);
  return style;
}
