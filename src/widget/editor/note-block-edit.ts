import { setBlockType } from "prosemirror-commands";
import type { Node as PMNode, NodeType, ResolvedPos } from "prosemirror-model";
import { liftListItem } from "prosemirror-schema-list";
import { Plugin, TextSelection, type Command, type EditorState, type Transaction } from "prosemirror-state";
import { StepMap } from "prosemirror-transform";
import type { EditorView, NodeView } from "prosemirror-view";
import { youtubeId } from "../../lib/deck/media/media";
import { noteEmbedFrame, NOTE_OWN_LOOK, NOTE_TABLE_DEFAULT, NOTE_TABLE_MAX_COLUMNS, NOTE_TABLE_MAX_ROWS, type NoteBlockId } from "../../lib/notes/blocks";
import type { MessageKey } from "../../lib/i18n/messages/types";
import { t } from "../shared/i18n";
import { LINK_HREF, NOTE_CAPTION_CLASS, NOTE_EMBED_CLASS, noteSchema } from "./note-schema";

/**
 * メモ帳のブロックを変える・置く操作。ブロックの台帳（src/lib/notes/blocks.ts）の 1 つずつに、ここの操作が 1 つ当たる。
 * 「/」の一覧も近道も同じ `blockCommand` を呼ぶので、一覧で選んでも近道で押しても同じに変わる。
 *
 * 操作は ProseMirror の Command（dispatch を渡さなければ「いまここで使えるか」だけを答える）。一覧はこの答えで、
 * いまの行で使えないブロック（トグルの中の見出し・表のセルの中の箇条書きなど）を出さない。
 *
 * 表（行の長さをそろえる・1 行目を見出しにする後始末・Tab と Enter でセルを渡る・表の中の「/」の操作）と、
 * トグル（頭の行の Enter・⌘Enter で開け閉め・行頭の Backspace で外す）と、URL を貼ったときの埋め込みもここに置く。
 */

const S = noteSchema.nodes;
const M = noteSchema.marks;

// ---------------------------------------------------------------------------
// 箇条書き（トグルの中でも同じに効くよう、深さを親の種類で見る）
// ---------------------------------------------------------------------------

export function itemDepth($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const type = $pos.node(depth).type;
    if (type === S.list_item || type === S.task_item) return depth;
  }
  return null;
}

/** その深さの箇条書きの行が、ほかの行の中に入れ子になっているか（いちばん外の行でないか）。 */
export function nestedItem($pos: ResolvedPos, depth: number): boolean {
  return depth >= 3 && $pos.node(depth - 2).type === S.list_item;
}

/** 段落を箇条書き・番号付き・確認の箱に変える（段落の字はそのまま 1 行目へ）。トグルの中の段落も変えられる。 */
export function paragraphToList(state: EditorState, listType: NodeType, from: number, to: number, checked = false): Transaction | null {
  const $from = state.doc.resolve(from);
  const paragraph = $from.parent;
  if (paragraph.type !== S.paragraph || $from.depth < 1) return null;
  const index = $from.index(-1);
  if (!$from.node(-1).canReplaceWith(index, index + 1, listType)) return null;
  const start = $from.start();
  const rest = paragraph.content.cut(to - start);
  const text = S.item_text.create(null, rest);
  const item = listType === S.task_list ? S.task_item.create({ checked }, text) : S.list_item.create(null, text);
  const list = listType.create(null, item);
  const before = $from.before();
  // 焦点は字の中の同じ位置のまま（行頭の印から作ったときは印を消した頭・字のある段落を変えたときは打っていた位置）
  const caret = Math.max(0, Math.min(state.selection.head - start, paragraph.content.size) - (to - start));
  const tr = state.tr.replaceWith(before, $from.after(), list);
  return tr.setSelection(TextSelection.create(tr.doc, before + 3 + caret));
}

/**
 * 箇条書きの 1 行を段落に戻す（行頭で Backspace・空の行で Enter）。前後の行は箇条書きのまま 2 つに分かれる。
 * 入れ子の行は 1 段だけ浅くする（いちばん外の行だけが段落になる）。
 */
export const itemToParagraph: Command = (state, dispatch) => {
  const { $from } = state.selection;
  const depth = itemDepth($from);
  if (depth === null) return false;
  if (nestedItem($from, depth)) return liftListItem($from.node(depth).type)(state, dispatch);
  const list = $from.node(depth - 1);
  const index = $from.index(depth - 1);
  const item = list.child(index);
  const pieces: PMNode[] = [];
  const head: PMNode[] = [];
  const tail: PMNode[] = [];
  list.forEach((child, _offset, at) => {
    if (at < index) head.push(child);
    else if (at > index) tail.push(child);
  });
  if (head.length > 0) pieces.push(list.type.create(list.attrs, head));
  const text = item.firstChild;
  pieces.push(S.paragraph.create(null, text === null ? null : text.content));
  item.forEach((child, _offset, at) => {
    if (at > 0) pieces.push(child);
  });
  if (tail.length > 0) pieces.push(list.type.create(list.attrs, tail));
  if (!dispatch) return true;
  const start = $from.before(depth - 1);
  const tr = state.tr.replaceWith(start, $from.after(depth - 1), pieces);
  const paragraphAt = start + (head.length > 0 ? pieces[0].nodeSize : 0);
  dispatch(tr.setSelection(TextSelection.create(tr.doc, paragraphAt + 1 + Math.max(0, $from.parentOffset))).scrollIntoView());
  return true;
};

// ---------------------------------------------------------------------------
// ブロックを変える・置く
// ---------------------------------------------------------------------------

/** 字を打つ行の種類のうち、ほかの種類へ変えてよいもの（題・表のセル・トグルの頭の行・添え書きは変えない）。 */
function convertible(node: PMNode): boolean {
  return node.type === S.paragraph || node.type === S.heading || node.type === S.quote || node.type === S.callout || node.type === S.code_block || node.type === S.item_text;
}

/** 2 つの操作を続けて 1 つの手番に（箇条書きの行を段落に戻してから見出しにする、など）。 */
function then(first: Command, second: Command): Command {
  return (state, dispatch) => {
    let tr: Transaction | null = null;
    if (!first(state, (made) => { tr = made; })) return false;
    if (tr === null) return false;
    const done: Transaction = tr;
    const next = state.apply(done);
    let followed: Transaction | null = null;
    if (!second(next, (made) => { followed = made; })) return false;
    if (followed === null) return false;
    if (dispatch) {
      const last: Transaction = followed;
      for (const step of last.steps) done.step(step);
      // 2 つめの手番の選び方は、つないだあとの文書の位置そのまま（文書は同じ形になっている）
      done.setSelection(last.selection.map(done.doc, StepMap.empty));
      dispatch(done.scrollIntoView());
    }
    return true;
  };
}

/** いまの行を、字を打つ別の種類（段落・見出し・引用・注記・コード）へ。箇条書きの中なら、まず段落に戻す。 */
function toTextblock(type: NodeType, attrs: Record<string, unknown> | null = null): Command {
  const set = setBlockType(type, attrs);
  return (state, dispatch) => {
    const parent = state.selection.$from.parent;
    if (!convertible(parent)) return false;
    if (parent.type === S.item_text) return then(itemToParagraph, set)(state, dispatch);
    return set(state, dispatch);
  };
}

/** いまの行を箇条書き・番号付き・確認の箱へ。 */
function toList(listType: NodeType): Command {
  const fromParagraph: Command = (state, dispatch) => {
    const { $from } = state.selection;
    const made = paragraphToList(state, listType, $from.start(), $from.start());
    if (made === null) return false;
    if (dispatch) dispatch(made.scrollIntoView());
    return true;
  };
  return (state, dispatch) => {
    const parent = state.selection.$from.parent;
    if (!convertible(parent) || parent.type === S.code_block) return false;
    if (parent.type === S.item_text) return then(itemToParagraph, fromParagraph)(state, dispatch);
    if (parent.type !== S.paragraph) return then(setBlockType(S.paragraph), fromParagraph)(state, dispatch);
    return fromParagraph(state, dispatch);
  };
}

/** いまの段落をトグルの頭の行にする（中身は空の段落 1 つ・開いた状態）。トグルは本文の直下にだけ置ける。 */
const toToggle: Command = (state, dispatch) => {
  const { $from } = state.selection;
  if ($from.depth !== 1 || !convertible($from.parent) || $from.parent.type === S.code_block) return false;
  if (!dispatch) return true;
  const toggle = S.toggle.create({ open: true }, [S.toggle_summary.create(null, $from.parent.content), S.toggle_body.create(null, S.paragraph.create())]);
  const before = $from.before();
  const tr = state.tr.replaceWith(before, $from.after(), toggle);
  dispatch(tr.setSelection(TextSelection.create(tr.doc, before + 2 + $from.parentOffset)).scrollIntoView());
  return true;
};

/** ブロックを、いまの行の後ろに置く（いまの行が空の段落なら、その段落と入れ替える）。置いたあとの焦点の位置は `focus` が決める。 */
function placeBlock(make: () => PMNode, focus: (start: number) => number | null): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    if ($from.depth < 1 || $from.parent.type === S.title) return false;
    // 置く先はいまの行が入っているブロック（箇条書きならその箇条書きの塊）の後ろ
    let depth = $from.depth;
    while (depth > 1 && !$from.node(depth - 1).type.contentMatch.matchType(S.paragraph)) depth -= 1;
    const container = $from.node(depth - 1);
    const node = make();
    const index = $from.index(depth - 1);
    const block = $from.node(depth);
    const replace = block.type === S.paragraph && block.content.size === 0;
    if (replace ? !container.canReplaceWith(index, index + 1, node.type) : !container.canReplaceWith(index + 1, index + 1, node.type)) return false;
    if (!dispatch) return true;
    const at = replace ? $from.before(depth) : $from.after(depth);
    const tr = replace ? state.tr.replaceWith(at, $from.after(depth), node) : state.tr.insert(at, node);
    const target = focus(at);
    if (target !== null) tr.setSelection(TextSelection.near(tr.doc.resolve(target)));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

/** 空の表（見出しの行 + 本文の行）。 */
export function emptyTable(columns: number = NOTE_TABLE_DEFAULT.columns, rows: number = NOTE_TABLE_DEFAULT.rows): PMNode {
  const row = (index: number) => S.table_row.create(null, Array.from({ length: columns }, () => (index === 0 ? S.table_header : S.table_cell).create()));
  return S.table.create(null, Array.from({ length: rows }, (_, index) => row(index)));
}

/** 区切り線を、いまの行の前に置く（行頭の `---` と同じ並び）。 */
const insertRule: Command = (state, dispatch) => {
  const { $from } = state.selection;
  if ($from.depth < 1) return false;
  const container = $from.node(-1);
  const index = $from.index(-1);
  if (!container.canReplaceWith(index, index, S.rule)) return false;
  if (dispatch) dispatch(state.tr.insert($from.before(), S.rule.create()));
  return true;
};

/** 埋め込みを、いまの行の後ろに（空の段落なら入れ替えて）置く。 */
export function insertEmbed(id: string): Command {
  return placeBlock(() => S.embed.create({ id }), (start) => start + 1);
}

/** 本文の直下にだけ置けるブロック（絵）か。絵は落とす場所が本文の行の間だけ。 */
export function atTopLevel(state: EditorState): boolean {
  return state.selection.$from.depth === 1 && state.selection.$from.parent.type !== S.title;
}

/**
 * 台帳のブロック 1 つに当たる操作。絵（画像・動画・音声）と埋め込みは、ファイルや URL を受けてから置くので、
 * ここでは「いま置けるか」だけを答え、実際の置き方は編集の部品（src/widget/editor/note-editor.ts）が持つ。
 */
export function blockCommand(id: NoteBlockId): Command {
  switch (id) {
    case "paragraph":
      return toTextblock(S.paragraph);
    case "h2":
      return toTextblock(S.heading, { level: 2 });
    case "h3":
      return toTextblock(S.heading, { level: 3 });
    case "quote":
      return toTextblock(S.quote);
    case "callout":
      return toTextblock(S.callout);
    case "code":
      return toTextblock(S.code_block);
    case "bullet":
      return toList(S.bullet_list);
    case "ordered":
      return toList(S.ordered_list);
    case "task":
      return toList(S.task_list);
    case "toggle":
      return toToggle;
    case "table":
      // 置いたら見出しの行の 1 つめのセルへ
      return placeBlock(() => emptyTable(), (start) => start + 3);
    case "rule":
      return insertRule;
    case "embed":
      // URL を受けてから置く（ここでは置ける場所かだけ）
      return placeBlock(() => S.embed.create(), () => null);
    case "image":
    case "video":
      return (state) => atTopLevel(state);
  }
}

// ---------------------------------------------------------------------------
// 表
// ---------------------------------------------------------------------------

type CellAt = { table: PMNode; tablePos: number; row: number; column: number };

/** いまの焦点が入っている表のセル（表の外なら null）。 */
export function cellAt(state: EditorState): CellAt | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth >= 3; depth -= 1) {
    const node = $from.node(depth);
    if (node.type === S.table_cell || node.type === S.table_header) {
      return { table: $from.node(depth - 2), tablePos: $from.before(depth - 2), row: $from.index(depth - 2), column: $from.index(depth - 1) };
    }
  }
  return null;
}

/** 表の (row, column) のセルの中の、字の始まりの位置。 */
function cellStart(table: PMNode, tablePos: number, row: number, column: number): number {
  let pos = tablePos + 1;
  for (let at = 0; at < row; at += 1) pos += table.child(at).nodeSize;
  pos += 1;
  const cells = table.child(row);
  for (let at = 0; at < column; at += 1) pos += cells.child(at).nodeSize;
  return pos + 1;
}

/** 表を作り直す（行・列の足し引き）。形の後始末（見出しの行・長さ）は tableShape が受け持つ。 */
function rebuildTable(state: EditorState, at: CellAt, rows: PMNode[][], focus: { row: number; column: number }): Transaction {
  const table = S.table.create(null, rows.map((cells) => S.table_row.create(null, cells)));
  const tr = state.tr.replaceWith(at.tablePos, at.tablePos + at.table.nodeSize, table);
  const row = Math.max(0, Math.min(focus.row, rows.length - 1));
  const column = Math.max(0, Math.min(focus.column, (rows[row]?.length ?? 1) - 1));
  return tr.setSelection(TextSelection.create(tr.doc, cellStart(table, at.tablePos, row, column)));
}

function rowsOf(table: PMNode): PMNode[][] {
  const rows: PMNode[][] = [];
  table.forEach((row) => {
    const cells: PMNode[] = [];
    row.forEach((cell) => cells.push(cell));
    rows.push(cells);
  });
  return rows;
}

export type TableAction = "row-below" | "column-right" | "row-delete" | "column-delete" | "table-delete";
/** 表の中で「/」を打ったときの一覧（並び・名前・絵）。 */
export const TABLE_ACTIONS: ReadonlyArray<{ id: TableAction; label: MessageKey; icon: readonly string[] }> = [
  { id: "row-below", label: "notes.editor.tableRowBelow", icon: ["M12 5v14", "M5 12h14"] },
  { id: "column-right", label: "notes.editor.tableColumnRight", icon: ["M12 5v14", "M5 12h14"] },
  { id: "row-delete", label: "notes.editor.tableRowDelete", icon: ["M5 12h14"] },
  { id: "column-delete", label: "notes.editor.tableColumnDelete", icon: ["M5 12h14"] },
  { id: "table-delete", label: "notes.editor.tableDelete", icon: ["M3 6h18", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"] },
];

/** その表に、その操作ができるか（行・列は上限まで足せ、最後の 1 行・1 列は消さない。表ごと消すのは「表を消す」）。 */
function tableAllows(action: TableAction, rows: number, width: number): boolean {
  switch (action) {
    case "row-below":
      return rows < NOTE_TABLE_MAX_ROWS;
    case "column-right":
      return width < NOTE_TABLE_MAX_COLUMNS;
    case "row-delete":
      return rows > 1;
    case "column-delete":
      return width > 1;
    case "table-delete":
      return true;
  }
}

/** 行・列を足し引きして、あとの焦点の位置を返す（表ごと消すのは呼ぶ側）。 */
function editRows(action: TableAction, rows: PMNode[][], at: CellAt): { row: number; column: number } {
  const width = rows[0]?.length ?? 0;
  switch (action) {
    case "row-below":
      rows.splice(at.row + 1, 0, Array.from({ length: width }, () => S.table_cell.create()));
      return { row: at.row + 1, column: at.column };
    case "column-right":
      for (const [index, cells] of rows.entries()) cells.splice(at.column + 1, 0, (index === 0 ? S.table_header : S.table_cell).create());
      return { row: at.row, column: at.column + 1 };
    case "row-delete":
      rows.splice(at.row, 1);
      return { row: at.row, column: at.column };
    case "column-delete":
      for (const cells of rows) cells.splice(at.column, 1);
      return { row: at.row, column: at.column };
    case "table-delete":
      return { row: 0, column: 0 };
  }
}

/** 表の操作（表の中の「/」の一覧・セルの Enter と Tab が呼ぶ）。 */
export function tableCommand(action: TableAction): Command {
  return (state, dispatch) => {
    const at = cellAt(state);
    if (at === null) return false;
    const rows = rowsOf(at.table);
    if (!tableAllows(action, rows.length, rows[0]?.length ?? 0)) return false;
    if (!dispatch) return true;
    if (action === "table-delete") {
      const tr = state.tr.replaceWith(at.tablePos, at.tablePos + at.table.nodeSize, S.paragraph.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, at.tablePos + 1)).scrollIntoView());
      return true;
    }
    const focus = editRows(action, rows, at);
    dispatch(rebuildTable(state, at, rows, focus).scrollIntoView());
    return true;
  };
}

/** Tab / Shift+Tab でセルを渡る。最後のセルで Tab を押すと行を 1 つ足して、その 1 つめへ。 */
export function moveCell(direction: 1 | -1): Command {
  return (state, dispatch) => {
    const at = cellAt(state);
    if (at === null) return false;
    const width = at.table.child(0).childCount;
    const index = at.row * width + at.column + direction;
    if (index < 0) return true;
    if (index >= at.table.childCount * width) {
      if (at.table.childCount >= NOTE_TABLE_MAX_ROWS) return true;
      const rows = rowsOf(at.table);
      rows.push(Array.from({ length: width }, () => S.table_cell.create()));
      if (dispatch) dispatch(rebuildTable(state, at, rows, { row: rows.length - 1, column: 0 }).scrollIntoView());
      return true;
    }
    if (dispatch) {
      const target = cellStart(at.table, at.tablePos, Math.floor(index / width), index % width);
      const cell = state.doc.resolve(target).parent;
      // 渡った先のセルの字は丸ごと選ぶ（そのまま打てば書き換わる・表計算と同じ）
      dispatch(state.tr.setSelection(TextSelection.create(state.doc, target, target + cell.content.size)).scrollIntoView());
    }
    return true;
  };
}

/** セルの中の Enter。下のセルへ（最後の行なら行を 1 つ足して）。セルの中の改行は Shift+Enter。 */
export const enterInCell: Command = (state, dispatch) => {
  const at = cellAt(state);
  if (at === null) return false;
  if (at.row + 1 < at.table.childCount) {
    if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, cellStart(at.table, at.tablePos, at.row + 1, at.column))).scrollIntoView());
    return true;
  }
  return tableCommand("row-below")(state, dispatch) || true;
};

/** セルの頭の Backspace は、前のセルと混ぜない（何もしない）。 */
export const backspaceInCell: Command = (state) => {
  const { $from, empty } = state.selection;
  return empty && $from.parentOffset === 0 && cellAt(state) !== null;
};

/**
 * 表の形の後始末。どの操作のあとでも、1 行目は見出しのセル・2 行目からは本文のセル・行の長さは一番長い行にそろう。
 * 貼り付けや行の削除で崩れた形を、送る前にここで直す（サーバーも同じ形に組むが、編集中の見た目も合わせる）。
 */
export const tableShape = new Plugin({
  appendTransaction(transactions, _old, state) {
    if (!transactions.some((tr) => tr.docChanged)) return null;
    let tr: Transaction | null = null;
    state.doc.descendants((node, pos) => {
      if (node.type !== S.table) return node.type === S.toggle || node.type === S.toggle_body;
      const width = Math.max(1, ...rowsOf(node).map((cells) => cells.length));
      let changed = false;
      const rows = rowsOf(node).map((cells, index) => {
        const want = index === 0 ? S.table_header : S.table_cell;
        const fixed = cells.map((cell) => {
          if (cell.type === want) return cell;
          changed = true;
          return want.create(null, cell.content);
        });
        while (fixed.length < width) {
          changed = true;
          fixed.push(want.create());
        }
        return fixed;
      });
      if (!changed) return false;
      tr ??= state.tr.setMeta("addToHistory", false);
      const mapped = tr.mapping.map(pos);
      tr.replaceWith(mapped, mapped + node.nodeSize, S.table.create(null, rows.map((cells) => S.table_row.create(null, cells))));
      return false;
    });
    return tr;
  },
});

// ---------------------------------------------------------------------------
// トグル
// ---------------------------------------------------------------------------

/** いまの焦点が入っているトグル（頭の行か中身）。 */
function toggleAt(state: EditorState): { node: PMNode; pos: number; inSummary: boolean } | null {
  const { $from } = state.selection;
  if ($from.depth < 2 || $from.node(1).type !== S.toggle) return null;
  return { node: $from.node(1), pos: $from.before(1), inSummary: $from.parent.type === S.toggle_summary };
}

/** トグルの開け閉め（⌘Enter・行頭の三角）。閉じるときに中身に焦点があれば、頭の行の終わりへ移す。 */
export const toggleOpen: Command = (state, dispatch) => {
  const at = toggleAt(state);
  if (at === null) return false;
  if (!dispatch) return true;
  dispatch(openToggle(state, at.pos, at.node.attrs.open !== true));
  return true;
};

/** 位置 pos のトグルを開く・閉じる手番。 */
export function openToggle(state: EditorState, pos: number, open: boolean): Transaction {
  const node = state.doc.nodeAt(pos);
  const tr = state.tr.setNodeMarkup(pos, undefined, { ...node?.attrs, open });
  const summary = node?.firstChild;
  if (!open && summary !== null && summary !== undefined && state.selection.from > pos + 1 + summary.nodeSize) {
    tr.setSelection(TextSelection.create(tr.doc, pos + 1 + summary.nodeSize - 1));
  }
  return tr;
}

/** 頭の行の Enter。開いていれば中身の 1 行目へ（空でなければ空の行を足して）、閉じていればトグルの後ろに段落を足す。 */
export const enterInSummary: Command = (state, dispatch) => {
  const at = toggleAt(state);
  if (at === null || !at.inSummary) return false;
  if (!dispatch) return true;
  const summary = at.node.child(0);
  const bodyStart = at.pos + 1 + summary.nodeSize + 1;
  if (at.node.attrs.open === true) {
    const first = at.node.child(1).firstChild;
    const tr = first !== null && first.type === S.paragraph && first.content.size === 0 ? state.tr : state.tr.insert(bodyStart, S.paragraph.create());
    dispatch(tr.setSelection(TextSelection.create(tr.doc, bodyStart + 1)).scrollIntoView());
    return true;
  }
  dispatch(lineAfter(state, at.pos + at.node.nodeSize));
  return true;
};

/** 中身の最後の空の段落で Enter を押したら、トグルの外（後ろ）へ出る（箇条書きの空の行と同じ抜け方）。 */
export const enterOnEmptyToggleLine: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  const at = toggleAt(state);
  if (at === null || at.inSummary || !empty || $from.depth !== 3 || $from.parent.type !== S.paragraph || $from.parent.content.size > 0) return false;
  const body = $from.node(2);
  if ($from.index(2) !== body.childCount - 1) return false;
  if (!dispatch) return true;
  const after = at.pos + at.node.nodeSize;
  const tr = body.childCount > 1 ? state.tr.delete($from.before(), $from.after()) : state.tr;
  const target = tr.mapping.map(after);
  tr.insert(target, S.paragraph.create());
  dispatch(tr.setSelection(TextSelection.create(tr.doc, target + 1)).scrollIntoView());
  return true;
};

/** 頭の行の頭で Backspace。トグルを外す（頭の行は段落に、中身はそのまま後ろに並ぶ）。 */
export const unwrapToggle: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  const at = toggleAt(state);
  if (at === null || !at.inSummary || !empty || $from.parentOffset !== 0) return false;
  if (!dispatch) return true;
  const blocks: PMNode[] = [S.paragraph.create(null, at.node.child(0).content)];
  at.node.child(1).forEach((child) => {
    if (!(child.type === S.paragraph && child.content.size === 0)) blocks.push(child);
  });
  const tr = state.tr.replaceWith(at.pos, at.pos + at.node.nodeSize, blocks);
  dispatch(tr.setSelection(TextSelection.create(tr.doc, at.pos + 1)).scrollIntoView());
  return true;
};

/**
 * トグルの見た目（details）。開け閉めは文書の値（open）だけが決める——ブラウザが自分で開け閉めすると、編集の芯は
 * それを打った字として読み直してしまうので、頭の行を押したときのブラウザの開け閉めは止め、行頭の三角を押したときだけ値を変える。
 */
export class ToggleView implements NodeView {
  dom: HTMLDetailsElement;
  contentDOM: HTMLElement;
  constructor(
    private node: PMNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
  ) {
    // 見た目はスキーマの toDOM と同じ（台帳の値）
    this.dom = document.createElement("details");
    this.dom.setAttribute("data-note-toggle", "");
    this.dom.className = NOTE_OWN_LOOK.toggle;
    this.contentDOM = this.dom;
    this.dom.open = node.attrs.open === true;
    this.dom.addEventListener("click", (event) => this.click(event));
  }

  private click(event: MouseEvent): void {
    const summary = event.target instanceof Element ? event.target.closest("summary") : null;
    if (summary === null || summary.parentElement !== this.dom) return;
    event.preventDefault();
    // 行頭の三角（字の始まりより左）を押したときだけ開け閉めする。字の上を押したら、そこに焦点を置くだけ
    const marker = Number.parseFloat(getComputedStyle(summary).fontSize) * 1.25;
    if (event.clientX - summary.getBoundingClientRect().left > marker) return;
    const pos = this.getPos();
    if (pos === undefined) return;
    this.view.dispatch(openToggle(this.view.state, pos, this.node.attrs.open !== true));
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    if (this.dom.open !== (node.attrs.open === true)) this.dom.open = node.attrs.open === true;
    return true;
  }

  ignoreMutation(mutation: MutationRecord | { type: "selection"; target: Node }): boolean {
    return mutation.type === "attributes" && mutation.target === this.dom && mutation.attributeName === "open";
  }
}

// ---------------------------------------------------------------------------
// 埋め込み
// ---------------------------------------------------------------------------

/** 埋め込みの見た目。枠は字ではない（打てるのは添え書きだけ）。枠の名前は添え書きの字（無ければ決まった名前）。 */
export class EmbedView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private readonly frame: HTMLIFrameElement;
  constructor(private node: PMNode) {
    this.dom = document.createElement("figure");
    this.dom.setAttribute("data-note-embed", "youtube");
    this.frame = noteEmbedFrame(document, String(node.attrs.id), NOTE_EMBED_CLASS, t("notes.editor.embedTitle"));
    this.frame.setAttribute("contenteditable", "false");
    this.contentDOM = document.createElement("figcaption");
    this.contentDOM.className = NOTE_CAPTION_CLASS;
    this.dom.append(this.frame, this.contentDOM);
    this.apply(node);
  }

  private apply(node: PMNode): void {
    this.dom.setAttribute("data-note-embed-id", String(node.attrs.id));
    const caption = node.textContent.trim();
    this.frame.title = caption.length > 0 ? caption : t("notes.editor.embedTitle");
    if (node.content.size === 0) this.contentDOM.setAttribute("data-note-placeholder", t("notes.editor.caption"));
    else this.contentDOM.removeAttribute("data-note-placeholder");
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type || node.attrs.id !== this.node.attrs.id) return false;
    this.node = node;
    this.apply(node);
    return true;
  }

  stopEvent(event: Event): boolean {
    return event.target === this.frame;
  }

  ignoreMutation(mutation: MutationRecord | { type: "selection"; target: Node }): boolean {
    return captionIgnores(this.contentDOM, mutation);
  }
}

/**
 * 添え書きを持つ器（絵・埋め込み）の見た目のうち、編集の芯に読み直させない変化か。字を打てるのは添え書きだけなので、
 * 添え書きの外（枠・進み具合の 1 行）の変化と、添え書きそのものの属性（空の行の案内）の変化は読み直さない。
 */
export function captionIgnores(caption: HTMLElement, mutation: MutationRecord | { type: "selection"; target: Node }): boolean {
  if (mutation.type === "selection") return false;
  if (mutation.target === caption && mutation.type === "attributes") return true;
  return !caption.contains(mutation.target);
}

/** after の位置の後ろの行へ出る手番（そこが空の段落ならそこへ、無ければ空の段落を足して）。 */
export function lineAfter(state: EditorState, after: number): Transaction {
  const next = state.doc.resolve(after).nodeAfter;
  if (next !== null && next.type === S.paragraph && next.content.size === 0) return state.tr.setSelection(TextSelection.create(state.doc, after + 1)).scrollIntoView();
  const tr = state.tr.insert(after, S.paragraph.create());
  return tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView();
}

/** 添え書きで Enter（絵・埋め込み）。器を 2 つに割らず、後ろの行へ出る。 */
export function enterInCaptionOf(type: NodeType): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    if ($from.parent.type !== type) return false;
    if (dispatch) dispatch(lineAfter(state, $from.after()));
    return true;
  };
}

/**
 * URL を 1 つだけ貼った・小窓に入れたとき。許可した動画サイトの URL を空の行に置いたら埋め込みに、それ以外はリンクにする
 * （許可していない URL は枠にしない・選んでいた字があればその字のリンクに）。答えは `embedded`（埋め込みにした）か `linked`。
 */
export function placeUrl(view: EditorView, url: string, preferEmbed: boolean): "embedded" | "linked" | null {
  const text = url.trim();
  if (!LINK_HREF.test(text)) return null;
  const state = view.state;
  const id = youtubeId(text);
  const { $from, empty, from, to } = state.selection;
  const emptyLine = empty && $from.parent.type === S.paragraph && $from.parent.content.size === 0;
  if (id !== null && (emptyLine || preferEmbed) && insertEmbed(id)(state, view.dispatch)) return "embedded";
  if (!$from.parent.type.allowsMarkType(M.link)) return null;
  const tr = state.tr;
  if (empty) tr.insertText(text, from).addMark(from, from + text.length, M.link.create({ href: text }));
  else tr.removeMark(from, to, M.link).addMark(from, to, M.link.create({ href: text }));
  view.dispatch(tr.scrollIntoView());
  return "linked";
}

/** 貼り付けた字が URL 1 つだけか（前後の空白は除く）。 */
export function pastedUrl(event: ClipboardEvent): string | null {
  const text = event.clipboardData?.getData("text/plain").trim() ?? "";
  return text.length > 0 && !/\s/.test(text) && LINK_HREF.test(text) ? text : null;
}

/** 本文が空のときに数えない、形だけのブロック（表・埋め込みは置いた時点で中身とみなす）。 */
export function substantial(node: PMNode): boolean {
  return node.type === S.table || node.type === S.embed;
}

