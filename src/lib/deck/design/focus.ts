import { z } from "zod";
import { deckIdSchema } from "./design";

export const DECK_FOCUS_MARK = "data-deck-focus";
export const DECK_FOCUS_OVERRIDES_MARK = "data-deck-focus-overrides";
export const DECK_FOCUS_VERSION = 1;
export const DECK_FOCUS_REQUEST_EVENT = "surprise:deck-focus-request";
export const DECK_FOCUS_READY_EVENT = "surprise:deck-focus-ready";
export const DECK_FOCUS_APPLY_EVENT = "surprise:deck-focus-apply";
export const DECK_FOCUS_PREVIEW_EVENT = "surprise:deck-focus-preview";
export const DECK_CUSTOMIZATION_CHANGE_EVENT = "surprise:deck-customization-change";

export const DECK_TARGET_MARKS = {
  element: "data-dd-element-id",
  row: "data-dd-row-id",
  column: "data-dd-column-id",
  cell: "data-dd-cell-id",
  series: "data-dd-series-id",
  point: "data-dd-point-id",
  range: "data-dd-range-id",
  region: "data-dd-region-id",
  node: "data-dd-node-id",
  edge: "data-dd-edge-id",
};

export const focusTargetKindSchema = z.enum([
  "element", "row", "column", "cell", "series", "point", "range", "region", "node", "edge",
]);
export const focusActionKindSchema = z.enum([
  "emphasize", "range", "compare", "reveal", "current", "annotation", "zoom", "overview",
]);

export const focusTargetRefSchema = z.object({
  slideId: deckIdSchema,
  kind: focusTargetKindSchema,
  id: deckIdSchema,
}).strict();

const zoomSchema = z.object({
  scale: z.number().min(1).max(4),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
}).strict();

export const focusActionSchema = z.object({
  id: deckIdSchema,
  kind: focusActionKindSchema,
  targets: z.array(focusTargetRefSchema).max(64),
  annotation: z.string().trim().min(1).max(500).optional(),
  zoom: zoomSchema.optional(),
  state: z.enum(["before", "after"]).optional(),
}).strict().superRefine((action, context) => {
  if (action.kind !== "overview" && action.targets.length === 0) {
    context.addIssue({ code: "custom", path: ["targets"], message: "対象が必要です" }); // i18n-keep: 保存済みページの実行部に束ねられる検証の文（画面には出さない）
  }
  if (action.kind === "annotation" && action.annotation === undefined) {
    context.addIssue({ code: "custom", path: ["annotation"], message: "短い説明が必要です" }); // i18n-keep: 保存済みページの実行部に束ねられる検証の文（画面には出さない）
  }
  if (action.kind === "zoom" && action.zoom === undefined) {
    context.addIssue({ code: "custom", path: ["zoom"], message: "拡大範囲が必要です" }); // i18n-keep: 保存済みページの実行部に束ねられる検証の文（画面には出さない）
  }
});

export const focusStepSchema = z.object({
  id: deckIdSchema,
  title: z.string().trim().min(1).max(120).optional(),
  /** Public-reader supplement. Speaker notes remain a separate aside in the slide. */
  supplement: z.string().trim().min(1).max(1_000).optional(),
  actions: z.array(focusActionSchema).min(1).max(32),
}).strict().superRefine((step, context) => {
  const ids = step.actions.map((action) => action.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["actions"], message: "演出の目印が重複しています" }); // i18n-keep: 保存済みページの実行部に束ねられる検証の文（画面には出さない）
  }
});

const authoredSlideSchema = z.object({
  steps: z.array(focusStepSchema).max(64),
}).strict().superRefine((slide, context) => {
  const ids = slide.steps.map((step) => step.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["steps"], message: "手順の目印が重複しています" }); // i18n-keep: 保存済みページの実行部に束ねられる検証の文（画面には出さない）
  }
});

export const deckFocusSchema = z.object({
  version: z.literal(DECK_FOCUS_VERSION),
  /** Reading shows the complete slide; guided mode is an explicit opt-in. */
  guidedByDefault: z.boolean().default(false),
  slides: z.record(deckIdSchema, authoredSlideSchema),
}).strict();

export const focusStepOverrideSchema = z.object({
  hidden: z.boolean().optional(),
  title: z.string().trim().min(1).max(120).nullable().optional(),
  supplement: z.string().trim().min(1).max(1_000).nullable().optional(),
  actions: z.array(focusActionSchema).min(1).max(32).optional(),
}).strict();

const focusSlideOverridesSchema = z.object({
  order: z.array(deckIdSchema).max(64).optional(),
  steps: z.record(deckIdSchema, focusStepOverrideSchema),
}).strict().superRefine((slide, context) => {
  if (slide.order !== undefined && new Set(slide.order).size !== slide.order.length) {
    context.addIssue({ code: "custom", path: ["order"], message: "手順の並びに重複があります" }); // i18n-keep: 保存済みページの実行部に束ねられる検証の文（画面には出さない）
  }
});

export const deckFocusOverridesSchema = z.object({
  version: z.literal(DECK_FOCUS_VERSION),
  guided: z.boolean().optional(),
  slides: z.record(deckIdSchema, focusSlideOverridesSchema),
}).strict();

export type FocusTargetKind = z.infer<typeof focusTargetKindSchema>;
export type FocusAction = z.infer<typeof focusActionSchema>;
export type FocusStep = z.infer<typeof focusStepSchema>;
/** Public reading text for one step; speaker notes are never part of this input. */
export function stepPublicSupplement(step: Pick<FocusStep, "supplement" | "actions">): string | null {
  const parts = [step.supplement, ...step.actions.map((action) => action.annotation)]
    .flatMap((value) => value?.trim() ? [value.trim()] : []);
  const text = [...new Set(parts)].join("\n");
  return text || null;
}

export type DeckFocus = z.infer<typeof deckFocusSchema>;
export type DeckFocusOverrides = z.infer<typeof deckFocusOverridesSchema>;
export type FocusTargetRef = z.infer<typeof focusTargetRefSchema>;

export type FocusTargetInventory = ReadonlyMap<string, ReadonlySet<string>>;
export type InvalidFocusTarget = {
  slideId: string;
  stepId: string;
  actionId: string;
  target: FocusTargetRef;
  reason: "slide" | "cross-slide" | "target";
};
export type EffectiveDeckFocus = {
  guided: boolean;
  slides: ReadonlyMap<string, readonly FocusStep[]>;
  invalidTargets: readonly InvalidFocusTarget[];
  orphanedOverrideSteps: readonly { slideId: string; stepId: string }[];
};

export function emptyFocusOverrides(): DeckFocusOverrides {
  return { version: DECK_FOCUS_VERSION, slides: {} };
}

export function hasFocusOverrides(value: DeckFocusOverrides): boolean {
  return value.guided !== undefined || Object.keys(value.slides).length > 0;
}

function applyStepOverride(step: FocusStep, override: z.infer<typeof focusStepOverrideSchema>): FocusStep {
  return {
    ...step,
    ...(override.title === undefined ? {} : override.title === null ? { title: undefined } : { title: override.title }),
    ...(override.supplement === undefined
      ? {}
      : override.supplement === null ? { supplement: undefined } : { supplement: override.supplement }),
    ...(override.actions === undefined ? {} : { actions: override.actions }),
  };
}

function targetKey(slideId: string, kind: FocusTargetKind): string {
  return `${slideId}\u0000${kind}`;
}

export function inventoryKey(slideId: string, kind: FocusTargetKind): string {
  return targetKey(slideId, kind);
}

export function effectiveDeckFocus(
  authored: DeckFocus,
  overrides: DeckFocusOverrides,
  slideIds: ReadonlySet<string>,
  inventory: FocusTargetInventory,
): EffectiveDeckFocus {
  const slides = new Map<string, readonly FocusStep[]>();
  const invalidTargets: InvalidFocusTarget[] = [];
  const orphanedOverrideSteps: { slideId: string; stepId: string }[] = [];
  const allSlideIds = new Set([...Object.keys(authored.slides), ...Object.keys(overrides.slides)]);

  for (const slideId of allSlideIds) {
    const source = authored.slides[slideId]?.steps ?? [];
    const saved = overrides.slides[slideId];
    const sourceById = new Map(source.map((step) => [step.id, step]));
    const stepIds = saved?.order ?? source.map((step) => step.id);
    const remaining = source.map((step) => step.id).filter((id) => !stepIds.includes(id));
    const ordered = [...stepIds, ...remaining];
    const effective: FocusStep[] = [];

    for (const stepId of ordered) {
      const base = sourceById.get(stepId);
      const patch = saved?.steps[stepId];
      if (patch?.hidden === true) continue;
      if (base === undefined) {
        if (patch?.actions === undefined) {
          orphanedOverrideSteps.push({ slideId, stepId });
          continue;
        }
        effective.push({
          id: stepId,
          ...(patch.title ? { title: patch.title } : {}),
          ...(patch.supplement ? { supplement: patch.supplement } : {}),
          actions: patch.actions,
        });
      } else {
        effective.push(patch === undefined ? base : applyStepOverride(base, patch));
      }
    }

    for (const [stepId, patch] of Object.entries(saved?.steps ?? {})) {
      if (!ordered.includes(stepId) && patch.actions !== undefined && patch.hidden !== true) {
        effective.push({
          id: stepId,
          ...(patch.title ? { title: patch.title } : {}),
          ...(patch.supplement ? { supplement: patch.supplement } : {}),
          actions: patch.actions,
        });
      }
    }
    slides.set(slideId, effective);

    for (const step of effective) {
      for (const action of step.actions) {
        for (const target of action.targets) {
          let reason: "slide" | "cross-slide" | "target" | null = null;
          if (!slideIds.has(target.slideId)) reason = "slide";
          else if (target.slideId !== slideId) reason = "cross-slide";
          else if (inventory.get(targetKey(target.slideId, target.kind))?.has(target.id) !== true) reason = "target";
          if (reason !== null) invalidTargets.push({ slideId, stepId: step.id, actionId: action.id, target, reason });
        }
      }
    }
  }

  return {
    guided: overrides.guided ?? authored.guidedByDefault,
    slides,
    invalidTargets,
    orphanedOverrideSteps,
  };
}
