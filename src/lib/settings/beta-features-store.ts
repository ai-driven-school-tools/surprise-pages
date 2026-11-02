import { knownBetaFeatures, type BetaFeatureId } from "./beta-features";
import { orgDb } from "../db/database";
import type { OrganizationScope } from "../organization/scope";

/**
 * 本人が入れたベータ機能の読み書き（保存先は `beta_feature_optins`。1 組織 1 人 1 機能 1 行・組織ごとに違ってよい）。
 *
 * 誰の分かは**呼ぶ側が名乗りから採ったアドレス**で決める。リクエストで受け取った値を渡さない。
 */
const TABLE = "beta_feature_optins";

/**
 * その人が入れているベータ機能。
 *
 * **読めなかったときは「何も入れていない」として返す**（投げない）。これはコメントの窓口や
 * 設定画面が旗として引くもので、ここが落ちると関係の無い画面ごと出なくなる。
 * ベータ機能は出ないのが既定なので、迷ったら出さない側に倒す。
 */
export async function readBetaFeatures(organization: OrganizationScope, email: string): Promise<BetaFeatureId[]> {
  try {
    const result = await orgDb(organization).from(TABLE).select("feature").eq("owner_email", email.toLowerCase());
    if (result.error || !Array.isArray(result.data)) return [];
    return knownBetaFeatures(result.data.map((row) => row.feature));
  } catch {
    return [];
  }
}

/** 入り切りする。入れるときは行を置き、切るときは行を消す（設定なので、消した印は立てない）。 */
export async function setBetaFeature(organization: OrganizationScope, email: string, feature: BetaFeatureId, enabled: boolean): Promise<void> {
  const owner = email.toLowerCase();
  const result = enabled
    ? await orgDb(organization).from(TABLE).upsert({ owner_email: owner, feature }, { onConflict: "organization_id,owner_email,feature" })
    : await orgDb(organization).from(TABLE).delete().eq("owner_email", owner).eq("feature", feature);
  if (result.error) throw new Error("設定を保存できませんでした"); // i18n-keep: 内部の失敗（窓口は決まった 500 の文しか返さない）
}
