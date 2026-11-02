import { deckOverridesSchema, type DeckOverrides } from "../../lib/deck/design/design";
import { deckFocusOverridesSchema, type DeckFocusOverrides } from "../../lib/deck/design/focus";
import { deckLogoOverridesSchema, type DeckLogoOverrides } from "../../lib/deck/media/logo";
/**
 * ブラウザ編集の「直しかけ」控え。
 *
 * 保存する前にタブを閉じても、同じ版の上に直しを戻せるようにするための保険。
 * ここが決めるのは形・鍵の名前・失効・大きさの上限だけ。画面（editor.ts）は
 * それを借りて、いつ書くか・いつ消すか・どう再生するかを持つ。
 *
 * 純粋な関数は DOM にも localStorage にも触れない（検査表が jsdom 無しで実走するため）。
 * 読み書きは下の薄い 4 本だけが持つ。
 */

export type EditDraft = {
  /** 取り寄せたときの版。これが違う控えは戻さない（別の土台に直しを重ねると壊れる） */
  baseVersionId: string;
  /** 直しの記録。**起きた順**（番号順ではない）。戻すときも同じ順で再生する */
  log: { at: number; markdown: string }[];
  /** 一言（履歴に添える文字） */
  message: string;
  savedAt: string; // ISO
  appearance?: DeckOverrides;
  focus?: DeckFocusOverrides;
  logo?: DeckLogoOverrides;
};

/** 控えを置く鍵の接頭辞。ページごとに 1 本（`draftKeyOf` が組み立てる）。 */
export const EDIT_DRAFT_PREFIX = "surprise-pages:edit-draft:";

/**
 * 控えを持ってよい長さ。
 *
 * ブラウザに残るのは直した箇所の本文の断片。共用のパソコンで次の人に見える
 * 種類のものなので、長く持たない。
 */
export const EDIT_DRAFT_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * 1 件の控えの大きさの上限。
 *
 * ページ本文そのものではなく直しの断片だけを持つが、分割を重ねると膨らむ。
 * 上限を超えたら書かない（書けない保険を、編集そのものを止める理由にしない）。
 */
export const EDIT_DRAFT_MAX_BYTES = 256 * 1024;

export function draftKeyOf(pageSlug: string): string {
  return `${EDIT_DRAFT_PREFIX}${pageSlug}`;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record: Record<string, unknown> = { ...value };
  return record;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function parseLogEntry(value: unknown): { at: number; markdown: string } | null {
  const record = toRecord(value);
  if (record === null) return null;
  const at = record["at"];
  const markdown = readString(record, "markdown");
  if (typeof at !== "number" || !Number.isInteger(at) || markdown === null) return null;
  return { at, markdown };
}

/** 控えを文字列にする。欄の順は型の宣言にそろえる（往復の検査が字面で比べられるように）。 */
export function serializeDraft(draft: EditDraft): string {
  const body: EditDraft = {
    baseVersionId: draft.baseVersionId,
    log: draft.log.map((entry) => ({ at: entry.at, markdown: entry.markdown })),
    message: draft.message,
    savedAt: draft.savedAt,
    ...(draft.appearance ? { appearance: draft.appearance } : {}),
    ...(draft.focus ? { focus: draft.focus } : {}),
    ...(draft.logo ? { logo: draft.logo } : {}),
  };
  return JSON.stringify(body);
}

/**
 * 文字列を控えに戻す。形が読めない・欄が欠けている・log の要素が不正なら null。
 *
 * ブラウザの中身は誰でも書き換えられる。信じられるのは形だけ。
 */
export function parseDraft(value: string | null): EditDraft | null {
  if (value === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  const record = toRecord(parsed);
  if (record === null) return null;

  const baseVersionId = readString(record, "baseVersionId");
  const message = readString(record, "message");
  const savedAt = readString(record, "savedAt");
  const rows = record["log"];
  if (baseVersionId === null || message === null || savedAt === null || !Array.isArray(rows)) {
    return null;
  }

  const log: EditDraft["log"] = [];
  for (const row of rows) {
    const entry = parseLogEntry(row);
    if (entry === null) return null;
    log.push(entry);
  }

  const appearance = record["appearance"] === undefined ? undefined : deckOverridesSchema.safeParse(record["appearance"]);
  const focus = record["focus"] === undefined ? undefined : deckFocusOverridesSchema.safeParse(record["focus"]);
  const logo = record["logo"] === undefined ? undefined : deckLogoOverridesSchema.safeParse(record["logo"]);
  if (appearance && !appearance.success) return null;
  if (focus && !focus.success) return null;
  if (logo && !logo.success) return null;
  return {
    baseVersionId, log, message, savedAt,
    ...(appearance?.success ? { appearance: appearance.data } : {}),
    ...(focus?.success ? { focus: focus.data } : {}),
    ...(logo?.success ? { logo: logo.data } : {}),
  };
}

export function draftExpired(draft: EditDraft, now: Date): boolean {
  const saved = Date.parse(draft.savedAt);
  if (Number.isNaN(saved)) return true;
  return now.getTime() - saved >= EDIT_DRAFT_TTL_MS;
}

export function draftUsable(
  draft: EditDraft | null,
  baseVersionId: string,
  now: Date,
): draft is EditDraft {
  return draft !== null && !draftExpired(draft, now) && draft.baseVersionId === baseVersionId;
}

export function draftTooLarge(json: string): boolean {
  return new TextEncoder().encode(json).length > EDIT_DRAFT_MAX_BYTES;
}

// ---------------------------------------------------------------------------
// localStorage への薄い読み書き
//
// 控えはあくまで保険。プライベートモードなどで localStorage が使えない環境では
// 投げずに黙って何もしない。書けなくても編集は続けられる。
// ---------------------------------------------------------------------------

export function readDraft(pageSlug: string): EditDraft | null {
  try {
    return parseDraft(window.localStorage.getItem(draftKeyOf(pageSlug)));
  } catch {
    return null;
  }
}

export function writeDraft(pageSlug: string, draft: EditDraft): void {
  try {
    const json = serializeDraft(draft);
    if (draftTooLarge(json)) return;
    window.localStorage.setItem(draftKeyOf(pageSlug), json);
  } catch {
    // 書けなくても編集そのものは止めない（保険が無いだけ）
  }
}

export function clearDraft(pageSlug: string): void {
  try {
    window.localStorage.removeItem(draftKeyOf(pageSlug));
  } catch {
    // 消えなくても次の失効掃除で落ちる。編集は止めない
  }
}

/**
 * 接頭辞の付いた鍵を全部歩き、失効した分（と、形が読めない分）を消す。
 *
 * 形が読めない控えは戻しようが無いので、失効と同じ扱いで捨てる。
 * 消す鍵は先に集める——歩きながら消すと、後ろの番号が詰まって取りこぼす。
 */
export function purgeExpiredDrafts(now: Date): void {
  try {
    const storage = window.localStorage;
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null && key.startsWith(EDIT_DRAFT_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      const draft = parseDraft(storage.getItem(key));
      if (draft === null || draftExpired(draft, now)) storage.removeItem(key);
    }
  } catch {
    // 掃除できなくても編集は続けられる
  }
}
