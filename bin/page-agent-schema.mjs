// src/lib/deck/media/youtube-id.ts
function isYouTubeId(value) {
  return typeof value === "string" && /^[\w-]{11}$/.test(value);
}

// src/lib/deck/edit/model.ts
import { z as z2 } from "zod";

// src/lib/deck/edit/text-model.ts
import { z } from "zod";
var MAX_TEXT_UPDATE_ENCODED = 2e6;
var encodedTextUpdateSchema = z.string().max(MAX_TEXT_UPDATE_ENCODED).regex(/^[A-Za-z0-9+/]*={0,2}$/).refine((value) => value.length % 4 === 0);
var textChangeSchema = z.object({ epoch: z.string().uuid(), update: encodedTextUpdateSchema, undo: encodedTextUpdateSchema.optional() }).strict();
var textStateSchema = z.object({ epoch: z.string().uuid(), state: encodedTextUpdateSchema }).strict();

// src/lib/deck/edit/model.ts
var DECK_NODE_MARK = "data-deck-node";
var DECK_CREATED_MARK = "data-deck-created";
var DECK_EMPTY_TEXT_PREFIX = "sp-deck-text:";
var deckNodeIdSchema = z2.string().regex(/^[a-z][a-z0-9-]{0,99}$/);
var deckEditStylePropertySchema = z2.enum([
  "translate",
  "scale",
  "transform-origin",
  "width",
  "height",
  "object-fit",
  "object-position",
  "aspect-ratio",
  "clip-path",
  "position",
  "left",
  "top",
  "font-size",
  "line-height",
  "min-width",
  "max-width",
  "min-height",
  "max-height",
  "overflow",
  "font-family",
  "font-weight",
  "font-style",
  "text-align",
  "letter-spacing",
  "margin-top",
  "margin-bottom",
  "gap",
  "padding-top",
  "padding-bottom",
  "justify-content",
  "align-items",
  "flex-direction",
  "color",
  "background-color",
  "border-color",
  "border-width",
  "border-style",
  "border-radius",
  "opacity",
  "z-index",
  "white-space"
]);
function isDeckEditImagePath(value) {
  if (value.length === 0 || value.length > 2048) return false;
  let decoded = value;
  try {
    for (let round = 0; round < 4; round += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return false;
  }
  return !/[\\\s\u0000-\u001f\u007f:?#%]/.test(decoded) && !decoded.startsWith("/") && decoded.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}
var deckEditImagePathSchema = z2.string().refine(isDeckEditImagePath, "\u753B\u50CF\u306F\u3053\u306E\u30DA\u30FC\u30B8\u5185\u306E\u7D20\u6750\u3060\u3051\u3092\u6307\u5B9A\u3067\u304D\u307E\u3059");
var styleValueSchema = z2.string().min(1).max(200).refine(
  (value) => /^[a-zA-Z0-9#%().,+\-\s_*!/]+$/.test(value) && !/url|expression|[\r\n]/i.test(value),
  "\u3053\u306E\u898B\u305F\u76EE\u306E\u6307\u5B9A\u306F\u4F7F\u3048\u307E\u305B\u3093"
);
var styleSchema = z2.partialRecord(deckEditStylePropertySchema, styleValueSchema);
var deckCreatedNodeSchema = z2.discriminatedUnion("tag", [
  z2.object({ id: deckNodeIdSchema, tag: z2.literal("youtube"), videoId: z2.string().refine(isYouTubeId), label: z2.string().min(1).max(500), style: styleSchema.optional() }).strict(),
  z2.object({ id: deckNodeIdSchema, tag: z2.literal("p"), text: z2.string().max(1e5), style: styleSchema.optional() }).strict(),
  z2.object({ id: deckNodeIdSchema, tag: z2.literal("img"), src: deckEditImagePathSchema, alt: z2.string().max(2e3), style: styleSchema.optional() }).strict(),
  z2.object({ id: deckNodeIdSchema, tag: z2.literal("video"), src: deckEditImagePathSchema, poster: deckEditImagePathSchema, label: z2.string().min(1).max(2e3), style: styleSchema.optional() }).strict()
]);
var outlineEntrySchema = z2.object({ id: deckNodeIdSchema, parent: deckNodeIdSchema.nullable() }).strict();
var mediaReferenceSchema = z2.object({ src: deckEditImagePathSchema, poster: deckEditImagePathSchema }).strict();
var ownershipSchema = z2.record(z2.string(), z2.string().uuid().nullable());
var operationEnvelope = { commandId: z2.string().uuid().optional(), reverts: z2.string().uuid().optional(), expects: ownershipSchema.optional(), restores: ownershipSchema.optional(), textStates: z2.record(z2.string(), textStateSchema).optional() };
var deckEditOperationSchema = z2.discriminatedUnion("kind", [
  z2.object({ kind: z2.literal("move"), target: deckNodeIdSchema, parentId: deckNodeIdSchema, beforeId: deckNodeIdSchema.nullable() }).extend(operationEnvelope).strict(),
  z2.object({ kind: z2.literal("outline-move"), target: z2.literal("deck-root"), ids: z2.array(deckNodeIdSchema).min(1).max(1e3), anchor: deckNodeIdSchema.nullable(), placement: z2.enum(["before", "after", "inside"]) }).extend(operationEnvelope).strict(),
  z2.object({ kind: z2.literal("video-source"), target: deckNodeIdSchema, before: mediaReferenceSchema, after: mediaReferenceSchema }).extend(operationEnvelope).strict(),
  z2.object({ kind: z2.literal("outline"), target: z2.literal("deck-root"), before: z2.array(outlineEntrySchema).max(1e3), after: z2.array(outlineEntrySchema).max(1e3) }).extend(operationEnvelope).strict(),
  z2.object({
    kind: z2.literal("chart-value"),
    target: deckNodeIdSchema,
    seriesId: z2.string().min(1).max(100),
    pointId: z2.string().min(1).max(100),
    before: z2.number().finite().nullable(),
    after: z2.number().finite().nullable()
  }).extend(operationEnvelope).strict(),
  z2.object({
    kind: z2.literal("setting-field"),
    target: z2.literal("deck-document"),
    name: z2.enum(["appearance", "focus", "logo"]),
    path: z2.array(z2.string().min(1).max(100).refine((value) => !["__proto__", "constructor", "prototype"].includes(value))).min(1).max(8),
    before: z2.json(),
    after: z2.json()
  }).extend(operationEnvelope).strict(),
  z2.object({ kind: z2.literal("notes"), target: deckNodeIdSchema, before: z2.string().max(1e5), after: z2.string().max(1e5) }).extend(operationEnvelope).strict(),
  z2.object({
    kind: z2.literal("fragment"),
    target: deckNodeIdSchema,
    parentId: deckNodeIdSchema,
    beforeId: deckNodeIdSchema.nullable(),
    textSeed: z2.string().uuid().optional(),
    beforeGap: z2.string().max(2e5).optional(),
    before: z2.string().max(9e5).nullable(),
    after: z2.string().max(9e5).nullable()
  }).extend(operationEnvelope).strict(),
  z2.object({
    kind: z2.literal("order"),
    target: deckNodeIdSchema,
    before: z2.array(deckNodeIdSchema).max(1e3),
    after: z2.array(deckNodeIdSchema).max(1e3)
  }).extend(operationEnvelope).strict(),
  z2.object({
    kind: z2.literal("attribute"),
    target: deckNodeIdSchema,
    name: z2.enum(["alt", "aria-label", "data-deck-locked", "data-deck-group", "data-dd-format", "data-deck-skip", "data-deck-parent"]),
    before: z2.string().max(2e3).nullable(),
    after: z2.string().max(2e3).nullable()
  }).extend(operationEnvelope).strict(),
  z2.object({
    kind: z2.literal("setting"),
    target: z2.literal("deck-document"),
    name: z2.enum(["title", "appearance", "focus", "logo", "focus-source", "design-source", "logo-source", "diagram-library", "theme", "navigation", "design-runtime", "design-style"]),
    before: z2.string().max(1e6).nullable(),
    after: z2.string().max(1e6).nullable()
  }).extend(operationEnvelope).strict().refine((value) => value.name === "design-runtime" || value.name === "design-style" || (value.before?.length ?? 0) <= 2e5 && (value.after?.length ?? 0) <= 2e5, "\u8A2D\u5B9A\u306E\u5909\u66F4\u304C\u5927\u304D\u3059\u304E\u307E\u3059"),
  z2.object({ kind: z2.literal("text"), target: deckNodeIdSchema, run: z2.number().int().min(0).max(1e4), before: z2.string().max(1e5), after: z2.string().max(1e5), sync: textChangeSchema.optional() }).extend(operationEnvelope).strict(),
  z2.object({ kind: z2.literal("style"), target: deckNodeIdSchema, property: deckEditStylePropertySchema, before: z2.string().max(200).nullable(), after: styleValueSchema.nullable() }).extend(operationEnvelope).strict(),
  z2.object({ kind: z2.literal("image"), target: deckNodeIdSchema, before: z2.string().max(2048), after: deckEditImagePathSchema }).extend(operationEnvelope).strict(),
  z2.object({ kind: z2.literal("insert"), target: deckNodeIdSchema, node: deckCreatedNodeSchema, textSeed: z2.string().uuid().optional() }).extend(operationEnvelope).strict(),
  z2.object({ kind: z2.literal("remove"), target: deckNodeIdSchema, before: z2.string().max(2e5), textSeed: z2.string().uuid().optional() }).extend(operationEnvelope).strict(),
  z2.object({ kind: z2.literal("restore"), target: deckNodeIdSchema, beforeId: deckNodeIdSchema.nullable(), html: z2.string().max(2e5), textSeed: z2.string().uuid().optional() }).extend(operationEnvelope).strict()
]);
var DECK_EDIT_BATCH_LIMIT = 256;
var deckEditOperationsSchema = z2.array(deckEditOperationSchema).max(DECK_EDIT_BATCH_LIMIT);
var DECK_EDIT_RECORD_LIMIT = 4096;
var deckEditRecordOperationsSchema = z2.array(deckEditOperationSchema).max(DECK_EDIT_RECORD_LIMIT);
var DeckEditConflictError = class extends Error {
  constructor(message = "\u307B\u304B\u306E\u4EBA\u306E\u5909\u66F4\u3068\u91CD\u306A\u308A\u307E\u3057\u305F\u3002\u5165\u529B\u3092\u6B8B\u3057\u305F\u307E\u307E\u3001\u6700\u65B0\u306E\u5185\u5BB9\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044", category = "operation") {
    super(message);
    this.category = category;
    this.name = "DeckEditConflictError";
  }
};
export {
  DECK_CREATED_MARK,
  DECK_EDIT_BATCH_LIMIT,
  DECK_EDIT_RECORD_LIMIT,
  DECK_EMPTY_TEXT_PREFIX,
  DECK_NODE_MARK,
  DeckEditConflictError,
  deckCreatedNodeSchema,
  deckEditImagePathSchema,
  deckEditOperationSchema,
  deckEditOperationsSchema,
  deckEditRecordOperationsSchema,
  deckEditStylePropertySchema,
  deckNodeIdSchema,
  isDeckEditImagePath
};
