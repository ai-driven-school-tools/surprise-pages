import { DECK_FOCUS_APPLY_EVENT, DECK_TARGET_MARKS, focusActionSchema, type FocusAction, type FocusTargetRef } from "../lib/deck/design/focus";
import { focusDeckChartTargets } from "./charts";

type EventDetail = { slideId: string; stepId: string | null; actions: FocusAction[] };
type DetailObject = { [key: string]: unknown };

function objectOf(value: unknown): value is DetailObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function detailOf(value: unknown): EventDetail | null {
  if (!objectOf(value) || typeof value.slideId !== "string" || (value.stepId !== null && typeof value.stepId !== "string") || !Array.isArray(value.actions)) return null;
  const actions: FocusAction[] = [];
  for (const candidate of value.actions) {
    const parsed = focusActionSchema.safeParse(candidate);
    if (!parsed.success) return null;
    actions.push(parsed.data);
  }
  return { slideId: value.slideId, stepId: value.stepId, actions };
}

function selectorFor(target: FocusTargetRef): string {
  return `[${DECK_TARGET_MARKS[target.kind]}="${CSS.escape(target.id)}"]`;
}

export function resolveDeckFocusTargets(slide: HTMLElement, target: FocusTargetRef): HTMLElement[] {
  if (slide.getAttribute("data-deck-id") !== target.slideId) return [];
  return [...slide.querySelectorAll<HTMLElement>(selectorFor(target))];
}

function allTargets(slide: HTMLElement): HTMLElement[] {
  return [...slide.querySelectorAll<HTMLElement>(Object.values(DECK_TARGET_MARKS).map((mark) => `[${mark}]`).join(","))];
}

function clear(slide: HTMLElement, resetCharts = true): void {
  slide.removeAttribute("data-dd-focus-mode");
  slide.removeAttribute("data-dd-focus-step");
  slide.style.removeProperty("--dd-focus-zoom-scale");
  for (const target of allTargets(slide)) {
    target.removeAttribute("data-dd-focus-state");
    target.removeAttribute("data-dd-focus-zoom");
    for (const property of ["--dd-focus-zoom-scale", "--dd-focus-zoom-x", "--dd-focus-zoom-y"]) target.style.removeProperty(property);
  }
  for (const mirror of slide.querySelectorAll<HTMLElement>("[data-dd-focus-mirror]")) {
    mirror.removeAttribute("data-dd-focus-state");
    mirror.removeAttribute("data-dd-focus-mirror");
  }
  if (resetCharts) for (const figure of slide.querySelectorAll<HTMLElement>("[data-dd-chart]")) focusDeckChartTargets(figure, []);
}

type FocusState = "dim" | "hidden" | "revealed" | "active";

function mirrorsFor(slide: HTMLElement, reference: FocusTargetRef): HTMLElement[] {
  const mark = reference.kind === "column" ? "data-dd-column-ref" : reference.kind === "range" ? "data-dd-range-ref" : reference.kind === "region" ? "data-dd-region-ref" : null;
  return mark ? [...slide.querySelectorAll<HTMLElement>(`[${mark}="${CSS.escape(reference.id)}"]`)] : [];
}

/** A step is a single state, not a sequence of paint commands. Later actions cannot dim earlier targets. */
export function applyDeckFocus(detail: EventDetail, root: ParentNode = document): boolean {
  const slide = root.querySelector<HTMLElement>(`section[data-deck-id="${CSS.escape(detail.slideId)}"]`);
  if (!slide) return false;
  const actions = detail.actions.filter((action) => action.kind !== "overview");
  if (detail.stepId === null || actions.length === 0) { clear(slide); return true; }
  clear(slide, false);
  slide.setAttribute("data-dd-focus-mode", "true");
  slide.setAttribute("data-dd-focus-step", detail.stepId);
  const kinds = new Set(actions.flatMap((action) => action.targets.map((target) => target.kind)));
  const revealedKinds = new Set(actions.filter((action) => action.kind === "reveal").flatMap((action) => action.targets.map((target) => target.kind)));
  const states = new Map<HTMLElement, FocusState>();
  for (const kind of kinds) {
    const base = revealedKinds.has(kind) ? "hidden" : "dim";
    for (const target of slide.querySelectorAll<HTMLElement>(`[${DECK_TARGET_MARKS[kind]}]`)) {
      if (states.get(target) !== "hidden") states.set(target, base);
      const id = target.getAttribute(DECK_TARGET_MARKS[kind]);
      if (!id) continue;
      for (const mirror of mirrorsFor(slide, { slideId: detail.slideId, kind, id })) {
        mirror.setAttribute("data-dd-focus-mirror", "");
        if (states.get(mirror) !== "hidden") states.set(mirror, base);
      }
    }
  }
  for (const action of actions) {
    for (const reference of action.targets) {
      const targets = resolveDeckFocusTargets(slide, reference);
      const mirrors = mirrorsFor(slide, reference);
      for (const mirror of mirrors) mirror.setAttribute("data-dd-focus-mirror", "");
      for (const target of [...targets, ...mirrors]) {
        if (states.get(target) !== "active") states.set(target, action.kind === "reveal" ? "revealed" : "active");
      }
      if (action.kind === "zoom" && action.zoom) for (const target of targets) {
        target.setAttribute("data-dd-focus-zoom", "");
        target.style.setProperty("--dd-focus-zoom-scale", String(action.zoom.scale));
        target.style.setProperty("--dd-focus-zoom-x", `${action.zoom.x}%`);
        target.style.setProperty("--dd-focus-zoom-y", `${action.zoom.y}%`);
      }
    }
  }
  // An active descendant cannot escape a dimmed/hidden ancestor. Keep its path visible,
  // without turning that ancestor into another emphasized target.
  for (const [target, state] of states) {
    if (state !== "active" && state !== "revealed") continue;
    for (let parent = target.parentElement; parent && parent !== slide; parent = parent.parentElement) {
      if (states.get(parent) === "dim" || states.get(parent) === "hidden") states.set(parent, "revealed");
    }
  }
  for (const [target, state] of states) target.setAttribute("data-dd-focus-state", state);
  const chartActions = actions.flatMap((action) => [...new Set(action.targets.map((target) => target.kind))].map((kind) => ({
    kind, ids: action.targets.filter((target) => target.kind === kind && target.slideId === detail.slideId).map((target) => target.id), action: action.kind,
  })));
  for (const figure of slide.querySelectorAll<HTMLElement>("[data-dd-chart]")) focusDeckChartTargets(figure, chartActions);
  return true;
}

export function listenForDeckFocus(root: Document = document): void {
  const latest = new Map<string, EventDetail>();
  let printing = false;
  root.addEventListener(DECK_FOCUS_APPLY_EVENT, (event) => {
    if (!(event instanceof CustomEvent)) return;
    const detail = detailOf(event.detail);
    if (detail) {
      latest.set(detail.slideId, detail);
      if (!printing) applyDeckFocus(detail, root);
    }
  });
  root.defaultView?.addEventListener("beforeprint", () => {
    printing = true;
    // CSS can clear DOM emphasis, but ECharts keeps blur/highlight in its scene.
    // Reset that scene too so paper always contains the complete reading view.
    for (const slideId of latest.keys()) applyDeckFocus({ slideId, stepId: null, actions: [] }, root);
  });
  root.defaultView?.addEventListener("afterprint", () => {
    printing = false;
    for (const detail of latest.values()) applyDeckFocus(detail, root);
  });
}
