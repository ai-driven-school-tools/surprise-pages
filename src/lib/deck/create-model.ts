import { themeRefSchema } from "./design/theme-model";
import { z } from "zod";
import { DECK_PRESETS } from "./design/design";
import { browserTemplateSchema } from "./design/browser-templates";

export const deckCreateOptionsSchema = z.object({
  themeId: z.string().refine(id => DECK_PRESETS.some(theme => theme.id === id), "テーマを選んでください").default("paper"), // i18n-keep: 内部の検証の文（作成の窓口は固定の断り文を返す）
  myTheme: themeRefSchema.optional(),
  title: z.string().trim().max(100).default("").transform(value => value || "無題の資料"), // i18n-keep: 新しい資料の題名として本文に保存される既定値（画面からは辞書の題名を送る）
  firstSlide: browserTemplateSchema.nullable().default({kind: "basic", id: "title"}),
}).strict();

export const deckCreateRequestSchema = deckCreateOptionsSchema.extend({requestId: z.string().uuid()});
export type DeckCreateRequest = z.infer<typeof deckCreateRequestSchema>;
export const deckCreateResultSchema = z.object({url: z.string().regex(/^\/internal\/decks\/[a-f0-9]{32}\?edit=1$/)});
