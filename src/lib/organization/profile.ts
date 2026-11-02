/**
 * 組織の見え方（名前・ロゴ・仕掛け入りの HTML の扱い）。この設置は組織の行を持たないので保存先を引かず、決まった形を返す。
 * 名前は設置した本人の呼び方（画面の「{organization} の資料」が「taro の資料」になる）。
 */
import { FIRST_ORGANIZATION, type OrganizationScope } from "./scope";
import type { HtmlScriptMode } from "./settings";
import { displayNameOf } from "../identity/member-name";
import { siteOwnerEmail } from "../settings/site-settings";

export interface OrganizationProfile {
  readonly id: string;
  readonly name: string;
  readonly defaultLocale: "ja" | "en";
  readonly htmlScripts: HtmlScriptMode;
  /** ロゴの素材の鍵（非公開の置き場）。無ければ null */
  readonly logoKey: string | null;
  /** 名前をログインしていない人にも届く場所へ出してよいか。本人のアドレスの @ より前なので偽 */
  readonly shareable: boolean;
  /** 契約の段 */
  readonly plan: string;
}

/**
 * ログインしていない人にも届く場所（門の紙・カードの札と絵・画面の meta・門なし公開の道具箱の札）に出してよい組織の名前。
 * この設置の名前は本人のアドレスの @ より前なので出さず null（辞書の一般語）。
 */
export function shareableOrganizationName(profile: OrganizationProfile): string | null {
  return profile.shareable ? profile.name : null;
}

function personalOrganizationName(): string {
  try {
    return displayNameOf(siteOwnerEmail(), null);
  } catch {
    return FIRST_ORGANIZATION.name;
  }
}

/** 組織の見え方。仕掛けはいつも制限・ロゴ無し。本人のアドレスが未設定（設置の途中）なら既定の名前。 */
export async function organizationProfile(organization: OrganizationScope): Promise<OrganizationProfile> {
  return { id: organization.id, name: personalOrganizationName(), defaultLocale: "ja", htmlScripts: "restricted", logoKey: null, shareable: false, plan: "personal" };
}

/** 仕掛け入りの HTML の扱い（いつも制限）。 */
export async function htmlScriptModeOf(organization: OrganizationScope): Promise<HtmlScriptMode> {
  return (await organizationProfile(organization)).htmlScripts;
}
