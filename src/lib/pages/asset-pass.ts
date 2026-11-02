import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import type { OrganizationScope } from "../organization/scope";
import { z } from "zod";

import { isSafeSlug } from "./content";
import type { Member } from "../identity/identity";
import { sameEmail } from "../identity/member-name";
import { nestedPageSlugs, type StoredPage } from "@/lib/pages/store";
import { logEvent } from "../logging/server-log";

/**
 * 画像の通行証（社内ページの素材を、1 枚ごとに保存先へ問い合わせずに配る）。
 *
 * ## なぜ要るか
 *
 * 素材の入口（`/internal/<ページ>/<ファイル>`）は、1 枚ごとに「持ち主のページを保存先から引く → 見てよいか」を
 * 確かめていた。画像が 30 枚ある資料を開くと、同じページについて同じ問い合わせが 30 本、同時に飛ぶ。
 * 本番の保存先は同時に 10 本を超えると 1 本ずつが 5〜10 倍に伸びる（docs/design/app-speed.md）ので、
 * 画像が多いほど全部が遅くなる。
 *
 * そこで、**ページ本体を返すとき（ここで見てよいかを確かめ終えている）に**、「この人は、このページの素材を
 * 10 分読んでよい」という通行証を cookie で渡す。素材の入口はこの封を開いて確かめるだけにし、保存先は引かない。
 *
 * ## 通行証が言っていること（これ以上のことは言わない）
 *
 *   「`sub` の人は、`iat` の時点で `page` の本文を見てよかった（`canViewPage` が通した）。`exp` まで、
 *    そのページの素材をその答えで配ってよい」
 *
 * - 決めるのは今までどおり `canViewPage` ただ 1 つ。通行証はその答えの控えで、自分では判定しない（通した答えだけを短く覚える）。
 * - 見せ方が変わった・名簿から外れた・ページを消した、は**最長 10 分**遅れて素材に効く。本文はこれまでどおり
 *   開くたびに確かめるので、外れた人がページを開き直せば本文はその場で断られる。
 * - 名乗り（ログイン）は毎回見る。通行証の持ち主といまログインしている人が違えば使わない
 *   （ログアウトした・同じブラウザで別の人が入った、で効かなくなる）。
 *
 * ## 効く範囲
 *
 * - 社内の入口（`/internal/`）でブラウザのログインで読んだときだけ。過去版の入口（`/history/`）・公開（`/public/`）・
 *   アプリの入場券（`src/lib/view-ticket.ts`）では出さないし受けない。個人配布版も同じ条件で出す（本文の門が招待の名簿も見る）。
 * - 通行証のページの下の素材だけ。cookie の Path は「ページの道筋 + `/`」に絞るので、ほかのページにも、
 *   **そのページの本文の読み込みにも付かない**（下の「cookie」）。
 * - **下に別のページを持つページには出さない。** 素材の持ち主は「いちばん深いページ」なので、下に別のページがあると
 *   その下の素材の持ち主は別人になる（見る人を絞ったページかもしれない）。いまの投稿は入れ子を断るが
 *   （`findSlugConflict`）、その歯止めより前の組み合わせは残りうるので、出す前に確かめる（`isLeafPage`）。
 *   答えはサーバーの中に 10 分覚える。下にページを作る口は歯止めで閉じているので「下に無い」は後から崩れず、
 *   「下にある」が崩れるのは子を消したとき（通行証を出さない側に倒れているだけ）。それでも万一の崩れ（親と子を
 *   同時に新しく作った・将来の別の口）を通行証 1 枚ぶんに収めるため、通行証と同じ長さで忘れる。
 *   確かめが 0.25 秒で返らなければ、その回は出さない（混んだ保存先で本文を遅らせない）。
 *   投稿の歯止めを通らずにページを作る口は、録音の成果物（`prepare_recording_output`・
 *   `internal/recordings/<生成>/<種類>`）だけなので、その上に立ちうる呼び名にも出さない。
 *   ページを作る口が増えたら、ここと検査表（`tests/checks/check-asset-pass.mjs`）を見直すこと。
 *
 * ## cookie
 *
 * `sp-pass.<印>`（Path=/internal/<呼び名の internal/ より後ろ>/・Max-Age=600・HttpOnly・SameSite=Lax・https では Secure と
 * `__Secure-`）。`<印>` はページごとに違う。中身は AES-256-GCM で封をする（`AUTH_SECRET` から用途の名前で導いた鍵）。
 *
 * **Path の末尾に `/` を付ける**のは、本文（`/internal/<ページ>`）の読み込みに cookie を付けないため。本文の道筋の
 * cookie が開くたびに変わると、ブラウザは先読みしておいた本文を「cookie が変わった」として捨て、戻るでも画面を
 * そのまま戻せなくなる（docs/design/app-speed.md）。素材は `<base href="/internal/<ページ>/">` から解くので、必ずこの下にある。
 * 本文の読み込みには通行証が付かないので、開くたびに新しく出す（封を作るだけで、保存先は引かない）。
 */

/** 通行証の寿命（秒）。名簿や見せ方の変更が素材に効くまでの最長の遅れでもある。 */
export const ASSET_PASS_TTL_SECONDS = 600;

/**
 * 投稿の歯止め（`findSlugConflict`）を通らずにページが作られる場所。録音の成果物は
 * `internal/recordings/<生成>/<種類>` に作られる（db/migrations の `prepare_recording_output`）。
 * この場所の上に立ちうる呼び名（`internal/recordings` とその下）には、通行証を出さない。
 */
export const UNGUARDED_BRANCHES = ["internal/recordings/"] as const;

const PURPOSE = "surprise-pages/asset-pass/v1";
const PREFIX = "ap1.";
const COOKIE_BASE = "sp-pass.";
const PASS_COOKIE = /^(?:__Secure-)?sp-pass\.[A-Za-z0-9_-]{16}$/;
/** 1 回の読み込みで開いてみる通行証の数の上限（cookie を大量に積んだ読み込みで手間を増やさない）。 */
const MAX_PASS_COOKIES = 8;
/** 通行証の値の長さの上限。中身は小さいので、これより長いものは開かない。 */
const MAX_PASS_LENGTH = 1024;
/** 発行の時刻がサーバーの時計より先に見えても許す幅（秒）。台をまたぐ時計のずれのため。 */
const CLOCK_SKEW_SECONDS = 30;
const IV_BYTES = 12;
const TAG_BYTES = 16;

const passSchema = z.strictObject({
  v: z.literal(1),
  /**
   * 発行した組織の目印。封の付加データにも入れ、開く側は要求の組織と照らす。
   * 封の鍵は全組織で共通なので、これが無いと、両方の組織に入っている人が A 社の通行証を B 社の宛先へ写せる。
   */
  org: z.uuid(),
  page: z
    .string()
    .max(512)
    .refine((value) => value.startsWith("internal/") && isSafeSlug(value.slice("internal/".length).split("/"))),
  /** ページの目印（台帳の id）。素材の控えに付ける札（`pageCacheTag`）に使う。投稿・上げ直しでその札ごと落ちる。 */
  pid: z.string().min(1).max(64),
  sub: z.string().min(1).max(320),
  /** 発行したときに、見る人を絞ったページだったか（素材の控えの長さを決める・`internalCacheControl`）。 */
  restricted: z.boolean(),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
});

/** 開いた通行証。 */
export type AssetPass = z.infer<typeof passSchema>;

function sealingKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (secret === undefined || secret.length === 0) throw new Error("AUTH_SECRET is required to seal asset passes");
  return createHmac("sha256", secret).update(PURPOSE).digest();
}

/** 封の付加データ。用途と組織の目印。別の組織の宛先では封そのものが開かない。 */
function additionalData(organization: OrganizationScope): Buffer {
  return Buffer.from(`${PURPOSE}\n${organization.id}`, "utf8");
}

function seconds(now: number): number {
  return Math.floor(now / 1000);
}

/** 通行証を作って封をする。中身の形が合わなければ投げる（作る側の誤り）。 */
export function sealAssetPass(input: { organization: OrganizationScope; page: string; pageId: string; viewer: Member; restricted: boolean }, now: number = Date.now()): string {
  const iat = seconds(now);
  const pass: AssetPass = passSchema.parse({
    v: 1,
    org: input.organization.id,
    page: input.page,
    pid: input.pageId,
    sub: input.viewer.email.trim().toLowerCase(),
    restricted: input.restricted,
    iat,
    exp: iat + ASSET_PASS_TTL_SECONDS,
  });
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", sealingKey(), iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(additionalData(input.organization));
  const body = Buffer.concat([cipher.update(JSON.stringify(pass), "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64url");
}

/** 封を開く。開かない・形が違う・期限切れ・寿命が決まりと違う・発行が未来・別の組織の通行証、は全部 null。 */
export function openAssetPass(organization: OrganizationScope, raw: string | null | undefined, now: number = Date.now()): AssetPass | null {
  if (typeof raw !== "string" || raw.length > MAX_PASS_LENGTH || !raw.startsWith(PREFIX)) return null;
  const encoded = raw.slice(PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  const bytes = Buffer.from(encoded, "base64url");
  if (bytes.length <= IV_BYTES + TAG_BYTES) return null;

  let parsed: unknown;
  try {
    const decipher = createDecipheriv("aes-256-gcm", sealingKey(), bytes.subarray(0, IV_BYTES), { authTagLength: TAG_BYTES });
    decipher.setAAD(additionalData(organization));
    decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES));
    const plain = Buffer.concat([decipher.update(bytes.subarray(IV_BYTES, bytes.length - TAG_BYTES)), decipher.final()]);
    parsed = JSON.parse(plain.toString("utf8"));
  } catch {
    return null;
  }

  const result = passSchema.safeParse(parsed);
  if (!result.success) return null;
  const pass = result.data;
  if (pass.org !== organization.id) return null;
  const at = seconds(now);
  if (pass.exp - pass.iat !== ASSET_PASS_TTL_SECONDS) return null;
  if (pass.iat > at + CLOCK_SKEW_SECONDS) return null;
  if (at >= pass.exp) return null;
  return pass;
}

/** cookie の見出しから、通行証の cookie の値だけを拾う（多くても MAX_PASS_COOKIES 枚）。 */
function passCookieValues(request: Request): string[] {
  const header = request.headers.get("cookie");
  if (header === null) return [];
  const values: string[] = [];
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at <= 0) continue;
    if (!PASS_COOKIE.test(part.slice(0, at).trim())) continue;
    values.push(part.slice(at + 1).trim());
    if (values.length >= MAX_PASS_COOKIES) break;
  }
  return values;
}

/** 素材の道筋（`internal/<ページ>/<ファイル>`）が、通行証のページの下か。ページそのものは素材ではない。 */
function under(page: string, assetPath: string): boolean {
  return assetPath.startsWith(`${page}/`);
}

/**
 * 素材の読み込みに効く通行証を 1 枚選ぶ。効くものが無ければ null（呼ぶ側は今までどおり門を通す）。
 *
 * 効くのは、封が開き・期限内で・持ち主がいまログインしている人と同じで・素材がそのページの下にあるものだけ。
 * 過去の版の素材（`<ページ>/@v/<版>/…`）は、呼ぶ側が持ち主のページと通行証のページの一致まで確かめる。
 */
export function assetPassOf(organization: OrganizationScope, request: Request, viewer: { email: string }, assetPath: string): AssetPass | null {
  const now = Date.now();
  let chosen: AssetPass | null = null;
  for (const value of passCookieValues(request)) {
    // 要求の組織で開く（別の組織で出した通行証は封が開かない）
    const pass = openAssetPass(organization, value, now);
    if (pass === null || !sameEmail(pass.sub, viewer.email) || !under(pass.page, assetPath)) continue;
    // 入れ子の古いページでは上のページに通行証を出していないが、念のため深いほうを選ぶ（持ち主は深いほう）
    if (chosen === null || pass.page.length > chosen.page.length) chosen = pass;
  }
  return chosen;
}

/** 通行証の cookie の名前。ページごとに違う（別のページの通行証を上書きしない）。 */
export function assetPassCookieName(page: string, secure: boolean): string {
  const mark = createHash("sha256").update(page, "utf8").digest("base64url").slice(0, 16);
  return `${secure ? "__Secure-" : ""}${COOKIE_BASE}${mark}`;
}

/** cookie の Path（本文の道筋 `/internal/<呼び名の internal/ より後ろ>/`）。素材はこの下にあり、本文そのものは入らない。 */
function assetPathOf(page: string): string {
  return `/internal/${page.slice("internal/".length)}/`;
}

/** 録音の成果物が後から下に作られうる呼び名か（`internal/recordings` とその下）。 */
function mayGainUnguardedChildren(page: string): boolean {
  return UNGUARDED_BRANCHES.some((branch) => branch.startsWith(`${page}/`) || page.startsWith(branch));
}

/**
 * 「下に別のページが無いか」の答え（呼び名ごと）。崩れない向きの答えなのでサーバーの中に覚えるが、
 * 万一の崩れ（同時に親と子を新しく作った・将来の別の口）でも通行証 1 枚ぶんで収まるよう、通行証と同じ長さで忘れる。
 */
const leaves = new Map<string, { leaf: boolean; until: number }>();
const leafFlights = new Map<string, Promise<boolean>>();
const MAX_LEAVES = 4096;
/**
 * 本文の応答が下のページの確かめを待つ上限（ms）。保存先が混んでいるときに本文を遅らせない。
 * 間に合わなければ今回は出さない（確かめは裏で続き、答えは次に開いたときに使う）。
 */
const LEAF_WAIT_MS = 250;

/**
 * そのページの下に別のページが無く、後からも作られないか（通行証を出してよい形か）。
 *
 * 本文の門と同時に聞き始められるように、呼び名だけで答える（見てよいかとは関係が無い）。確かめられなかったときは
 * 「出さない」と答え、覚えない（素材は今までどおり 1 枚ずつ門を通る。本文の配信は止めない）。
 */
export function isLeafPage(organization: OrganizationScope, pageSlug: string): Promise<boolean> {
  if (!pageSlug.startsWith("internal/") || !isSafeSlug(pageSlug.slice("internal/".length).split("/"))) return Promise.resolve(false);
  if (mayGainUnguardedChildren(pageSlug)) return Promise.resolve(false);
  // 覚えは組織ごとに分ける（同じ呼び名のページが別の組織にもありうる）
  const memo = `${organization.id}\n${pageSlug}`;
  const known = leaves.get(memo);
  if (known !== undefined && known.until > Date.now()) return Promise.resolve(known.leaf);
  const flying = leafFlights.get(memo);
  if (flying !== undefined) return flying;
  const flight = nestedPageSlugs(organization, pageSlug).then(
    (nested) => {
      if (leaves.size >= MAX_LEAVES) leaves.clear();
      leaves.set(memo, { leaf: nested.length === 0, until: Date.now() + ASSET_PASS_TTL_SECONDS * 1000 });
      return nested.length === 0;
    },
    (error: unknown) => {
      logEvent({ level: "warn", event: "asset-pass.nested-check-failed", error });
      return false;
    },
  ).finally(() => leafFlights.delete(memo));
  leafFlights.set(memo, flight);
  return flight;
}

/**
 * ページ本体を返すときに付ける通行証の cookie（`Set-Cookie` の 1 行）。付けないときは null。
 *
 * 呼ぶのは、そのページを**この人が見てよいと門が答えたあと**だけ（`src/lib/pages/private-page.ts`）。
 * `leaf` は同じページの `isLeafPage` の答え（門と同時に聞き始めたもの）。下に別のページを持つページには出さない。
 */
export async function assetPassCookie(
  request: Request,
  viewer: Member,
  page: StoredPage,
  restricted: boolean,
  leaf: Promise<boolean>,
): Promise<string | null> {
  // 作れなかったときは出さない（素材は今までどおり 1 枚ずつ門を通る）。本文の配信をここで落とさない
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), LEAF_WAIT_MS); });
    const ready = await Promise.race([leaf, late]).finally(() => clearTimeout(timer));
    if (!ready) return null;
    const slug = page.pageSlug;
    const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
    const value = sealAssetPass({ organization: page.organization, page: slug, pageId: page.id, viewer, restricted });
    return [
      `${assetPassCookieName(slug, secure)}=${value}`,
      `Path=${assetPathOf(slug)}`,
      `Max-Age=${String(ASSET_PASS_TTL_SECONDS)}`,
      "HttpOnly",
      ...(secure ? ["Secure"] : []),
      "SameSite=Lax",
    ].join("; ");
  } catch (error) {
    logEvent({ level: "warn", event: "asset-pass.issue-failed", error });
    return null;
  }
}

/** 応答に通行証の cookie を添える（付けないときはそのまま返す）。 */
export function withAssetPass(response: Response, cookie: string | null): Response {
  if (cookie !== null) response.headers.append("set-cookie", cookie);
  return response;
}
