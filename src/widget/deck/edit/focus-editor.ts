import {
  DECK_TARGET_MARKS,
  DECK_FOCUS_PREVIEW_EVENT,
  effectiveDeckFocus,
  focusActionKindSchema,
  focusTargetKindSchema,
  type DeckFocus,
  type DeckFocusOverrides,
  type FocusAction,
  type FocusTargetKind,
  type FocusTargetRef,
} from "../../../lib/deck/design/focus";
import type { MessageKey } from "../../../lib/i18n/messages/types";
import { el } from "../../shared/util";
import { t } from "../../shared/i18n";
import { DECK_FOCUS_EDITOR_STYLES } from "./focus-editor-styles";

/** 見た目の字は ./deck-focus-editor-styles.ts が正本（道具箱が最初から読むので分けてある）。今までの読み手のために同じ名前で渡す。 */
export { DECK_FOCUS_EDITOR_STYLES };

export type DeckFocusEditor = {
  root: HTMLElement;
  dirty: () => boolean;
  value: () => DeckFocusOverrides;
  restore: (value: DeckFocusOverrides) => void;
  select: (slideId: string) => void;
  /** Returns true only when the click chose a named, authored target. */
  selectTarget: (element: Element) => boolean;
  refresh: () => void;
};

type Input = {
  authored: DeckFocus;
  overrides: DeckFocusOverrides;
  ids: readonly string[];
  master: Document;
  frame: HTMLIFrameElement;
  changed: () => void;
};

type StepView = {
  id: string;
  title: string;
  supplement: string;
  actions: FocusAction[];
};

const actionKeys: ReadonlyMap<FocusAction["kind"], MessageKey> = new Map([
  ["emphasize", "decks.focusEditor.action.emphasize"], ["range", "decks.focusEditor.action.range"], ["compare", "decks.focusEditor.action.compare"],
  ["reveal", "decks.focusEditor.action.reveal"], ["current", "decks.focusEditor.action.current"], ["annotation", "decks.focusEditor.action.annotation"],
  ["zoom", "decks.focusEditor.action.zoom"], ["overview", "decks.focusEditor.action.overview"],
]);
const actionName = (kind: FocusAction["kind"]): string => { const key = actionKeys.get(kind); return key ? t(key) : kind; };

const targetKeys: ReadonlyMap<FocusTargetKind, MessageKey> = new Map([
  ["element", "decks.focusEditor.target.element"], ["row", "decks.focusEditor.target.row"], ["column", "decks.focusEditor.target.column"], ["cell", "decks.focusEditor.target.cell"],
  ["series", "decks.focusEditor.target.series"], ["point", "decks.focusEditor.target.point"], ["range", "decks.focusEditor.target.range"],
  ["region", "decks.focusEditor.target.region"], ["node", "decks.focusEditor.target.node"], ["edge", "decks.focusEditor.target.edge"],
]);
const targetName = (kind: FocusTargetKind): string => { const key = targetKeys.get(kind); return key ? t(key) : t("decks.focusEditor.targetFallback"); };

const targetSpecificity: ReadonlyMap<FocusTargetKind, number> = new Map([
  ["cell", 0], ["point", 1], ["node", 2], ["edge", 3], ["region", 4],
  ["row", 5], ["column", 6], ["series", 7], ["range", 8], ["element", 9],
]);

const mirrorMarks: Partial<Record<FocusTargetKind, string>> = {
  column: "data-dd-column-ref",
  range: "data-dd-range-ref",
  region: "data-dd-region-ref",
};

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? { ...value } : null;
}

function readableText(value: string | null | undefined, target: FocusTargetRef): string | null {
  const text = (value ?? "").replace(/<br\s*\/?>/gi, " · ").replace(/\s+/g, " ").trim();
  if (text.length === 0) return null;
  const idWords = target.id.replace(/^edge-/, "").replaceAll("-", "→").toLowerCase();
  const compact = text.replace(/\s+/g, "").toLowerCase();
  if (compact === target.id.toLowerCase() || compact.replaceAll("→", "") === idWords.replaceAll("→", "")) return null;
  if (/^[a-z][a-z0-9_-]*$/i.test(text)) return null;
  return text.length <= 64 ? text : text.slice(0, 61) + "…";
}

function slideOf(root: ParentNode, slideId: string): Element | null {
  return [...root.querySelectorAll("[data-deck-id]")].find((slide) => slide.getAttribute("data-deck-id") === slideId) ?? null;
}

function marked(root: ParentNode, mark: string, id: string): Element[] {
  return [...root.querySelectorAll("[" + mark + "]")].filter((element) => element.getAttribute(mark) === id);
}

function structuredLabel(slide: Element, target: FocusTargetRef): string | null {
  if (target.kind === "series" || target.kind === "point" || target.kind === "range") {
    for (const source of slide.querySelectorAll("script[data-dd-chart-source]")) {
      let parsed: unknown;
      try { parsed = JSON.parse(source.textContent ?? ""); } catch { continue; }
      const record = recordOf(parsed);
      const series = record?.["series"];
      if (!Array.isArray(series)) continue;
      const rangeLabels: string[] = [];
      for (const candidate of series) {
        const one = recordOf(candidate);
        if (one === null) continue;
        if (target.kind === "series" && one["id"] === target.id && typeof one["label"] === "string") {
          return readableText(one["label"], target);
        }
        const data = one["data"];
        if (!Array.isArray(data)) continue;
        for (const row of data) {
          const point = recordOf(row);
          if (point === null) continue;
          if (target.kind === "point" && point["id"] === target.id && typeof point["label"] === "string") {
            return readableText(point["label"], target);
          }
          if (target.kind === "range" && point["rangeId"] === target.id && typeof point["label"] === "string") {
            const label = readableText(point["label"], target);
            if (label !== null) rangeLabels.push(label);
          }
        }
      }
      if (rangeLabels.length === 1) return rangeLabels[0] ?? null;
      if (rangeLabels.length > 1) return rangeLabels[0] + "〜" + rangeLabels[rangeLabels.length - 1];
    }
  }
  if (target.kind === "node" || target.kind === "region") {
    for (const source of slide.querySelectorAll("script[data-dd-native-source]")) {
      let parsed: unknown;
      try { parsed = JSON.parse(source.textContent ?? ""); } catch { continue; }
      const record = recordOf(parsed);
      if (record === null) continue;
      for (const key of ["sets", "points", "regions"]) {
        const rows = record[key];
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
          const item = recordOf(row);
          if (item?.["id"] === target.id && typeof item["label"] === "string") return readableText(item["label"], target);
        }
      }
    }
  }
  return null;
}

function mermaidLabel(slide: Element, target: FocusTargetRef): string | null {
  if (target.kind !== "node" && target.kind !== "edge") return null;
  for (const source of slide.querySelectorAll("pre.mermaid")) {
    const text = source.textContent ?? "";
    const nodes = new Map<string, string>();
    const nodePattern = /\b([a-z][a-z0-9_-]*)\s*(?:\(\[([^\]\n]+)\]\)|\[([^\]\n]+)\]|\{([^}\n]+)\}|\(\(([^)\n]+)\)\)|\(([^)\n]+)\))/gi;
    for (const found of text.matchAll(nodePattern)) {
      const id = found[1];
      const label = found[2] ?? found[3] ?? found[4] ?? found[5] ?? found[6];
      if (id !== undefined && label !== undefined) nodes.set(id, label.replace(/^["']|["']$/g, "").trim());
    }
    if (target.kind === "node") return readableText(nodes.get(target.id), target);
    const edgePattern = /\b([a-z][a-z0-9_-]*)(?:\(\[[^\]\n]+\]\)|\[[^\]\n]+\]|\{[^}\n]+\}|\(\([^\)\n]+\)\)|\([^\)\n]+\))?\s+([a-z][a-z0-9_-]*)@\s*[-=.ox]+>\s*(?:\|([^|\n]+)\|\s*)?([a-z][a-z0-9_-]*)/gi;
    for (const found of text.matchAll(edgePattern)) {
      if (found[2] !== target.id) continue;
      const from = found[1] === undefined ? null : nodes.get(found[1]);
      const to = found[4] === undefined ? null : nodes.get(found[4]);
      if (from === undefined || from === null || to === undefined || to === null) continue;
      const condition = found[3]?.trim();
      return from + " → " + to + (condition ? "（" + condition + "）" : "");
    }
  }
  return null;
}

function domLabel(slide: Element, target: FocusTargetRef): string | null {
  const mark = DECK_TARGET_MARKS[target.kind];
  const direct = marked(slide, mark, target.id);
  const mirrorMark = mirrorMarks[target.kind];
  const mirror = mirrorMark === undefined ? [] : marked(slide, mirrorMark, target.id);
  const candidates = [...direct, ...mirror];
  if (target.kind === "range" && mirror.length > 0) {
    const labels = mirror.map((element) => readableText(element.querySelector("th,[role=rowheader]")?.textContent ?? element.textContent, target)).filter((value) => value !== null);
    if (labels.length === 1) return labels[0] ?? null;
    if (labels.length > 1) return labels[0] + "〜" + labels[labels.length - 1];
  }
  for (const element of candidates) {
    if (target.kind === "element" && element.closest("[data-dd-chart]") !== null) {
      const label = readableText(element.closest("[data-dd-chart]")?.querySelector(".dd-chart-title")?.textContent, target);
      if (label !== null) return label;
      return t("decks.focusEditor.chart");
    }
    if (target.kind === "element" && element.matches("table")) {
      return readableText(element.querySelector("caption")?.textContent, target) ?? t("decks.focusEditor.table");
    }
    const explicit = readableText(element.getAttribute("aria-label") ?? element.getAttribute("data-label"), target);
    if (explicit !== null) return explicit;
    if (target.kind === "row" || target.kind === "point") {
      const label = readableText(element.querySelector("th,[role=rowheader],dt,strong")?.textContent, target);
      if (label !== null) return label;
    }
    if (target.kind === "column" || target.kind === "cell") {
      const label = readableText(element.textContent, target);
      if (label !== null) return label;
    }
    if (target.kind === "node") {
      const label = readableText(element.querySelector("text,.label")?.textContent ?? element.textContent, target);
      if (label !== null) return label;
    }
    if (target.kind !== "edge") {
      const semantic = element.matches("p,li,blockquote,dt,dd,figcaption,h1,h2,h3,h4,h5,h6")
        ? element
        : element.querySelector(".dd-display,.dd-statement,.dd-proof-label,.dd-caption,figcaption,dt,strong,h1,h2,h3,h4,h5,h6");
      const label = readableText(semantic?.textContent, target);
      if (label !== null) return label;
    }
    const own = readableText(element.textContent, target);
    if (own !== null) return own;
  }
  return null;
}

function button(text: string, click: () => void): HTMLButtonElement {
  const result = el("button", "edit-button", text);
  result.type = "button";
  result.addEventListener("click", click);
  return result;
}

function inputLabel(text: string, control: HTMLElement): HTMLLabelElement {
  const result = el("label", "deck-focus-field");
  result.append(el("span", undefined, text), control);
  return result;
}

function generatedId(prefix: string, used: ReadonlySet<string>): string {
  let count = 1;
  let value = `${prefix}-${count}`;
  while (used.has(value)) { count += 1; value = `${prefix}-${count}`; }
  return value;
}

function targetKey(target: FocusTargetRef): string {
  return `${target.slideId}\u0000${target.kind}\u0000${target.id}`;
}

function sameTargets(left: readonly FocusTargetRef[], right: readonly FocusTargetRef[]): boolean {
  return left.length === right.length && left.every((target, index) => targetKey(target) === targetKey(right[index]));
}

function cloneAction(action: FocusAction): FocusAction {
  return {
    ...action,
    targets: action.targets.map((target) => ({ ...target })),
    ...(action.zoom ? { zoom: { ...action.zoom } } : {}),
  };
}

/**
 * The focus workspace never infers an element from a screen position. Every
 * selected item is the authored, stable name found on the slide itself.
 */
export function createDeckFocusEditor(input: Input): DeckFocusEditor {
  const initial = JSON.stringify(input.overrides);
  let overrides = input.overrides;
  let selectedSlide = input.ids[0] ?? "";
  let selectedStepId: string | null = null;
  let selectedActionId: string | null = null;
  const selectedTargets = new Map<string, FocusTargetRef>();

  const root = el("section", "deck-focus-workspace");
  root.setAttribute("aria-label", t("decks.focusEditor.adjust"));
  const header = el("div", "deck-focus-header");
  const slidePicker = el("select", "deck-design-input");
  slidePicker.setAttribute("aria-label", t("decks.focusEditor.slidePicker"));
  for (const [index, id] of input.ids.entries()) {
    const option = el("option", undefined, t("decks.focusEditor.slideOption", { number: index + 1 }));
    option.value = id;
    slidePicker.append(option);
  }
  slidePicker.addEventListener("change", () => select(slidePicker.value));
  header.append(inputLabel(t("decks.focusEditor.slide"), slidePicker));
  root.append(header);

  const guidance = el("p", "deck-design-help", t("decks.focusEditor.guidance"));
  const targetList = el("div", "deck-focus-targets");
  const stepList = el("ol", "deck-focus-steps");
  const inspector = el("section", "deck-focus-inspector");
  root.append(guidance, targetList, stepList, inspector);

  // The authored master is immutable for this panel's lifetime. Index once;
  // choosing a focus step must not query the whole deck once for every slide.
  const sourceSlides = new Map([...input.master.querySelectorAll('[data-deck-slide][data-deck-id]')].map(slide => [slide.getAttribute('data-deck-id')!, slide]));
  const targetIndexes = new Map<string, FocusTargetRef[]>();
  function targetInventory(slideId: string): FocusTargetRef[] {
    const cached = targetIndexes.get(slideId); if (cached) return cached;
    const slide = sourceSlides.get(slideId);
    if (!slide) return [];
    const targets: FocusTargetRef[] = [];
    for (const [kind, mark] of Object.entries(DECK_TARGET_MARKS)) {
      const parsedKind = focusTargetKindSchema.safeParse(kind);
      if (!parsedKind.success) continue;
      const nodes = slide.querySelectorAll(`[${mark}]`);
      for (const node of nodes) {
        const value = node.getAttribute(mark);
        if (value === null) continue;
        targets.push({ slideId, kind: parsedKind.data, id: value });
      }
    }
    targetIndexes.set(slideId, targets); return targets;
  }

  function humanTargetName(target: FocusTargetRef): string | null {
    const roots: ParentNode[] = [input.master];
    const shown = input.frame.contentDocument;
    if (shown !== null) roots.push(shown);
    for (const root of roots) {
      const slide = slideOf(root, target.slideId);
      if (slide === null) continue;
      const label = structuredLabel(slide, target) ?? mermaidLabel(slide, target) ?? domLabel(slide, target);
      if (label !== null) return label;
    }
    return null;
  }

  function targetLabels(slideId: string): ReadonlyMap<string, string> {
    const targets = targetInventory(slideId);
    const kindAt = new Map<FocusTargetKind, number>();
    const rows = targets.map((target) => {
      const ordinal = (kindAt.get(target.kind) ?? 0) + 1;
      kindAt.set(target.kind, ordinal);
      return { target, base: humanTargetName(target) ?? t("decks.focusEditor.ordinal", { number: ordinal }) };
    });
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = row.target.kind + "\u0000" + row.base;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const seen = new Map<string, number>();
    const labels = new Map<string, string>();
    for (const row of rows) {
      const duplicateKey = row.target.kind + "\u0000" + row.base;
      const at = (seen.get(duplicateKey) ?? 0) + 1;
      seen.set(duplicateKey, at);
      const name = (counts.get(duplicateKey) ?? 0) > 1 ? t("decks.focusEditor.duplicate", { name: row.base, number: at }) : row.base;
      labels.set(targetKey(row.target), t("decks.focusEditor.targetLabel", { kind: targetName(row.target.kind), name }));
    }
    return labels;
  }

  function displayTarget(target: FocusTargetRef): string {
    return targetLabels(target.slideId).get(targetKey(target))
      ?? t("decks.focusEditor.targetLabel", { kind: targetName(target.kind), name: t("decks.focusEditor.previousTarget") });
  }

  let effectiveCache: {overrides: DeckFocusOverrides; value: ReturnType<typeof effectiveDeckFocus>} | null = null;
  let fullInventory: Map<string, Set<string>> | null = null;
  const slideIds = new Set(input.ids);
  function focusState() {
    if (effectiveCache?.overrides === overrides) return effectiveCache.value;
    if (!fullInventory) {
      fullInventory = new Map<string, Set<string>>();
      for (const slideId of input.ids) for (const target of targetInventory(slideId)) {
        const key = `${target.slideId}\u0000${target.kind}`;
        const values = fullInventory.get(key) ?? new Set<string>();
        values.add(target.id); fullInventory.set(key, values);
      }
    }
    const value = effectiveDeckFocus(input.authored, overrides, slideIds, fullInventory);
    effectiveCache = {overrides,value}; return value;
  }
  function currentSteps(): StepView[] {
    const effective = focusState();
    return (effective.slides.get(selectedSlide) ?? []).map((step) => ({
      id: step.id, title: step.title ?? "", supplement: step.supplement ?? "", actions: step.actions.map(cloneAction),
    }));
  }

  function activeStep(): StepView | null {
    return currentSteps().find((step) => step.id === selectedStepId) ?? null;
  }

  function change(next: DeckFocusOverrides): void {
    overrides = next;
    input.changed();
    render();
  }

  function writeStep(step: StepView): void {
    const slide = overrides.slides[selectedSlide] ?? { steps: {} };
    change({
      ...overrides,
      slides: {
        ...overrides.slides,
        [selectedSlide]: {
          ...slide,
          steps: {
            ...slide.steps,
            [step.id]: {
              ...(slide.steps[step.id] ?? {}),
              title: step.title.length > 0 ? step.title : null,
              supplement: step.supplement.length > 0 ? step.supplement : null,
              actions: step.actions.map(cloneAction),
            },
          },
        },
      },
    });
    emitPreview(step.id);
  }

  function addStep(): void {
    const steps = currentSteps();
    const id = generatedId("step", new Set(steps.map((step) => step.id)));
    const actionId = generatedId("action", new Set<string>());
    const step: StepView = { id, title: "", supplement: "", actions: [{ id: actionId, kind: "overview", targets: [] }] };
    const slide = overrides.slides[selectedSlide] ?? { steps: {} };
    selectedStepId = id;
    selectedActionId = actionId;
    change({
      ...overrides,
      slides: {
        ...overrides.slides,
        [selectedSlide]: { ...slide, order: [...(slide.order ?? steps.map((item) => item.id)), id], steps: { ...slide.steps, [id]: { actions: step.actions } } },
      },
    });
    emitPreview(id);
  }

  function removeStep(): void {
    const step = activeStep();
    if (step === null) return;
    const slide = overrides.slides[selectedSlide] ?? { steps: {} };
    const sourceStep = input.authored.slides[selectedSlide]?.steps.find((item) => item.id === step.id);
    const steps = { ...slide.steps };
    if (sourceStep) steps[step.id] = { ...(steps[step.id] ?? {}), hidden: true };
    else delete steps[step.id];
    const order = (slide.order ?? currentSteps().map((item) => item.id)).filter((id) => id !== step.id);
    selectedStepId = null;
    selectedActionId = null;
    selectedTargets.clear();
    change({ ...overrides, slides: { ...overrides.slides, [selectedSlide]: { ...slide, order, steps } } });
  }

  function moveStep(delta: number): void {
    const step = activeStep();
    if (step === null) return;
    const current = currentSteps();
    const index = current.findIndex((item) => item.id === step.id);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= current.length) return;
    const order = current.map((item) => item.id);
    const [moved] = order.splice(index, 1);
    order.splice(next, 0, moved);
    const slide = overrides.slides[selectedSlide] ?? { steps: {} };
    change({ ...overrides, slides: { ...overrides.slides, [selectedSlide]: { ...slide, order, steps: { ...slide.steps } } } });
  }

  function emitPreview(stepId: string | null): void {
    const shown = input.frame.contentDocument;
    const view = shown?.defaultView;
    if (shown === null || shown === undefined || view === null || view === undefined) return;
    shown.dispatchEvent(new view.CustomEvent(DECK_FOCUS_PREVIEW_EVENT, { detail: { slideId: selectedSlide, stepId } }));
  }

  function renderTargets(): void {
    targetList.replaceChildren();
    const targets = targetInventory(selectedSlide);
    const labels = targetLabels(selectedSlide);
    if (targets.length === 0) {
      targetList.append(el("p", "deck-design-help", t("decks.focusEditor.noTargets")));
      return;
    }
    for (const target of targets) {
      const key = targetKey(target);
      const label = labels.get(key) ?? targetName(target.kind);
      const item = button(label, () => toggleTarget(target));
      item.classList.add("deck-focus-target");
      item.setAttribute("aria-pressed", String(selectedTargets.has(key)));
      targetList.append(item);
    }
  }

  function renderSteps(): void {
    stepList.replaceChildren();
    const steps = currentSteps();
    for (const [index, step] of steps.entries()) {
      const item = el("li", "deck-focus-step");
      const choose = button(t("decks.focusEditor.stepLabel", { number: index + 1, title: step.title || t("decks.focusEditor.untitledStep") }), () => {
        selectedStepId = step.id;
        selectedActionId = step.actions[0]?.id ?? null;
        selectedTargets.clear();
        for (const target of step.actions[0]?.targets ?? []) selectedTargets.set(targetKey(target), target);
        emitPreview(step.id);
        render();
      });
      choose.classList.add("deck-focus-step-select");
      choose.setAttribute("aria-current", String(step.id === selectedStepId));
      item.append(choose);
      stepList.append(item);
    }
    stepList.append(el("li", "deck-focus-add-row"));
    stepList.lastElementChild?.append(button(t("decks.focusEditor.addStep"), addStep));
  }

  function invalidText(stepId: string, actionId: string): string | null {
    const state = focusState();
    const missing = state.invalidTargets.filter((item) => item.slideId === selectedSlide && item.stepId === stepId && item.actionId === actionId);
    if (missing.length === 0) return null;
    return t("decks.focusEditor.missingTargets", { targets: missing.map((item) => displayTarget(item.target)).join(t("decks.focusEditor.listSeparator")) });
  }

  function renderInspector(): void {
    inspector.replaceChildren();
    const step = activeStep();
    if (step === null) {
      inspector.append(el("h2", "deck-design-heading", t("decks.focusEditor.heading")), el("p", "deck-design-help", t("decks.focusEditor.chooseStep")));
      return;
    }
    inspector.append(el("h2", "deck-design-heading", t("decks.focusEditor.heading")));
    const title = el("input", "deck-design-input");
    title.type = "text"; title.maxLength = 120; title.value = step.title;
    title.addEventListener("change", () => writeStep({ ...step, title: title.value.trim() }));
    inspector.append(inputLabel(t("decks.focusEditor.stepName"), title));
    const supplement = el("textarea", "deck-focus-textarea");
    supplement.maxLength = 1000; supplement.value = step.supplement;
    supplement.setAttribute("aria-label", t("decks.focusEditor.supplementLabel"));
    supplement.addEventListener("change", () => writeStep({ ...step, supplement: supplement.value.trim() }));
    inspector.append(inputLabel(t("decks.focusEditor.supplement"), supplement));

    const actionList = el("div", "deck-focus-action-list");
    for (const [index, action] of step.actions.entries()) {
      const choose = button(t("decks.focusEditor.stepLabel", { number: index + 1, title: actionName(action.kind) }), () => {
        selectedActionId = action.id;
        selectedTargets.clear();
        for (const target of action.targets) selectedTargets.set(targetKey(target), target);
        render();
      });
      choose.setAttribute("aria-current", String(action.id === selectedActionId));
      actionList.append(choose);
    }
    actionList.append(button(t("decks.focusEditor.addAction"), () => {
      const id = generatedId("action", new Set(step.actions.map((action) => action.id)));
      const action: FocusAction = { id, kind: "overview", targets: [] };
      selectedActionId = id;
      selectedTargets.clear();
      writeStep({ ...step, actions: [...step.actions, action] });
    }));
    inspector.append(el("h3", "deck-design-heading", t("decks.focusEditor.actions")), actionList);

    const selectedAction = step.actions.find((action) => action.id === selectedActionId) ?? step.actions[0];
    if (selectedAction === undefined) return;
    selectedActionId = selectedAction.id;
    const kind = el("select", "deck-design-input");
    kind.setAttribute("aria-label", t("decks.focusEditor.heading"));
    for (const choice of focusActionKindSchema.options) {
      const option = el("option", undefined, actionName(choice)); option.value = choice; kind.append(option);
    }
    kind.value = selectedAction.kind;
    kind.addEventListener("change", () => {
      const parsed = focusActionKindSchema.safeParse(kind.value);
      if (!parsed.success) return;
      const next = cloneAction(selectedAction); next.kind = parsed.data;
      if (next.kind === "overview") { next.targets = []; selectedTargets.clear(); }
      if (next.kind === "annotation" && !next.annotation) next.annotation = "説明"; // i18n-keep: 資料に保存される注釈の既定の本文（原稿として入る文）
      if (next.kind === "zoom" && !next.zoom) next.zoom = { scale: 1.5, x: 50, y: 50 };
      writeStep({ ...step, actions: step.actions.map((action) => action.id === next.id ? next : action) });
    });
    inspector.append(inputLabel(t("decks.focusEditor.heading"), kind));

    const actionTargets = el("p", "deck-design-help", selectedAction.targets.length === 0 ? t("decks.focusEditor.noSelectedTargets") : t("decks.focusEditor.selectedTargets", { targets: selectedAction.targets.map(displayTarget).join(t("decks.focusEditor.listSeparator")) }));
    inspector.append(actionTargets);
    const invalid = invalidText(step.id, selectedAction.id);
    if (invalid) inspector.append(el("p", "deck-focus-invalid", invalid));
    if (selectedAction.kind === "annotation") {
      const note = el("textarea", "deck-focus-textarea"); note.maxLength = 500; note.value = selectedAction.annotation ?? "";
      note.setAttribute("aria-label", t("decks.focusEditor.annotation"));
      note.addEventListener("change", () => {
        const next = cloneAction(selectedAction); next.annotation = note.value.trim() || "説明"; // i18n-keep: 資料に保存される注釈の既定の本文（原稿として入る文）
        writeStep({ ...step, actions: step.actions.map((action) => action.id === next.id ? next : action) });
      });
      inspector.append(inputLabel(t("decks.focusEditor.annotation"), note));
    }
    if (selectedAction.kind === "zoom") {
      for (const [label, field, min, max] of [[t("decks.focusEditor.zoomScale"), "scale", 1, 4], [t("decks.focusEditor.zoomX"), "x", 0, 100], [t("decks.focusEditor.zoomY"), "y", 0, 100]] as const) {
        const range = el("input"); range.type = "range"; range.min = String(min); range.max = String(max); range.step = field === "scale" ? "0.1" : "1";
        range.value = String(selectedAction.zoom?.[field] ?? (field === "scale" ? 1.5 : 50));
        range.addEventListener("input", () => {
          const next = cloneAction(selectedAction);
          next.zoom = { ...(next.zoom ?? { scale: 1.5, x: 50, y: 50 }), [field]: range.valueAsNumber };
          writeStep({ ...step, actions: step.actions.map((action) => action.id === next.id ? next : action) });
        });
        inspector.append(inputLabel(label, range));
      }
    }
    const actionTools = el("div", "deck-focus-actions");
    const removeAction = button(t("decks.focusEditor.removeAction"), () => {
      if (step.actions.length <= 1) return;
      const index = step.actions.findIndex((action) => action.id === selectedAction.id);
      const actions = step.actions.filter((action) => action.id !== selectedAction.id);
      const next = actions[Math.min(index, actions.length - 1)] ?? actions[0];
      selectedActionId = next?.id ?? null;
      selectedTargets.clear();
      for (const target of next?.targets ?? []) selectedTargets.set(targetKey(target), target);
      writeStep({ ...step, actions });
    });
    removeAction.disabled = step.actions.length <= 1;
    actionTools.append(removeAction);
    inspector.append(actionTools);
    const order = el("div", "deck-focus-actions");
    order.append(button(t("decks.focusEditor.stepEarlier"), () => moveStep(-1)), button(t("decks.focusEditor.stepLater"), () => moveStep(1)), button(t("decks.focusEditor.overview"), () => emitPreview(null)), button(t("decks.focusEditor.removeStep"), removeStep));
    inspector.append(order);
  }

  function toggleTarget(target: FocusTargetRef): void {
    const step = activeStep();
    if (step === null) return;
    const action = step.actions.find((item) => item.id === selectedActionId) ?? step.actions[0];
    if (action === undefined || action.kind === "overview") return;
    const key = targetKey(target);
    if (selectedTargets.has(key)) selectedTargets.delete(key);
    else selectedTargets.set(key, target);
    const next = cloneAction(action);
    next.targets = [...selectedTargets.values()];
    if (sameTargets(action.targets, next.targets)) return;
    writeStep({ ...step, actions: step.actions.map((item) => item.id === next.id ? next : item) });
  }

  function select(id: string): void {
    if (!input.ids.includes(id)) return;
    selectedSlide = id;
    selectedStepId = null;
    selectedActionId = null;
    selectedTargets.clear();
    slidePicker.value = id;
    input.frame.contentDocument?.querySelector(`[data-deck-id="${id}"]`)?.scrollIntoView({ block: "center" });
    emitPreview(null);
    render();
  }

  function selectTarget(element: Element): boolean {
    const slide = element.closest("[data-deck-id]");
    const slideId = slide?.getAttribute("data-deck-id");
    if (slideId === null || slideId === undefined || !input.ids.includes(slideId)) return false;
    const candidates: { target: FocusTargetRef; distance: number; specificity: number }[] = [];
    for (const [kind, mark] of Object.entries(DECK_TARGET_MARKS)) {
      const holder = element.closest(`[${mark}]`);
      const value = holder === null ? null : holder.getAttribute(mark);
      const parsed = focusTargetKindSchema.safeParse(kind);
      if (holder !== null && value !== null && parsed.success) {
        let distance = 0;
        for (let current: Element | null = element; current !== null && current !== holder; current = current.parentElement) distance += 1;
        candidates.push({ target: { slideId, kind: parsed.data, id: value }, distance, specificity: targetSpecificity.get(parsed.data) ?? 99 });
      }
    }
    const chosen = candidates.sort((left, right) => left.distance - right.distance || left.specificity - right.specificity)[0];
    if (chosen === undefined) return false;
    if (slideId !== selectedSlide) { select(slideId); return false; }
    const step = activeStep();
    const action = step?.actions.find((item) => item.id === selectedActionId) ?? step?.actions[0];
    if (action === undefined || action.kind === "overview") return false;
    toggleTarget(chosen.target);
    return true;
  }

  function render(): void {
    slidePicker.value = selectedSlide;
    renderTargets();
    renderSteps();
    renderInspector();
  }

  render();
  return {
    root,
    dirty: () => JSON.stringify(overrides) !== initial,
    value: () => overrides,
    restore(value) { overrides = value; selectedTargets.clear(); render(); },
    select,
    selectTarget,
    refresh: render,
  };
}


