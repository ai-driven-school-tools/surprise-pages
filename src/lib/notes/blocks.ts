/**
 * メモ帳のブロックの台帳。**メモ帳で書けるブロックの種類はここにだけ書く。**
 *
 * 読む側は 4 つ:
 *   - 「/」の一覧（src/widget/editor/note-editor.ts）……並び・名前・絞り込みの読み・絵・右端の案内（近道か行頭の印）
 *   - キーボードの近道（同じファイルの keymap）……押し方はここの `keys`（ProseMirror の書き方。Mod は Mac で ⌘・ほかで Ctrl）
 *   - 書ける形（src/widget/editor/note-schema.ts）と、清書の HTML に組む変換（src/lib/notes/document.ts）
 *   - 検査（tests/unit/notes.test.mjs）……台帳のブロックが全部、一覧・往復で崩れないこと
 *
 * 見た目の正本は清書の変換器の写しの表（src/lib/settings/clean-copy-look.generated.json）。表・注記（※ の段落）・引用・コードなどは
 * 表の役目のクラスで組む（AI のスキルが作る清書と同じ見た目）。表に役目が無いのは清書の変換器が出さない形
 * （区切り線・トグル・確認の箱の行の並べ方）だけで、その値は下の `NOTE_OWN_LOOK` に 1 か所だけ置く（2 か所に書き写さない）。
 *
 * ここは zod もサーバーの部品も読まない葉（編集の部品の後読みの塊にも束ねる）。
 */
import type { MessageKey } from "../i18n/messages/types";

export type NoteBlockId =
  | "paragraph"
  | "h2"
  | "h3"
  | "bullet"
  | "ordered"
  | "task"
  | "toggle"
  | "quote"
  | "callout"
  | "table"
  | "code"
  | "rule"
  | "embed"
  | "image"
  | "video";

export type NoteBlock = {
  readonly id: NoteBlockId;
  /** 一覧に出す名前（辞書の鍵）。 */
  readonly label: MessageKey;
  /** 打って絞るときの読み（英字・ローマ字でも引ける）。 */
  readonly words: string;
  /** 一覧の絵（Lucide の線の道筋）。 */
  readonly icon: readonly string[];
  /** 近道（ProseMirror の keymap の書き方）。無ければ null。 */
  readonly keys: string | null;
  /** 行頭に打つと形が変わる印（一覧の右端の案内。近道の無いブロックだけに出す）。無ければ null。 */
  readonly cue: string | null;
};

/** 「/」の一覧の並び。よく使う順（段落・見出し・箇条書きが上、置くもの（表・埋め込み・絵）は下）。 */
export const NOTE_BLOCKS: readonly NoteBlock[] = [
  { id: "paragraph", label: "notes.blocks.paragraph", words: "p text danraku", icon: ["M13 4v16", "M17 4v16", "M19 4H9.5a4.5 4.5 0 0 0 0 9H13"], keys: "Mod-Alt-0", cue: null },
  { id: "h2", label: "notes.blocks.heading", words: "h2 heading midashi", icon: ["M4 12h8", "M4 18V6", "M12 18V6", "M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1"], keys: "Mod-Alt-1", cue: "##" },
  { id: "h3", label: "notes.blocks.subheading", words: "h3 subheading komidashi", icon: ["M4 12h8", "M4 18V6", "M12 18V6", "M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2", "M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2"], keys: "Mod-Alt-2", cue: "###" },
  { id: "bullet", label: "notes.blocks.bullet", words: "ul list bullet kajougaki", icon: ["M3 12h.01", "M3 18h.01", "M3 6h.01", "M8 12h13", "M8 18h13", "M8 6h13"], keys: "Mod-Alt-5", cue: "-" },
  { id: "ordered", label: "notes.blocks.ordered", words: "ol number bangou", icon: ["M10 12h11", "M10 18h11", "M10 6h11", "M4 10h2", "M4 6h1v4", "M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"], keys: "Mod-Alt-6", cue: "1." },
  { id: "task", label: "notes.blocks.task", words: "todo task check kakunin", icon: ["M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "m9 12 2 2 4-4"], keys: "Mod-Alt-4", cue: "[]" },
  { id: "toggle", label: "notes.blocks.toggle", words: "toggle details fold tatamu toguru", icon: ["m9 18 6-6-6-6"], keys: "Mod-Alt-7", cue: null },
  { id: "quote", label: "notes.blocks.quote", words: "quote inyou", icon: ["M17 6H3", "M21 12H8", "M21 18H8", "M3 12v6"], keys: null, cue: ">" },
  { id: "callout", label: "notes.blocks.callout", words: "callout note aside chuuki", icon: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 16v-4", "M12 8h.01"], keys: null, cue: "※" },
  { id: "table", label: "notes.blocks.table", words: "table grid hyou", icon: ["M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M3 9h18", "M3 15h18", "M9 3v18", "M15 3v18"], keys: null, cue: null },
  { id: "code", label: "notes.blocks.code", words: "code pre", icon: ["m16 18 6-6-6-6", "m8 6-6 6 6 6"], keys: "Mod-Alt-8", cue: "```" },
  { id: "rule", label: "notes.blocks.rule", words: "hr rule divider kugiri", icon: ["M5 12h14"], keys: null, cue: "---" },
  { id: "embed", label: "notes.blocks.embed", words: "embed youtube video umekomi", icon: ["M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17", "m10 15 5-3-5-3z"], keys: null, cue: null },
  { id: "image", label: "notes.blocks.image", words: "image img picture gazou", icon: ["M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z", "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"], keys: null, cue: null },
  { id: "video", label: "notes.blocks.video", words: "video movie douga", icon: ["m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5", "M4 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"], keys: null, cue: null },
];

/**
 * 清書の変換器が出さない形の見た目（写しの表に役目が無いもの）。値は道具箱と清書の目盛り（Tailwind の刻み・額縁の色の名前）だけ。
 *
 *   rule        区切り線
 *   taskRow     確認の箱の行の並べ方。清書の変換器（convert.py の _list_item）と同じ字面
 *   toggle      トグルの器（details）。下の空きは段落と同じ
 *   summary     トグルの頭の行。字は段落のまま、開け閉めの印だけ箇条書きの印と同じ薄さ
 *   toggleBody  トグルの中身。字下げは箇条書きと同じ・最後のブロックの下の空きは器の空きに任せる
 *
 * 埋め込み（YouTube）の枠は絵と同じ役目（写しの表の img）のクラスで描き、縦横の比だけを枠に直に書く（src/lib/notes/document.ts）。
 * 保存する本文には枠（iframe）を書かない——保存する HTML に iframe を書けない決まり（src/lib/html/document-security.ts）なので、
 * 本文には元の動画へのリンク（字を持たない箱）を置き、見るときに道具箱が枠へ差し替える（noteEmbedFrame）。
 */
export const NOTE_OWN_LOOK = {
  rule: "my-10 border-ads-border",
  taskRow: "flex items-center gap-2",
  toggle: "mb-6",
  summary: "cursor-pointer marker:text-ads-line",
  toggleBody: "pl-5 pt-2 [&>:last-child]:mb-0",
} as const;

/** 埋め込みの枠の縦横の比（写しの表の img のクラスに足さず、枠の style に直に書く）。 */
export const NOTE_EMBED_STYLE = "display:block;aspect-ratio:16/9;height:auto";
/** 本文の中の埋め込みの箱（元の動画へのリンク）の印。見るときにこの箱を枠へ差し替える。 */
export const NOTE_EMBED_FRAME_ATTR = "data-note-embed-frame";

/** 表の大きさの上限（1 枚の表で、横に並べて比べる用途に足りる大きさ）。 */
export const NOTE_TABLE_MAX_COLUMNS = 12;
export const NOTE_TABLE_MAX_ROWS = 200;
/** 「/表」で置く表の大きさ（見出しの行 + 2 行・3 列）。 */
export const NOTE_TABLE_DEFAULT = { columns: 3, rows: 3 } as const;

/**
 * 埋め込める相手（許可した動画サイト）。スライドの埋め込みで許している相手と同じ 1 つだけ（YouTube）で、
 * 見る側の枠は配信の CSP（src/lib/html/document-security.ts の frame-src）が許している youtube-nocookie だけを指す。
 */
export const NOTE_EMBED_PROVIDERS = ["youtube"] as const;

/** 埋め込みの枠の行き先（id は src/lib/deck/media/youtube-id.ts の isYouTubeId で確かめたものだけを渡す）。 */
export function noteEmbedSrc(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}`;
}
/** 埋め込みの元の動画のページ（書き出し・枠が描けないときのリンク）。 */
export function noteEmbedHref(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** 埋め込みの枠に許す動き（YouTube の埋め込みの既定と同じ。自動再生はさせない）。 */
const EMBED_ALLOW = "accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";

/** 見るとき・書くときの埋め込みの枠（id は isYouTubeId で確かめたものだけを渡す）。字を持たないので、本文の字数は変わらない。 */
export function noteEmbedFrame(doc: Document, id: string, className: string, title: string): HTMLIFrameElement {
  const frame = doc.createElement("iframe");
  frame.src = noteEmbedSrc(id);
  frame.title = title;
  frame.className = className;
  frame.setAttribute("style", NOTE_EMBED_STYLE);
  frame.loading = "lazy";
  frame.allow = EMBED_ALLOW;
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.allowFullscreen = true;
  return frame;
}

export function noteBlock(id: NoteBlockId): NoteBlock {
  const found = NOTE_BLOCKS.find((one) => one.id === id);
  if (found === undefined) throw new Error(`unknown note block: ${id}`);
  return found;
}

/** 近道の札（Mac は ⌘⌥1、ほかは Ctrl+Alt+1）。一覧の右端の案内に出す。 */
export function noteKeysLabel(keys: string, apple: boolean): string {
  const parts = keys.split("-");
  const names = parts.map((part) => {
    if (part === "Mod") return apple ? "⌘" : "Ctrl";
    if (part === "Alt") return apple ? "⌥" : "Alt";
    if (part === "Shift") return apple ? "⇧" : "Shift";
    return part;
  });
  return names.join(apple ? "" : "+");
}
