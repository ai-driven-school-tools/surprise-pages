import { z } from "zod";
import deployment from "../../../deployment.json";
import { SetupError } from "./setup-error";

const email = z.email().transform((value) => value.trim().toLowerCase());

export type Edition = "company" | "personal";

/**
 * 利用形態を決める規則の正本。材料は配布物に焼き込む deployment.json と PAGES_EDITION の 2 つ。
 * 焼き込んだ personal は環境変数で社内版へ戻せない。知らない値は黙って社内版にせず止める。
 *
 * bin/pages-publish.mjs は単体で配られる（src/app/cli/[name] は配る名前を増やせない）ので
 * ここを読み込めず、同じ規則を写して持つ。一致は check-distribution.mjs が見る。
 */
export function resolveEdition(deployed: unknown, configured: string | undefined): Edition {
  if (configured && configured !== "company" && configured !== "personal") throw new Error("利用形態の設定が正しくありません"); // i18n-keep: 設定の誤りを開発者に知らせる内部の例外（起動で止まる）
  return deployed === "personal" || configured === "personal" ? "personal" : "company";
}

export function isPersonalEdition(): boolean {
  return resolveEdition(deployment.edition, process.env.PAGES_EDITION) === "personal";
}

/**
 * ツールの名前。導入の最初に本人が決める（PAGES_SITE_NAME）。タブ・ログイン画面・サイドバー・共有カードに出る。
 * 未設定なら既定の名前。空白だけ・長すぎる値は既定に落とす（画面を壊さない）。
 */
export const DEFAULT_SITE_NAME = "Pages";
export function siteName(): string {
  const value = process.env.PAGES_SITE_NAME?.trim() ?? "";
  return value.length > 0 && value.length <= 40 ? value : DEFAULT_SITE_NAME;
}

export function siteOwnerEmail(): string {
  const result = email.safeParse(process.env.PAGES_OWNER_EMAIL?.trim());
  if (!result.success) throw new SetupError("owner-email");
  return result.data;
}

export function isSiteOwner(value: string): boolean {
  return isPersonalEdition() && value.trim().toLowerCase() === siteOwnerEmail();
}

export function mayPublish(value: string): boolean {
  return !isPersonalEdition() || isSiteOwner(value);
}

export function validEmail(value: unknown): string | null {
  const result = email.safeParse(typeof value === "string" ? value.trim() : value);
  return result.success ? result.data : null;
}

export function siteOrigin(): string {
  const result = z.url().safeParse(process.env.PAGES_SITE_URL);
  if (!result.success) throw new SetupError("site-url");
  const url = new URL(result.data);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new SetupError("site-url");
  return url.origin;
}

/** 素材 1 つの上限。配布版は Vercel の関数が受けられる大きさに合わせる。 */
export function publicationLimit(): number { return (isPersonalEdition() ? 4 : 100) * 1024 * 1024; }

/** 本文（HTML）1 通の上限の MB。 */
export function documentLimitMb(): number { return isPersonalEdition() ? 4 : 5; }
