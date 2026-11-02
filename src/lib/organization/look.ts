/**
 * 道具箱の札に書く、要求の組織の名前とロゴ（複数組織対応の B5）。書くのは配信側（src/lib/pages/content.ts の `withCommentsWidget`）、
 * 読むのは道具箱（src/widget/shared/i18n.ts）。読み込むのは最初の組織の固定の値だけ（門の紙 src/lib/access/signin-gate.ts も印だけを借りる）。
 */
import { FIRST_ORGANIZATION } from "./scope";
import type { OrganizationProfile } from "./profile";

/** 札に書く組織の名前とロゴ（src/lib/organization/profile.ts の名前・src/lib/organization-logo.ts の行き先）。 */
export type WidgetOrganization = { readonly name: string; readonly logo: string | null };

/**
 * 札に書いた組織の名前とロゴの印（照合の印 ETag に混ぜる）。名前やロゴを変えたら、版が同じでも 304 で
 * 前の名前の紙を出し続けない。最初の組織（名前が最初の組織のまま・ロゴ無し）と、組織を書かない紙は空＝今までの印のまま。
 */
export function widgetOrganizationStamp(organization: WidgetOrganization | null): string {
  if (organization === null || (organization.name === FIRST_ORGANIZATION.name && organization.logo === null)) return "";
  // FNV-1a（32 ビット）。照合の印を分けるだけなので暗号の強さは要らない
  let hash = 0x811c9dc5;
  for (const unit of `${organization.name}\n${organization.logo ?? ""}`) {
    hash ^= unit.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `-o${hash.toString(16).padStart(8, "0")}`;
}

/** サイドバーが指す行き先。鍵の指紋を添えて、入れ替えたら別の URL にする（ブラウザの控えを握ったままにしない）。 */
export function organizationLogoHref(logoKey: string | null): string | null {
  if (logoKey === null) return null;
  const found = /logo-([0-9a-f]{16})\.[a-z]+$/.exec(logoKey);
  return found === null ? null : `/api/organization/logo?v=${found[1]}`;
}

/**
 * 道具箱の札に書く組織の名前とロゴ（src/lib/pages/content.ts の `withCommentsWidget`）。社内の入口（/i・/h）だけが使い、
 * 門なし公開（/p）はロゴを書かない（社外の人にも同じ 1 通りを配る記事なので、所属の人にだけ配る画像の行き先を載せない）。
 */
export function widgetOrganizationOf(profile: OrganizationProfile): WidgetOrganization {
  return { name: profile.name, logo: organizationLogoHref(profile.logoKey) };
}
