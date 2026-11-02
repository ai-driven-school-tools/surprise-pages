import { z } from "zod";

// Shared schemas also run in pages that forbid dynamic code generation.
z.config({ jitless: true });

/** Shared by the embedded renderer, the editor, import/export and publication. */
export const DECK_DESIGN_MARK = "data-deck-design";
export const DECK_APPEARANCE_MARK = "data-deck-appearance";
export const DECK_ID = "data-deck-id";
export const DECK_DESIGN_VERSION = 1;
export const DECK_DESIGN_MAX_BYTES = 64 * 1024;

const color = z.string().regex(/^#[\da-f]{6}$/i).transform((value) => value.toLowerCase());
export const deckIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,79}$/);
export const decorationSchema = z.enum(["none", "gradient", "glow", "grid", "wave", "diagonal"]);
/** New decoration must never be sent to an older embedded renderer. */
export const DECK_SCHOOL_MARK = "data-deck-school";
export function needsSchool(...values: DeckAppearancePatch[]): boolean {
  return values.some(value => value.typography === "school" || value.ornament === "school");
}
export const DECK_DIAGONAL_MARK = "data-deck-diagonal";
export function needsDiagonal(...values: DeckAppearancePatch[]): boolean {
  return values.some(value => value.decoration === "diagonal");
}
export const appearanceSchema = z.object({
  background: color,
  accent: color,
  secondary: color,
  decoration: decorationSchema,
  intensity: z.number().min(0).max(100),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  scale: z.number().min(50).max(150),
  angle: z.number().min(0).max(360),
  motion: z.boolean(),
  typography: z.enum(["system", "modern", "soft", "editorial", "school"]).optional(),
  ornament: z.enum(["none", "rule", "corner", "school"]).optional(),
}).strict();
export const appearancePatchSchema = appearanceSchema.partial();
export type DeckAppearance = z.infer<typeof appearanceSchema>;
export type DeckAppearancePatch = z.infer<typeof appearancePatchSchema>;
export const deckOverridesSchema = z.object({
  version: z.literal(DECK_DESIGN_VERSION),
  document: appearancePatchSchema,
  slides: z.record(deckIdSchema, appearancePatchSchema.extend({ followDocument: z.boolean().optional() })),
}).strict();
export const deckDesignSchema = z.object({
  version: z.literal(DECK_DESIGN_VERSION),
  document: appearanceSchema,
  slides: z.record(deckIdSchema, appearancePatchSchema),
}).strict();
export const appearanceFileSchema = z.object({
  kind: z.literal("surprise-pages-deck-appearance"),
  version: z.literal(DECK_DESIGN_VERSION),
  appearance: appearanceSchema,
}).strict();
export type DeckDesign = z.infer<typeof deckDesignSchema>;
export type DeckOverrides = z.infer<typeof deckOverridesSchema>;

const base: DeckAppearance = {
  background: "#ffffff", accent: "#2859dd", secondary: "#91b8ff", decoration: "none",
  intensity: 40, x: 85, y: 20, scale: 100, angle: 135, motion: false,
};
const styled: DeckAppearance = { ...base, typography: "modern", ornament: "rule" };
export const DECK_PRESETS: readonly { id: string; name: string; description: string; appearance: DeckAppearance }[] = [
  { id: "paper", name: "白", description: "色を添えない、澄んだ紙面", appearance: styled }, // i18n-keep: 保存済みページの実行部と配布用の設定（src/templates/deck-styles.json）に束ねられる。画面の名前は deck-style-options の辞書から引く
  { id: "ink", name: "墨", description: "墨色に、青白い光を添える", appearance: { ...styled, background: "#151719", accent: "#c7d4dd", secondary: "#7e919d", decoration: "glow", intensity: 60, x: 100, y: 0, scale: 90 } }, // i18n-keep: 保存済みページの実行部と配布用の設定（src/templates/deck-styles.json）に束ねられる。画面の名前は deck-style-options の辞書から引く
  { id: "indigo", name: "藍", description: "青と薄紫が、なだらかに重なる", appearance: { ...styled, background: "#f6f7fc", accent: "#4054cc", secondary: "#b59bd8", decoration: "gradient", intensity: 74, x: 96, y: 18, scale: 95, angle: 135 } }, // i18n-keep: 保存済みページの実行部と配布用の設定（src/templates/deck-styles.json）に束ねられる。画面の名前は deck-style-options の辞書から引く
  { id: "forest", name: "森", description: "深緑から、穏やかな黄緑へ", appearance: { ...styled, typography: "soft", ornament: "none", background: "#f5f8f2", accent: "#24735d", secondary: "#a8bc76", decoration: "glow", intensity: 68, x: 94, y: 12, scale: 105 } }, // i18n-keep: 保存済みページの実行部と配布用の設定（src/templates/deck-styles.json）に束ねられる。画面の名前は deck-style-options の辞書から引く
  { id: "sunset", name: "夕映え", description: "杏色とローズの、温かな余韻", appearance: { ...styled, background: "#fff8f2", accent: "#c75c3a", secondary: "#df9bab", decoration: "gradient", intensity: 68, x: 95, y: 80, scale: 88, angle: 35 } }, // i18n-keep: 保存済みページの実行部と配布用の設定（src/templates/deck-styles.json）に束ねられる。画面の名前は deck-style-options の辞書から引く
  { id: "aurora", name: "オーロラ", description: "夜の青に、緑と紫の光が漂う", appearance: { ...styled, ornament: "none", background: "#151b2d", accent: "#87d5c1", secondary: "#aa92eb", decoration: "glow", intensity: 85, x: 80, y: 10, scale: 105, motion: true } }, // i18n-keep: 保存済みページの実行部と配布用の設定（src/templates/deck-styles.json）に束ねられる。画面の名前は deck-style-options の辞書から引く
  { id: "pearl", name: "パール", description: "生成りに、砂色と青灰をにじませる", appearance: { ...styled, typography: "editorial", ornament: "corner", background: "#fbf9f5", accent: "#a18464", secondary: "#9eb6c5", decoration: "gradient", intensity: 62, x: 100, y: 24, scale: 105, angle: 150 } }, // i18n-keep: 保存済みページの実行部と配布用の設定（src/templates/deck-styles.json）に束ねられる。画面の名前は deck-style-options の辞書から引く
  { id: "lilac", name: "ライラック", description: "薄紫とピンクの、柔らかな光", appearance: { ...styled, typography: "soft", ornament: "none", background: "#faf6fc", accent: "#8663bb", secondary: "#e8aebe", decoration: "glow", intensity: 78, x: 100, y: 5, scale: 100 } }, // i18n-keep: 保存済みページの実行部と配布用の設定（src/templates/deck-styles.json）に束ねられる。画面の名前は deck-style-options の辞書から引く
  { id: "glacier", name: "氷青", description: "澄んだ青から、淡いミントへ", appearance: { ...styled, background: "#f3fafc", accent: "#508eb3", secondary: "#89cbbd", decoration: "gradient", intensity: 72, x: 100, y: 10, scale: 95, angle: 145 } }, // i18n-keep: 保存済みページの実行部と配布用の設定（src/templates/deck-styles.json）に束ねられる。画面の名前は deck-style-options の辞書から引く
  { id: "twilight", name: "薄明", description: "紺に、ラベンダーとローズの光", appearance: { ...styled, typography: "editorial", ornament: "corner", background: "#202033", accent: "#9ba8e0", secondary: "#d39bab", decoration: "glow", intensity: 80, x: 100, y: 0, scale: 90 } }, // i18n-keep: 保存済みページの実行部と配布用の設定（src/templates/deck-styles.json）に束ねられる。画面の名前は deck-style-options の辞書から引く
  { id: "haze", name: "霞", description: "生成りに、藤色とセージが溶け合う", appearance: { ...styled, typography: "soft", ornament: "none", background: "#fcf6ee", accent: "#929bd0", secondary: "#82b29c", decoration: "glow", intensity: 76, x: 90, y: 8, scale: 92 } }, // i18n-keep: 保存済みページの実行部と配布用の設定（src/templates/deck-styles.json）に束ねられる。画面の名前は deck-style-options の辞書から引く
  { id: "shore", name: "海辺", description: "砂色と水色、ミントの淡い重なり", appearance: { ...styled, background: "#fff5e9", accent: "#72a9cb", secondary: "#9acfb4", decoration: "gradient", intensity: 72, x: 96, y: 4, scale: 85, angle: 130 } }, // i18n-keep: 保存済みページの実行部と配布用の設定（src/templates/deck-styles.json）に束ねられる。画面の名前は deck-style-options の辞書から引く
];
export const DEFAULT_APPEARANCE = base;
/** Names are derived from the saved appearance, never kept as a second setting. */
export function deckAppearanceName(appearance: DeckAppearance): string {
  const key = (value: DeckAppearance) => JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  return DECK_PRESETS.find(preset => key(preset.appearance) === key(appearance))?.name ?? "カスタム"; // i18n-keep: 保存済みページの実行部と配布用の設定（src/templates/deck-styles.json）に束ねられる。画面の名前は deck-style-options の辞書から引く
}

export const DECORATIONS: readonly { value: DeckAppearance["decoration"]; name: string }[] = [
  { value: "none", name: "なし" }, { value: "gradient", name: "グラデーション" }, // i18n-keep: 保存済みページの実行部と配布用の設定（src/templates/deck-styles.json）に束ねられる。画面の名前は deck-style-options の辞書から引く
  { value: "glow", name: "柔らかな光" }, { value: "grid", name: "細い格子" }, { value: "wave", name: "波形" }, // i18n-keep: 保存済みページの実行部と配布用の設定（src/templates/deck-styles.json）に束ねられる。画面の名前は deck-style-options の辞書から引く
  { value: "diagonal", name: "斜めに重なる面（表紙用）" }, // i18n-keep: 保存済みページの実行部と配布用の設定（src/templates/deck-styles.json）に束ねられる。画面の名前は deck-style-options の辞書から引く
];
export function hasExtendedStyle(value: DeckAppearancePatch): boolean {
  return value.typography !== undefined || value.ornament !== undefined;
}
export function needsExtendedStyle(design: DeckDesign, overrides: DeckOverrides): boolean {
  return [design.document,...Object.values(design.slides),overrides.document,...Object.values(overrides.slides)].some(hasExtendedStyle);
}
export function emptyOverrides(): DeckOverrides {
  return { version: DECK_DESIGN_VERSION, document: {}, slides: {} };
}
export function hasOverrides(value: DeckOverrides): boolean {
  return Object.keys(value.document).length > 0 || Object.values(value.slides).some((patch) => Object.keys(patch).length > 0);
}
export function effectiveAppearance(design: DeckDesign, overrides: DeckOverrides, id?: string): DeckAppearance {
  const { followDocument, ...slidePatch } = (id ? overrides.slides[id] : undefined) ?? {};
  return {
    ...design.document, ...(id && !followDocument ? design.slides[id] : {}),
    ...overrides.document, ...slidePatch,
  };
}
export function jsonForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
export function parseDesignJson(text: string): unknown {
  if (new TextEncoder().encode(text).length > DECK_DESIGN_MAX_BYTES) throw new Error("デザイン設定が大きすぎます"); // i18n-keep: 保存済みページの実行部と配布用の設定（src/templates/deck-styles.json）に束ねられる。画面の名前は deck-style-options の辞書から引く
  return JSON.parse(text);
}
export function exportAppearance(appearance: DeckAppearance): string {
  return JSON.stringify({ kind: "surprise-pages-deck-appearance", version: 1, appearance }, null, 2);
}
export function importAppearance(text: string): DeckAppearance {
  return appearanceFileSchema.parse(parseDesignJson(text)).appearance;
}

type RGB = [number, number, number];
function rgb(hex: string): RGB {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function mix(a: RGB, b: RGB, amount: number): RGB {
  return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount];
}
function luminance(value: RGB): number {
  const channels = value.map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a: RGB, b: RGB): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function cssRgb(value: RGB): string { return value.map(Math.round).join(" "); }

/** Bound the tint so even arbitrary user colors retain readable text. Decorations
 * use one composited pseudo-element: their total opacity cannot exceed this bound. */
export function appearanceColors(appearance: DeckAppearance): {
  text: string; muted: string; accent: string; border: string; surface: string; opacity: number; stageOpacity: number; contrast: number;
} {
  const bg = rgb(appearance.background);
  const black: RGB = [0, 0, 0], white: RGB = [255, 255, 255];
  let opacity = appearance.decoration === "none" ? 0 : appearance.intensity / 100 * 0.28;
  let foreground = contrast(bg, black) >= contrast(bg, white) ? black : white;
  // Black/white bounds cover every mixture of the two accents and all motion positions.
  let worst = 0;
  for (let i = 0; i < 30; i += 1) {
    const low = mix(bg, black, opacity), high = mix(bg, white, opacity);
    const dark = Math.min(contrast(low, black), contrast(high, black));
    const light = Math.min(contrast(low, white), contrast(high, white));
    foreground = dark >= light ? black : white;
    worst = Math.max(dark, light);
    if (worst >= 4.6 || opacity === 0) break;
    opacity *= 0.8;
  }
  // Muted is still reading text. Find a softer tone without dropping below 4.5.
  let muted = foreground;
  for (let amount = 0.7; amount <= 1.001; amount += 0.025) {
    const candidate = mix(bg, foreground, Math.min(1, amount));
    if (Math.min(contrast(candidate, mix(bg, black, opacity)), contrast(candidate, mix(bg, white, opacity))) >= 4.6) {
      muted = candidate; break;
    }
  }
  // Stage washes sit over the background decoration. Bound their combined tint,
  // including supporting text, rather than assuming every saved palette is pale.
  let stageOpacity = 0.1;
  for (let i = 0; i < 30; i += 1) {
    const total = opacity + (1 - opacity) * stageOpacity;
    if ([foreground, muted].every(text => Math.min(contrast(text, mix(bg, black, total)), contrast(text, mix(bg, white, total))) >= 4.5)) break;
    stageOpacity = i === 29 ? 0 : stageOpacity * 0.5;
  }
  // Background pigments may be pastel; meaningful text and chart marks need ink.
  // Derive that ink from the same hue instead of forcing the background darker.
  const pigment=rgb(appearance.accent), total=opacity+(1-opacity)*stageOpacity;
  let accent=foreground;
  for(let amount=0;amount<=1;amount+=0.025){
    const candidate=mix(pigment,foreground,amount);
    if(Math.min(contrast(candidate,mix(bg,black,total)),contrast(candidate,mix(bg,white,total)))>=4.6){accent=candidate;break;}
  }
  const accentHex="#"+accent.map(value=>Math.round(value).toString(16).padStart(2,"0")).join("");
  return { text: cssRgb(foreground), muted: cssRgb(muted), accent: accentHex, border: cssRgb(mix(bg, foreground, 0.18)),
    surface: cssRgb(mix(bg, foreground, 0.04)), opacity, stageOpacity, contrast: worst };
}
