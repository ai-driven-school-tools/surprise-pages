/**
 * スライドの直接編集の「コピーした中身」（要素か枚）の受け渡し。別のタブ・窓で開いた資料へも貼れるよう、同じサイトの画面
 * （同じオリジン）で共有するブラウザの保存領域に置く。保存できない設定のブラウザでは、この画面の中だけで使う。
 * 中身は原稿の断片で、貼るときに ID を振り直す（src/lib/deck/edit/clipboard.ts）。
 *
 * 別の資料から貼るときは、元を読めるか・公開の資料へ出してよいかをサーバーが毎回確かめ、写しの中の素材（画像・動画・音声）を
 * 貼り先へ写して参照をその在り処へ書き換えてから足す（src/app/api/pages/deck-edit/clipboard）。
 */
import { z } from "zod";
import { deckClipboardSchema, deckClipReferences, rewriteDeckAssetReferences, type DeckClipboard } from "../../../lib/deck/edit/clipboard";
import { t } from "../../shared/i18n";

const STORAGE_KEY = "pages:deck-clipboard";
let memory: DeckClipboard | null = null;

/** 写しを置く。入りきらない（大きな枚）・保存できない設定なら、前に置いた古い写しをほかのタブで貼らせない。 */
export function writeDeckClipboard(value: DeckClipboard): void {
  memory = value;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); }
  catch {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* 保存できない設定のブラウザでも、この画面の中では使える */ }
  }
}

/** いちばん新しくコピーした中身。ほかのタブ・窓でコピーしたものも返す。 */
export function readDeckClipboard(): DeckClipboard | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw === null ? null : deckClipboardSchema.safeParse(JSON.parse(raw));
    if (parsed?.success) return parsed.data;
  } catch { /* 読めないときは、この画面でコピーした中身だけ */ }
  return memory;
}

/** 招待した人だけの中身を公開の資料へ貼るには、貼る人の了承が要る（サーバーの 409）。 */
export class DeckPastePublicConsentError extends Error {
  constructor(message: string) { super(message); this.name = "DeckPastePublicConsentError"; }
}

const responseSchema = z.object({ sources: z.record(z.string(), z.string().regex(/^_deck\/media-[a-f0-9-]+\.[a-z0-9]+$/)) });
const failureSchema = z.object({ error: z.string().optional(), code: z.string().optional() });
const errorOf = (payload: unknown, key: "error" | "code") => { const parsed = failureSchema.safeParse(payload); return parsed.success ? parsed.data[key] ?? null : null; };

/**
 * 別の資料の写しを貼り先（page）で使える形にする。サーバーが元を読めるかを確かめ、素材を写して参照を書き換える。
 * 同じ資料の写しはサーバーを通さずそのまま返す。
 */
export async function carryDeckClipboard(page: string, clip: DeckClipboard, acknowledgePublic = false): Promise<DeckClipboard> {
  if (clip.page === page) return clip;
  const response = await fetch("/api/pages/deck-edit/clipboard", {
    method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
    body: JSON.stringify({ page, source: clip.page, references: deckClipReferences(clip), acknowledgePublic }),
    signal: AbortSignal.timeout(60000),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (response.status === 409 && errorOf(payload, "code") === "publicConsent") throw new DeckPastePublicConsentError(errorOf(payload, "error") ?? t("deckStudio.clipboard.publicBody"));
  if (!response.ok) throw new Error(errorOf(payload, "error") ?? t("deckStudio.clipboard.failed"));
  const { sources } = responseSchema.parse(payload);
  const rewrite = (html: string) => rewriteDeckAssetReferences(html, sources);
  return "slides" in clip
    ? { page, slides: clip.slides.map(slide => ({ ...slide, html: rewrite(slide.html) })) }
    : { page, elements: clip.elements.map(item => ({ ...item, html: rewrite(item.html) })) };
}
