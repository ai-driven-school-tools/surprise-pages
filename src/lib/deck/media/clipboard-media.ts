import { createHash } from "node:crypto";
import { copy } from "@vercel/blob";
import { openPage } from "../../access/access";
import type { Member } from "../../identity/identity";
import type { OrganizationScope } from "../../organization/scope";
import { archivePrefix, assetContentType, assetKey, assetPrefix, isSafeAssetPath, listAssetsUnder, outsideNestedBranches } from "../../pages/assets";
import { nestedPageSlugs, pageRefOf, type StoredPage } from "../../pages/store";
import { DECK_EDIT_ASSET_PREFIX, deckMediaAssetPath, isDeckMediaAssetPath } from "../edit/assets";

export type DeckClipboardMedia = { ok: true; sources: Record<string, string> } | { ok: false };

/** 写しの中の相対パス（`images/a%20b.png`・`./_deck/media-….png`）を、素材の置き場の並びへ。読めない・外へ出るものは null。 */
function assetPath(reference: string): string[] | null {
  let value: string;
  try { value = decodeURIComponent(reference.trim().replace(/^(?:\.\/)+/, "")); } catch { return null; }
  const parts = value.split("/");
  return parts.length > 0 && isSafeAssetPath(parts) && assetContentType(value) !== null ? parts : null;
}

/**
 * 写した素材の名前（UUID の形）。元の資料・場所・大きさが同じなら同じ名前になり、同じ枚を二度貼っても素材を二重に置かない。
 * 64 桁の名前は中身の指紋の形（src/lib/deck/edit/assets.ts）なので使わない。
 */
function copiedName(sourcePageId: string, rel: string, size: number): string {
  const hex = createHash("sha256").update(`${sourcePageId}\n${rel}\n${size}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * 写しの元の資料を、貼る人の門で開く。見られない資料は、無い資料と同じに断る（あるかどうかも教えない）。
 * 見てよいかは `canViewPage`（openPage の中）ただ 1 つが決める。
 */
export async function openClipboardSource(organization: OrganizationScope, viewer: Member, sourceSlug: string): Promise<StoredPage | null> {
  const gate = await openPage(organization, viewer, sourceSlug);
  return gate.ok && pageRefOf(gate.page.pageSlug) !== null ? gate.page : null;
}

/** 招待した人だけの資料の中身を、門なし公開の資料へ入れるか。入れるなら貼る人の了承が要る（見せ方は台帳の列で見る）。 */
export function crossesToPublic(source: StoredPage, target: StoredPage): boolean {
  return target.visibility === "public" && source.visibility !== "public";
}

/**
 * 別の資料からコピーした枚・要素の素材（画像・動画・音声）を、貼り先の資料の非公開の素材へ写す。
 *
 * - 写すのは元の資料のいまの素材だけ（過去の版の凍結 `@archive` と、入れ子のページの素材は数えない）。
 *   本文の相対パスで指されていても、その資料の素材の一覧に無いものは写さない（ほかのページの素材へ回り込ませない）。
 * - 写した先は `_deck/media-…`（変えない素材の置き場）。`_deck/media-` の素材はそのままの名前で、
 *   それ以外（投稿した資料の `images/…` など）は貼り先の同じ名前の素材を上書きしないよう、新しい名前を付ける。
 * 返すのは「写しの中の参照 → 貼り先での在り処」。本文の保存はいつもの編集の操作が行う。
 */
export async function copyClipboardMedia(organization: OrganizationScope, source: StoredPage, target: StoredPage, references: readonly string[]): Promise<DeckClipboardMedia> {
  const ref = pageRefOf(source.pageSlug), targetRef = pageRefOf(target.pageSlug);
  if (ref === null || targetRef === null) return { ok: false };
  const wanted = references.flatMap(reference => { const parts = assetPath(reference); return parts ? [{ reference, rel: parts.join("/") }] : []; });
  if (!wanted.length) return { ok: true, sources: {} };

  const prefix = assetPrefix(organization, ref.slugPrefix, ref.slug), frozenRoot = archivePrefix(organization, ref.slugPrefix, ref.slug);
  const outside = outsideNestedBranches(organization, await nestedPageSlugs(organization, source.pageSlug));
  const live = new Map((await listAssetsUnder(prefix)).filter(asset => !asset.pathname.startsWith(frozenRoot) && outside(asset.pathname)).map(asset => [asset.pathname.slice(prefix.length), asset]));
  const targetPrefix = assetPrefix(organization, targetRef.slugPrefix, targetRef.slug);
  const present = new Set((await listAssetsUnder(`${targetPrefix}${DECK_EDIT_ASSET_PREFIX}`)).map(asset => asset.pathname.slice(targetPrefix.length)));

  const sources: Record<string, string> = {}, copies = new Map<string, string>(), renamed = new Map<string, string>();
  for (const { reference, rel } of wanted) {
    const asset = live.get(rel);
    if (!asset) continue;
    const to = isDeckMediaAssetPath(rel) ? rel : renamed.get(rel) ?? deckMediaAssetPath(copiedName(source.id, rel, asset.size), rel.slice(rel.lastIndexOf(".") + 1).toLowerCase());
    renamed.set(rel, to);
    sources[reference] = to;
    if (!present.has(to)) copies.set(to, asset.pathname);
  }
  for (const [to, from] of copies)
    await copy(from, assetKey(organization, targetRef.slugPrefix, [...targetRef.slug, ...to.split("/")]), { access: "private", addRandomSuffix: false, allowOverwrite: true });
  return { ok: true, sources };
}
