/**
 * 組織で絞るときに持ち歩く最小の形。
 *
 * 保存先の口（src/lib/db/database.ts の `orgDb`）は目印（id）で行を絞り、素材の口（src/lib/pages/assets.ts）は置き場の頭
 * （assetPrefix）で鍵を作る。台帳の行（src/lib/organization/organizations.ts の `Organization`）を丸ごと持ち歩かないのは、
 * 要求のたびに組織の台帳を引き直さないため（縦に待つ段を 1 つ増やさない・docs/design/app-speed.md）。
 *
 * このファイルは保存先を読み込まない。検査表が src/lib/db/database.ts だけを差し替えて組み立てても、
 * ここを経由して本物の保存先が紛れ込まないようにするため。読み込むのは設置の種類と本番の判定（どちらも保存先に触らない）と、
 * 要求の見出しを読む next/headers（使うときに読み込む）だけ。
 */
import { isPersonalEdition } from "../settings/site-settings";

export interface OrganizationScope {
  /** 組織の目印（organizations.id） */
  readonly id: string;
  /** 素材の置き場の頭。最初の組織は空、新しい組織は `o/<組織の目印>/` */
  readonly assetPrefix: string;
}

/**
 * この設置の組織（1 つだけ）。目印は固定で、保存先の組織に属する表はこの目印で絞る。
 * 名前は画面には出さない（画面に出る名前は src/lib/settings/site-settings.ts の siteName）。
 */
export const FIRST_ORGANIZATION = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "default",
  name: "Pages",
  assetPrefix: "",
} as const;

const FIRST_SCOPE: OrganizationScope = Object.freeze({ id: FIRST_ORGANIZATION.id, assetPrefix: FIRST_ORGANIZATION.assetPrefix });

/**
 * 関所（src/proxy.ts）が要求ごとに付け直す、要求の組織のヘッダ（A5）。要求の目印（`x-pages-request-id`）と同じやり方で、
 * 外から送られてきた値は捨てて付け直す。入口はこのヘッダだけを読み、ホスト名を読み直さない（読み方がばらけると、1 か所で既定の組織に倒れる）。
 */
export const ORGANIZATION_HEADER = "x-pages-organization";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** 素材の置き場の頭の形。最初の組織は空、新しい組織は `o/<組織の目印>/`（src/lib/organization/organizations.ts の createOrganization と同じ）。 */
const ASSET_PREFIX = /^(o\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/)?$/;

/** ヘッダに載せる形（`<目印>;<素材の置き場の頭>`）。関所だけが作る。 */
export function organizationHeaderValue(organization: OrganizationScope): string {
  if (!UUID.test(organization.id) || !ASSET_PREFIX.test(organization.assetPrefix)) throw new Error("organization scope has an unexpected shape");
  return `${organization.id};${organization.assetPrefix}`;
}

/**
 * 読んだ見出しの値 → 組織の形。**同じ値には同じ物を返す**——組織を引数に取る「画面を描く 1 回の中で 1 回だけ読む」
 * （React の cache）は引数を物そのもので見分けるので、読むたびに作ると毎回外れて同じ問い合わせを何度も投げる。
 * 組織の数だけ増える（上限を超えたら空にして作り直す。空にしても同じ形が作り直されるだけで、答えは変わらない）。
 */
const SCOPES = new Map<string, OrganizationScope>();
const SCOPES_LIMIT = 1000;

/** ヘッダの値を読む。形が違えば null（読めない値を組織として使わない）。 */
export function organizationFromHeader(value: string | null | undefined): OrganizationScope | null {
  if (typeof value !== "string") return null;
  const known = SCOPES.get(value);
  if (known !== undefined) return known;
  const parts = value.split(";");
  if (parts.length !== 2) return null;
  const [id, assetPrefix] = parts;
  if (!UUID.test(id) || !ASSET_PREFIX.test(assetPrefix)) return null;
  const scope = id === FIRST_SCOPE.id && assetPrefix === FIRST_SCOPE.assetPrefix ? FIRST_SCOPE : Object.freeze({ id, assetPrefix });
  if (SCOPES.size >= SCOPES_LIMIT) SCOPES.clear();
  SCOPES.set(value, scope);
  return scope;
}

/**
 * 要求の見出し。要求の外（脚本・見本の流し込み・検査表）では null。
 * Next が組み立ての流れを変えるために投げる合図（動的な描画の印など）は飲み込まずに投げ直す。
 */
async function requestHeaders(): Promise<{ get(name: string): string | null } | null> {
  const { headers } = await import("next/headers");
  try {
    return await headers();
  } catch (error) {
    const { unstable_rethrow } = await import("next/navigation");
    unstable_rethrow(error);
    return null;
  }
}

/**
 * いまの要求の組織。入口（route・画面・サーバーの操作）が 1 度だけ呼び、引数で下へ渡す
 * （隠れた文脈に置かない。どこで組織が決まったかを検査で追えるようにするため）。
 *
 * **関所（src/proxy.ts）が宛先（ホスト名）から決めて付け直したヘッダ `x-pages-organization` だけを読む**（A5）。
 * 保存先は引かない（関所が 60 秒覚えた答えを渡すので、すべての画面の最初に待つ段を増やさない）。
 *
 * - 配布版（組織が 1 つだけの設置）は最初の組織
 * - ヘッダが読めない（要求の外・関所を通らない組み立て）・形が違う: **本番では投げる**（既定の組織に倒さない・不変条件 2）。
 *   本番でなければ最初の組織（脚本・見本の流し込み・検査表の差し替えのため。関所はすべての道筋で付けるので、本番の要求で欠けることは無い）
 */
export async function currentOrganization(): Promise<OrganizationScope> {
  if (isPersonalEdition()) return FIRST_SCOPE;
  const headers = await requestHeaders();
  return organizationFromHeader(headers?.get(ORGANIZATION_HEADER)) ?? FIRST_SCOPE;
}

/** 最初の組織の絞りの形（保存先を引かずに使う口のため）。組織の一覧は src/lib/organization/organizations.ts の `everyOrganization`。 */
export function firstOrganizationScope(): OrganizationScope {
  return FIRST_SCOPE;
}
