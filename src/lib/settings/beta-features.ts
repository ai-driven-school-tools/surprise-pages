/**
 * ベータ機能の台帳。**ここが正本**。
 *
 * ベータ機能は「多くの人は使わないので、本人が入れるまでどの画面にも出さない機能」。
 * 入り切りは個人設定の「ベータ機能」の 1 か所で、アカウントに覚える（端末をまたいで効く）。
 *
 * 機能を足すときにやることは 2 つだけ:
 *   1. 下の `BETA_FEATURE_IDS` に名前を足し、`BETA_FEATURES` に題と説明を書く
 *   2. 出したい場所で、入っているかを聞く（サーバーなら `hasBetaFeature`、道具箱なら `features.beta`）
 *
 * 設定画面の行・保存の口・保存先・道具箱への受け渡しは、台帳を読んで勝手に付いてくる。
 * 機能ごとに列や窓口や画面の行を書き足さない（DB の変更も要らない）。
 *
 * デプロイ全体で出す日を選ぶ「機能のスイッチ」（docs/guides/feature-switches.md・環境変数）とは別物。
 * あちらは全員に同時に効き、こちらは入れた本人にだけ効く。
 *
 * このファイルはブラウザにも配る（設定画面と道具箱が読む）ので、保存先や鍵に触るものを置かない。
 * 読み書きは src/lib/settings/beta-features-store.ts。
 */
import { defaultTranslate } from "../i18n/default";
import type { MessageKey } from "../i18n/messages/types";
import type { Translate } from "../i18n/translate";

/** いまこの版にベータ機能は無い（台帳の仕組みだけを残す）。 */
export const BETA_FEATURE_IDS = [] as const;
export type BetaFeatureId = (typeof BETA_FEATURE_IDS)[number];

export interface BetaFeature {
  /** 設定画面の行の名前（辞書の鍵） */
  titleKey: MessageKey;
  /** 何ができるようになり、入れるとどこに入口が出るか（1〜2 文・辞書の鍵） */
  detailKey: MessageKey;
}

/** 題と説明の文は辞書（src/lib/i18n/messages/ja/settings.ts の settings.beta.features）に書く。 */
export const BETA_FEATURES: Record<BetaFeatureId, BetaFeature> = {};

/** 機能の題（辞書を引く関数を渡さなければ日本語）。 */
export function betaFeatureTitle(id: BetaFeatureId, t: Translate = defaultTranslate): string {
  const feature: BetaFeature = BETA_FEATURES[id];
  return t(feature.titleKey);
}

/** 機能の説明（辞書を引く関数を渡さなければ日本語）。 */
export function betaFeatureDetail(id: BetaFeatureId, t: Translate = defaultTranslate): string {
  const feature: BetaFeature = BETA_FEATURES[id];
  return t(feature.detailKey);
}

export function isBetaFeatureId(value: unknown): value is BetaFeatureId {
  return BETA_FEATURE_IDS.some((id) => id === value);
}

/** 台帳にある名前だけを、台帳の順で残す（保存先に残った古い名前・知らない名前は捨てる）。 */
export function knownBetaFeatures(values: readonly unknown[]): BetaFeatureId[] {
  return BETA_FEATURE_IDS.filter((id) => values.includes(id));
}

export function hasBetaFeature(enabled: readonly BetaFeatureId[] | undefined, id: BetaFeatureId): boolean {
  return enabled?.includes(id) ?? false;
}
