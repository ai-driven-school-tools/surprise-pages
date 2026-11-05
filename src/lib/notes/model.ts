/**
 * メモ帳の取り決め。サーバー（src/lib/notes/document.ts・src/app/api/pages/notes）と、ページに差し込む
 * 編集の部品（src/widget/editor/note-*.ts）が同じものを読む。ここはサーバーの部品も zod も読み込まない葉にしておく
 * （道具箱の後読みの部品にも束ねられるため）。
 *
 * - 正本は清書の HTML 1 枚。別の本文 JSON を作らない。送るのは本文の HTML で、サーバーが清書の形に組み直して積む
 * - 直せるのは清書のページ（本文の main に `data-clean-copy-document` がある）だけ。直せる人は canEditPage ただ 1 つ
 * - メモ帳で一度保存したページの main には `data-note-document` が付く
 */

/** 清書の本文（main）の印。メモ帳はこの印のある本文にだけ乗る。 */
export const CLEAN_COPY_DOCUMENT_ATTR = "data-clean-copy-document";
/** 清書の本文（main）に付ける、メモ帳で書いた文書の印。 */
export const NOTE_DOCUMENT_ATTR = "data-note-document";

/** 手を止めてから版を積むまで。 */
export const NOTE_SAVE_QUIET_MS = 1000;
/** 打ち続けていても、この間隔では版を積む。 */
export const NOTE_SAVE_MAX_MS = 10_000;
/** 送り直しの回数。超えたら「保存できていません」を出す。 */
export const NOTE_RETRY_LIMIT = 5;
/** ほかの端末で積まれた版に気づくための問い合わせの間隔（開いている間だけ）。 */
export const NOTE_WATCH_MS = 60_000;

/** 題の長さ（一覧と履歴の 1 行に収まる長さ）。 */
export const NOTE_TITLE_MAX = 300;
/** 題の無いメモで、本文の冒頭から作る名前の長さ（字数。2 つで 1 字の文字は 1 字と数える）。 */
export const NOTE_NAME_MAX = 40;
/** 本文の上限。投稿の口と同じ 5MB。 */
export const NOTE_BODY_MAX_BYTES = 5 * 1024 * 1024;
/** 箇条書きの入れ子の深さ。 */
export const NOTE_LIST_DEPTH = 4;

/** 控え（ブラウザの中）を残す長さと大きさ。 */
export const NOTE_DRAFT_TTL_MS = 3 * 24 * 60 * 60 * 1000;
export const NOTE_DRAFT_MAX_BYTES = 2 * 1024 * 1024;

/**
 * 題の無いメモの名前を、本文の冒頭の 1 つの部分の字から作る。最初の改行か「。」の手前まで、長くても NOTE_NAME_MAX 字。
 * 字が残らなければ空（呼ぶ側が次の部分へ進むか「無題」にする）。
 */
export function noteNameFromText(text: string): string {
  const line = text.replace(/^\s+/, "").split(/\r?\n/, 1)[0] ?? "";
  const sentence = line.split("。", 1)[0] ?? "";
  return [...sentence.replace(/\s+/g, " ").trim()].slice(0, NOTE_NAME_MAX).join("").trim();
}

/** 素材の種類。画像・動画。 */
export const NOTE_MEDIA_KINDS = ["image", "video"] as const;
export type NoteMediaKind = (typeof NOTE_MEDIA_KINDS)[number];
export function isNoteMediaKind(value: unknown): value is NoteMediaKind {
  return value === "image" || value === "video";
}

/** 受け取る動画の形式（スライドの動画の口と同じ契約・src/lib/deck/media/media.ts）。 */
export const NOTE_VIDEO_TYPES = ["video/mp4", "video/webm"] as const;
/** 受け取る画像の拡張子（スライドの画像の口と同じ契約・src/app/api/pages/deck-edit/assets）。 */
export const NOTE_IMAGE_NAME = /\.(png|jpe?g|webp|gif|avif)$/i;

/** 保存の答え。 */
export type NoteSaveResponse = {
  pageSlug: string;
  versionId: string;
  versionNumber: number;
  /** ページの名前（題か、題が無ければ本文の冒頭。どちらも無ければ空＝画面の言語の「無題」）。タブの名前はこれで書き直す */
  name: string;
  /** 中身が前と同じで、新しい版を積まなかったか */
  unchanged: boolean;
  /** 同じ送信の目印をもう受け取っていた（送り直し） */
  replayed: boolean;
};

/** 本文の main の開きタグに、その印があるか（サーバーの部品を読まない字面の判定だけ）。 */
function mainHas(html: string, attr: string): boolean {
  const main = /<main\b[^>]*>/i.exec(html);
  return main !== null && new RegExp(`\\s${attr}(?:=|\\s|>)`).test(main[0]);
}

/** 清書のページか（main に清書の印がある）。メモ帳で直せるのはこのページだけ。 */
export function isCleanCopyHtml(html: string): boolean {
  return mainHas(html, CLEAN_COPY_DOCUMENT_ATTR);
}

/** メモ帳で書いた本文か。 */
export function isNoteHtml(html: string): boolean {
  return mainHas(html, NOTE_DOCUMENT_ATTR);
}
