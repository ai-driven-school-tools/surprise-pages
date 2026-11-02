import { z } from "zod";
import { BETA_FEATURE_IDS } from "../settings/beta-features";
import { LOCALE_SETTINGS } from "../i18n/locales";

/**
 * 個人設定（見た目・言語・ベータ機能）と、一覧の操作（お気に入り）を受ける口の形（`src/app/api/workspace`）。
 * 一覧の決まり（src/lib/workspace/model.ts）とは分けて置く——あちらはブラウザの一覧も読むので、zod を連れ込まない。
 */
export const appearanceSchema = z.enum(["system", "light", "dark"]);
export type WorkspaceAppearance = z.infer<typeof appearanceSchema>;
/** 個人設定の言語。選べる値は src/lib/i18n/locales.ts の正本から採る（`auto` は保存先では空）。 */
export const localeSettingSchema = z.enum(LOCALE_SETTINGS);
export const workspaceMutationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("favorite"),
      page: z.string().min(1).max(400),
      selected: z.boolean(),
    })
    .strict(),
  z
    .object({ action: z.literal("appearance"), value: appearanceSchema })
    .strict(),
  z
    .object({ action: z.literal("locale"), value: localeSettingSchema })
    .strict(),
  // ベータ機能の入り切り。選べる名前は台帳（src/lib/settings/beta-features.ts）にあるものだけ（知らない名前は 400 で断る）
  z
    .object({ action: z.literal("beta"), feature: z.enum(BETA_FEATURE_IDS), enabled: z.boolean() })
    .strict(),
]);
