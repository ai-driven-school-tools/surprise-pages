import { z } from "zod";
import { deckIdSchema } from "../design/design";

export const DECK_LOGO_MARK = "data-deck-logo";
export const DECK_LOGO_OVERRIDES_MARK = "data-deck-logo-overrides";
export const DECK_LOGO_VERSION = 1;
export const DECK_LOGO_PORTABLE_KIND = "surprise-pages-deck-logo";
/** Unique browser uploads remain live because older browser-saved revisions may reference them. */
export const DECK_LOGO_ASSET_PREFIX = "_deck/logo-";

const logoPathSchema = z.string().min(1).max(320).refine((value) => {
  if (value.startsWith("/") || value.includes("\\")) return false;
  const parts = value.split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== ".." && /^[a-z0-9._-]+$/.test(part));
}, "ロゴの置き場所が正しくありません"); // i18n-keep: 保存済みページの実行部に束ねられる検証の文（画面には固定の断り文を出す）

export const logoRegionSchema = z.object({
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().positive().max(1), height: z.number().positive().max(1),
}).strict().refine(v => v.x + v.width <= 1 && v.y + v.height <= 1, "ロゴマークの範囲を確認してください"); // i18n-keep: 保存済みページの実行部に束ねられる検証の文（画面には固定の断り文を出す）

export const logoAssetSchema = z.object({
  path: logoPathSchema,
  mark: logoRegionSchema.optional(),
  contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml", "image/avif"]),
  intrinsicWidth: z.number().int().positive().max(20_000).optional(),
  intrinsicHeight: z.number().int().positive().max(20_000).optional(),
}).strict();

export const logoPlacementSchema = z.enum([
  "top-left", "top-center", "top-right", "bottom-left", "bottom-right", "cover", "watermark", "hidden",
]);

export const logoPresentationSchema = z.object({
  placement: logoPlacementSchema,
  variant: z.enum(["full", "mark"]).optional(),
  /** Percent of the 1280px slide width. */
  size: z.number().min(2).max(80),
  opacity: z.number().min(0).max(100),
  offsetX: z.number().min(0).max(256),
  offsetY: z.number().min(0).max(256),
  /** Deliberately limited to one-pixel alignment adjustments. */
  nudgeX: z.number().int().min(-1).max(1),
  nudgeY: z.number().int().min(-1).max(1),
  color: z.enum(["original", "monochrome"]),
  backplate: z.boolean(),
}).strict();
export const logoPresentationPatchSchema = logoPresentationSchema.partial();

export const logoLayoutsSchema = z.object({ cover: logoPresentationPatchSchema.optional(), closing: logoPresentationPatchSchema.optional() }).strict();

export const deckLogoSchema = z.object({
  version: z.literal(DECK_LOGO_VERSION),
  asset: logoAssetSchema.nullable(),
  document: logoPresentationSchema,
  layouts: logoLayoutsSchema.optional(),
  slides: z.record(deckIdSchema, logoPresentationPatchSchema),
}).strict();

export const deckLogoOverridesSchema = z.object({
  version: z.literal(DECK_LOGO_VERSION),
  asset: logoAssetSchema.nullable().optional(),
  document: logoPresentationPatchSchema,
  layouts: logoLayoutsSchema.optional(),
  slides: z.record(deckIdSchema, logoPresentationPatchSchema.extend({ followDocument: z.boolean().optional() })),
}).strict();

export const portableLogoSchema = z.object({
  kind: z.literal(DECK_LOGO_PORTABLE_KIND),
  version: z.literal(DECK_LOGO_VERSION),
  contentType: logoAssetSchema.shape.contentType,
  mark: logoRegionSchema.optional(),
  dataUrl: z.string().regex(/^data:image\/(?:png|jpeg|webp|gif|svg\+xml|avif);base64,[a-z0-9+/]+=*$/i),
  document: logoPresentationPatchSchema,
  layouts: logoLayoutsSchema.optional(),
  slides: z.record(deckIdSchema, logoPresentationPatchSchema.extend({ followDocument: z.boolean().optional() })),
}).strict();

export type LogoAsset = z.infer<typeof logoAssetSchema>;
export type LogoPresentation = z.infer<typeof logoPresentationSchema>;
export type DeckLogo = z.infer<typeof deckLogoSchema>;
export type DeckLogoOverrides = z.infer<typeof deckLogoOverridesSchema>;
export type EffectiveLogo = { asset: LogoAsset; presentation: LogoPresentation } | null;
export type PortableLogo = z.infer<typeof portableLogoSchema>;

export const DEFAULT_LOGO_PRESENTATION: LogoPresentation = {
  placement: "top-right",
  size: 12,
  opacity: 100,
  offsetX: 40,
  offsetY: 40,
  nudgeX: 0,
  nudgeY: 0,
  color: "original",
  backplate: false,
};

export function emptyLogoOverrides(): DeckLogoOverrides {
  return { version: DECK_LOGO_VERSION, document: {}, slides: {} };
}

export function hasLogoOverrides(value: DeckLogoOverrides): boolean {
  return value.asset !== undefined || value.layouts !== undefined || Object.keys(value.document).length > 0 || Object.keys(value.slides).length > 0;
}

export function effectiveLogo(authored: DeckLogo, overrides: DeckLogoOverrides, slideId: string, layout?: "cover" | "closing"): EffectiveLogo {
  const asset = overrides.asset === undefined ? authored.asset : overrides.asset;
  if (asset === null) return null;
  const { followDocument, ...slideOverride } = overrides.slides[slideId] ?? {};
  const presentation = {
    ...authored.document,
    ...(layout && !followDocument ? (overrides.layouts ?? authored.layouts)?.[layout] : {}),
    ...(followDocument ? {} : authored.slides[slideId]),
    ...overrides.document,
    ...(layout && !followDocument ? overrides.layouts?.[layout] : {}),
    ...slideOverride,
  };
  return { asset, presentation };
}

/** The portable file carries the image bytes, so importing it never depends on a private asset URL. */
export function exportPortableLogo(value: PortableLogo): string {
  return JSON.stringify(portableLogoSchema.parse(value), null, 2);
}

export function importPortableLogo(text: string): PortableLogo {
  if (new TextEncoder().encode(text).length > 15 * 1024 * 1024) throw new Error("ロゴ設定が大きすぎます"); // i18n-keep: 保存済みページの実行部に束ねられる検証の文（画面には固定の断り文を出す）
  return portableLogoSchema.parse(JSON.parse(text));
}

/** Shared by the renderer and editor warning; authored HTML has no painted attributes. */
export function canPlaceDeckLogo(safe: ReadonlySet<string>, typography: string | undefined, logo: NonNullable<EffectiveLogo>): boolean {
  const {asset, presentation} = logo;
  if (safe.has(presentation.placement)) return true;
  const width = 1280 * presentation.size / 100;
  const ratio = deckLogoRatio(logo);
  if (typography === 'school' && safe.has('school-cover') && presentation.placement === 'top-left')
    return width <= 240 && presentation.offsetX >= 64 && presentation.offsetY + width * ratio <= 176;
  return typography === 'school' && safe.has('school-bottom-right') && presentation.placement === 'bottom-right'
    && width <= 256 && presentation.offsetX >= 32 && presentation.offsetY + width * ratio <= 80;
}

/** Authored roles survive reordering and do not depend on slide numbers or text. */
export function deckLogoLayout(slide: Pick<Element, "getAttribute"> | undefined): "cover" | "closing" | undefined {
  const role = slide?.getAttribute("data-deck-brand-layout");
  if (role === "cover" || role === "closing") return role;
  return slide?.getAttribute("data-deck-authoring-layout") === "title" ? "cover" : undefined;
}
export function deckLogoRatio(logo: NonNullable<EffectiveLogo>): number {
  const {asset,presentation} = logo;
  const ratio = asset.intrinsicWidth && asset.intrinsicHeight ? asset.intrinsicHeight / asset.intrinsicWidth : .5;
  return presentation.variant === "mark" && asset.mark ? ratio * asset.mark.height / asset.mark.width : ratio;
}
