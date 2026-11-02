// i18n-keep-file: エージェント用の入力契約（bin/page-agent-schema.mjs）に束ねるので辞書を読まない。zod の検証文は画面に届かず、衝突の既定文は deckEditor.conflict.default と同じ字で、出すときに localizeStored で訳す
import {isYouTubeId} from "../media/youtube-id";
import { z } from "zod";
import { textChangeSchema,textStateSchema } from "./text-model";

/** Persistent source identity. Runtime selection and presence never belong in source HTML. */
export const DECK_NODE_MARK = "data-deck-node";
export const DECK_CREATED_MARK = "data-deck-created";
export const DECK_EMPTY_TEXT_PREFIX = "sp-deck-text:";
export const deckNodeIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,99}$/);
export const deckEditStylePropertySchema = z.enum([
  "translate", "scale", "transform-origin", "width", "height", "object-fit", "object-position",
  "aspect-ratio",
  "clip-path", "position", "left", "top", "font-size", "line-height",
  "min-width", "max-width", "min-height", "max-height", "overflow",
  "font-family", "font-weight", "font-style", "text-align", "letter-spacing", "margin-top", "margin-bottom", "gap", "padding-top", "padding-bottom", "justify-content", "align-items", "flex-direction", "color", "background-color",
  "border-color", "border-width", "border-style", "border-radius", "opacity", "z-index", "white-space",
]);
export type DeckEditStyleProperty = z.infer<typeof deckEditStylePropertySchema>;

/** A page-relative asset path only; neither protocol URLs nor encoded traversal can pass. */
export function isDeckEditImagePath(value: string): boolean {
  if (value.length === 0 || value.length > 2048) return false;
  let decoded = value;
  try {
    for (let round = 0; round < 4; round += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch { return false; }
  return !/[\\\s\u0000-\u001f\u007f:?#%]/.test(decoded) && !decoded.startsWith("/") &&
    decoded.split("/").every(part => part !== "" && part !== "." && part !== "..");
}
export const deckEditImagePathSchema = z.string().refine(isDeckEditImagePath, "画像はこのページ内の素材だけを指定できます");
const styleValueSchema = z.string().min(1).max(200).refine(
  value => /^[a-zA-Z0-9#%().,+\-\s_*!/]+$/.test(value) && !/url|expression|[\r\n]/i.test(value),
  "この見た目の指定は使えません",
);
const styleSchema = z.partialRecord(deckEditStylePropertySchema, styleValueSchema);
export const deckCreatedNodeSchema = z.discriminatedUnion("tag", [
  z.object({id:deckNodeIdSchema,tag:z.literal("youtube"),videoId:z.string().refine(isYouTubeId),label:z.string().min(1).max(500),style:styleSchema.optional()}).strict(),
  z.object({ id: deckNodeIdSchema, tag: z.literal("p"), text: z.string().max(100_000), style: styleSchema.optional() }).strict(),
  z.object({ id: deckNodeIdSchema, tag: z.literal("img"), src: deckEditImagePathSchema, alt: z.string().max(2000), style: styleSchema.optional() }).strict(),
  z.object({ id: deckNodeIdSchema, tag: z.literal("video"), src: deckEditImagePathSchema, poster: deckEditImagePathSchema, label: z.string().min(1).max(2000), style: styleSchema.optional() }).strict(),
]);
const outlineEntrySchema = z.object({id:deckNodeIdSchema,parent:deckNodeIdSchema.nullable()}).strict();
const mediaReferenceSchema=z.object({src:deckEditImagePathSchema,poster:deckEditImagePathSchema}).strict();
const ownershipSchema=z.record(z.string(),z.string().uuid().nullable());
const operationEnvelope={commandId:z.string().uuid().optional(),reverts:z.string().uuid().optional(),expects:ownershipSchema.optional(),restores:ownershipSchema.optional(),textStates:z.record(z.string(),textStateSchema).optional()};
export const deckEditOperationSchema = z.discriminatedUnion("kind", [
  z.object({kind:z.literal("move"),target:deckNodeIdSchema,parentId:deckNodeIdSchema,beforeId:deckNodeIdSchema.nullable()}).extend(operationEnvelope).strict(),
  z.object({kind:z.literal("outline-move"),target:z.literal("deck-root"),ids:z.array(deckNodeIdSchema).min(1).max(1000),anchor:deckNodeIdSchema.nullable(),placement:z.enum(["before","after","inside"])}).extend(operationEnvelope).strict(),
  z.object({kind:z.literal("video-source"),target:deckNodeIdSchema,before:mediaReferenceSchema,after:mediaReferenceSchema}).extend(operationEnvelope).strict(),
  z.object({kind:z.literal("outline"),target:z.literal("deck-root"),before:z.array(outlineEntrySchema).max(1000),after:z.array(outlineEntrySchema).max(1000)}).extend(operationEnvelope).strict(),
  z.object({ kind: z.literal("chart-value"), target: deckNodeIdSchema,
    seriesId: z.string().min(1).max(100), pointId: z.string().min(1).max(100),
    before: z.number().finite().nullable(), after: z.number().finite().nullable() }).extend(operationEnvelope).strict(),
  z.object({ kind: z.literal("setting-field"), target: z.literal("deck-document"),
    name: z.enum(["appearance", "focus", "logo"]), path: z.array(z.string().min(1).max(100).refine(value => !["__proto__", "constructor", "prototype"].includes(value))).min(1).max(8),
    before: z.json(), after: z.json() }).extend(operationEnvelope).strict(),
  z.object({ kind: z.literal("notes"), target: deckNodeIdSchema, before: z.string().max(100_000), after: z.string().max(100_000) }).extend(operationEnvelope).strict(),
  z.object({ kind: z.literal("fragment"), target: deckNodeIdSchema, parentId: deckNodeIdSchema,
    beforeId: deckNodeIdSchema.nullable(), textSeed:z.string().uuid().optional(), beforeGap: z.string().max(200_000).optional(), before: z.string().max(900_000).nullable(), after: z.string().max(900_000).nullable() }).extend(operationEnvelope).strict(),
  z.object({ kind: z.literal("order"), target: deckNodeIdSchema,
    before: z.array(deckNodeIdSchema).max(1000), after: z.array(deckNodeIdSchema).max(1000) }).extend(operationEnvelope).strict(),
  z.object({ kind: z.literal("attribute"), target: deckNodeIdSchema,
    name: z.enum(["alt", "aria-label", "data-deck-locked", "data-deck-group", "data-dd-format", "data-deck-skip", "data-deck-parent"]),
    before: z.string().max(2000).nullable(), after: z.string().max(2000).nullable() }).extend(operationEnvelope).strict(),
  z.object({ kind: z.literal("setting"), target: z.literal("deck-document"),
    name: z.enum(["title", "appearance", "focus", "logo", "focus-source", "design-source", "logo-source", "diagram-library", "theme", "navigation", "design-runtime", "design-style"]), before: z.string().max(1_000_000).nullable(), after: z.string().max(1_000_000).nullable() }).extend(operationEnvelope).strict().refine(value => value.name === "design-runtime" || value.name === "design-style" || ((value.before?.length ?? 0) <= 200_000 && (value.after?.length ?? 0) <= 200_000), "設定の変更が大きすぎます"),
  z.object({ kind: z.literal("text"), target: deckNodeIdSchema, run: z.number().int().min(0).max(10000), before: z.string().max(100_000), after: z.string().max(100_000), sync: textChangeSchema.optional() }).extend(operationEnvelope).strict(),
  z.object({ kind: z.literal("style"), target: deckNodeIdSchema, property: deckEditStylePropertySchema, before: z.string().max(200).nullable(), after: styleValueSchema.nullable() }).extend(operationEnvelope).strict(),
  z.object({ kind: z.literal("image"), target: deckNodeIdSchema, before: z.string().max(2048), after: deckEditImagePathSchema }).extend(operationEnvelope).strict(),
  z.object({ kind: z.literal("insert"), target: deckNodeIdSchema, node: deckCreatedNodeSchema, textSeed:z.string().uuid().optional() }).extend(operationEnvelope).strict(),
  z.object({ kind: z.literal("remove"), target: deckNodeIdSchema, before: z.string().max(200_000), textSeed:z.string().uuid().optional() }).extend(operationEnvelope).strict(),
  z.object({ kind: z.literal("restore"), target: deckNodeIdSchema, beforeId: deckNodeIdSchema.nullable(), html: z.string().max(200_000), textSeed:z.string().uuid().optional() }).extend(operationEnvelope).strict(),
]);
export const DECK_EDIT_BATCH_LIMIT = 256;
export const deckEditOperationsSchema = z.array(deckEditOperationSchema).max(DECK_EDIT_BATCH_LIMIT);
// Trusted settings conversion can expand one 100-slide theme into many fields.
// Keep the browser wire limit small; only durable receipts allow the larger set.
export const DECK_EDIT_RECORD_LIMIT=4096;
export const deckEditRecordOperationsSchema = z.array(deckEditOperationSchema).max(DECK_EDIT_RECORD_LIMIT);
export type DeckEditOperation = z.infer<typeof deckEditOperationSchema>;
export type DeckCreatedNode = z.infer<typeof deckCreatedNodeSchema>;
export type DeckEditableNode = {
  id: string;
  slideId: string;
  tag: string;
  textRuns: { run: number; text: string }[];
  style: Record<string, string>;
  src?: string;
  alt?: string;
  poster?: string;
  label?: string;
  created: boolean;
};

/**
 * 編集の衝突。文は日本語の正本（辞書 deckEditor.conflict の字）で持ち、出すときに `localizeStored` で
 * その人の言語へ寄せる（断った理由は保存先にもこの文で残る）。ここは辞書を読まない——この型は
 * エージェント用の入力契約（bin/page-agent-schema.mjs）にも束ねられるため、辞書ごと連れ込まない。
 */
export class DeckEditConflictError extends Error {
  constructor(message = "ほかの人の変更と重なりました。入力を残したまま、最新の内容を確認してください", readonly category:"operation"|"generation"="operation") {
    super(message);
    this.name = "DeckEditConflictError";
  }
}
