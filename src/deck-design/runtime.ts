import { keepMermaidSource } from "../lib/pages/markdown";
import type { DeckRenderChange } from "../lib/deck/render-contract";
import { installDeckPlayback } from "../lib/deck/playback";
import { beginDeckLoading, waitForDeckCharts, waitForDeckImages, waitForDeckLayout, whenDeckParsed } from "./loading";
import { deckTypography, prepareDeckFonts } from "../lib/deck/design/typography";
import { effectiveAppearance } from "../lib/deck/design/design";
import { readDeckDesign, paintDeckDesign } from "../lib/deck/design/dom";
import { readDeckCustomization } from "../lib/deck/edit/customization-dom";
import {
  DECK_CUSTOMIZATION_CHANGE_EVENT,
  DECK_FOCUS_APPLY_EVENT,
  DECK_FOCUS_PREVIEW_EVENT,
  DECK_FOCUS_READY_EVENT,
  DECK_FOCUS_REQUEST_EVENT,
} from "../lib/deck/design/focus";
import { effectiveLogo, deckLogoLayout } from "../lib/deck/media/logo";
import { renderDeckCharts, resizeDeckCharts, releaseDeckCharts } from "./charts";
import { prepareDeckDiagramSources, renderDeckDiagrams, refreshDeckDiagramTypography, releaseDeckDiagrams } from "./diagrams";
import { listenForDeckFocus } from "./focus-renderer";
import { paintDeckLogos } from "./logo-renderer";

function paintCustomization(customization = readDeckCustomization(document)): void {
  if (customization === null || customization.logo === null) return;
  const logo = customization.logo;
  const slides = [...document.querySelectorAll<HTMLElement>("section[data-deck-slide]")];
  const byId = new Map(slides.map(slide => [slide.getAttribute("data-deck-id"), slide]));
  const values = new Map(customization.slideIds.map((slideId) => [
    slideId,
    effectiveLogo(logo.authored, logo.overrides, slideId, deckLogoLayout(byId.get(slideId))),
  ]));
  paintDeckLogos(slides, values);
}

function announceFocus(customization = readDeckCustomization(document)): void {
  const focus = customization?.focus?.effective;
  if (focus === undefined) return;
  const slides = Object.fromEntries([...focus.slides.entries()]);
  document.dispatchEvent(new CustomEvent(DECK_FOCUS_READY_EVENT, {
    detail: {
      guided: focus.guided,
      slides,
      invalidTargets: focus.invalidTargets,
      orphanedOverrideSteps: focus.orphanedOverrideSteps,
    },
  }));
}

let previewSelection: { slideId: string; stepId: string } | null = null;

function showFocusPreview(slideId: string, stepId: string | null): void {
  const source = readDeckCustomization(document)?.focus?.effective;
  const steps = source?.slides.get(slideId) ?? [];
  const at = stepId === null ? -1 : steps.findIndex((step) => step.id === stepId);
  const step = at < 0 ? null : steps[at];
  previewSelection = step === null ? null : { slideId, stepId: step.id };
  document.dispatchEvent(new CustomEvent(DECK_FOCUS_APPLY_EVENT, { detail: {
    slideId,
    stepId: step?.id ?? null,
    actions: step?.actions ?? [],
    supplement: step?.supplement ?? null,
    progress: { index: step === null ? 0 : at + 1, total: steps.length },
  } }));
}

function previewFromEvent(event: Event): void {
  if (!(event instanceof CustomEvent) || typeof event.detail !== "object" || event.detail === null) return;
  const detail: Record<string, unknown> = { ...event.detail };
  if (typeof detail["slideId"] !== "string") return;
  const stepId = detail["stepId"];
  if (stepId !== null && typeof stepId !== "string") return;
  showFocusPreview(detail["slideId"], stepId);
}

async function start(): Promise<void> {
  const source = readDeckDesign(document);
  if (!source) { document.deckLoading?.finish(); return; }
  document.querySelector('main[data-deck-slides]')?.setAttribute("aria-busy", "true");
  const chartsReady = waitForDeckCharts();
  listenForDeckFocus(document);
  paintDeckDesign(document, source.design, source.overrides);
  paintCustomization();
  document.addEventListener(DECK_FOCUS_REQUEST_EVENT, () => announceFocus());
  announceFocus();
  try { await prepareDeckFonts(document,[effectiveAppearance(source.design,source.overrides).typography, ...source.ids.map(id=>effectiveAppearance(source.design,source.overrides,id).typography)], 2000); }
  catch {
    document.body.setAttribute("data-deck-font-error", "書体を読み込めませんでした");
    // Keep this reading session on one font if the complete family did not arrive.
    // A deliberate style change in the editor can still install the selected font.
    const fallback = deckTypography("system");
    for (const slide of document.querySelectorAll<HTMLElement>('section[data-deck-slide]')) {
      slide.style.setProperty("--dd-font-body", fallback.body);
      slide.style.setProperty("--dd-font-heading", fallback.heading);
    }
  }
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const visible = new Set<Element>();
  let slides = [...document.querySelectorAll<HTMLElement>("section[data-deck-slide]")];
  const animate = () => {
    for (const slide of slides) {
      const presenting = document.documentElement.getAttribute("data-deck-mode") === "present";
      const current = !presenting || slide.closest("[data-deck-current]") !== null;
      const run = !media.matches && !document.hidden && !document.deckEditorOpen && visible.has(slide) && current;
      slide.style.setProperty("--dd-play", run ? "running" : "paused");
    }
  };
  await waitForDeckLayout();
  installDeckPlayback(document);
  const linked = /^#([1-9]\d*)$/.exec(location.hash);
  const first = slides[Math.min(slides.length - 1, Math.max(0, Number(linked?.[1] ?? 1) - 1))];
  const waitForReader = async () => {
    while (document.deckEditorOpen) await new Promise<void>(resolve => setTimeout(resolve, 50));
  };
  const draw = async (slide: HTMLElement) => {
    if (slide.querySelector("[data-dd-chart]")) {
      if (await chartsReady) renderDeckCharts(slide);
      else for (const figure of slide.querySelectorAll("[data-dd-chart]")) figure.setAttribute("data-dd-chart-error", "");
    }
    try { await renderDeckDiagrams(slide); }
    catch { slide.setAttribute("data-dd-diagram-error", ""); }
  };
  // A paper counts as drawn once its charts and diagrams are. The requested paper
  // gates reading and the editor gates on the paper it shows (whenDrawn); the rest
  // follow in the background, and a paper someone waits for moves to the front.
  // Drawing and updates share one queue, so a paper is never drawn twice at once.
  const drawn = new WeakSet<HTMLElement>();
  const waiting = new Map<HTMLElement, (() => void)[]>();
  const backlog: HTMLElement[] = [];
  let pumping = false, pendingUpdate = Promise.resolve();
  // The editor's preview draws only what is waited for until the editor has shown
  // itself (drawRemaining), so the other papers do not compete with opening it.
  let held = window.frameElement?.hasAttribute("data-deck-editor-preview") === true;
  const settle = (slide: HTMLElement) => {
    drawn.add(slide);
    for (const resolve of waiting.get(slide) ?? []) resolve();
    waiting.delete(slide);
  };
  const exclusive = (task: () => Promise<void>) => { const next = pendingUpdate.catch(() => {}).then(task); pendingUpdate = next; return next; };
  async function pump(): Promise<void> {
    if (pumping) return;
    pumping = true;
    let sliceStart = performance.now();
    while (backlog.length) {
      // The editor renders its own preview. Reader work behind that surface must
      // not compete with input or delay the opening feedback.
      await waitForReader();
      const at = held ? backlog.findIndex(slide => waiting.has(slide)) : 0;
      if (at < 0) break;
      const [slide] = backlog.splice(at, 1);
      if (!slide || drawn.has(slide)) continue;
      // A paper removed by an edit is not drawn. Its waiters look it up again.
      if (!slide.isConnected) { settle(slide); continue; }
      await exclusive(async () => { if (!drawn.has(slide)) { await draw(slide); settle(slide); } });
      if (performance.now() - sliceStart >= 8) {
        await new Promise<void>(resolve => setTimeout(resolve, 0)); sliceStart = performance.now();
      }
    }
    pumping = false;
    if (!backlog.length) document.body.setAttribute("data-deck-design-ready", "");
  }
  // Only this document's papers are drawn here. Anything else has nothing left to draw.
  const ownPaper = (slide: Element): slide is HTMLElement => slide instanceof HTMLElement && slide.isConnected && slide.ownerDocument === document && slide.matches("section[data-deck-slide]");
  const prioritize = (slide: HTMLElement) => {
    if (drawn.has(slide)) return;
    const at = backlog.indexOf(slide);
    if (at > 0) backlog.splice(at, 1);
    if (at !== 0) backlog.unshift(slide);
    void pump();
  };
  // Only the requested paper gates reading. Other papers keep their reserved space.
  // The editor's preview does not wait for that paper's images: their boxes are fixed,
  // and the editor keeps showing its own progress until it attaches.
  if (first) { await Promise.all([waitForReader().then(() => draw(first)), held ? undefined : waitForDeckImages(first)]); settle(first); }
  document.deckLoading?.finish();
  backlog.push(...slides.filter(slide => slide !== first));
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target); else visible.delete(entry.target);
      if (entry.isIntersecting && entry.target instanceof HTMLElement) prioritize(entry.target);
    }
    animate();
  });
  slides.forEach((slide) => observer.observe(slide));
  document.addEventListener("visibilitychange", animate);
  media.addEventListener("change", animate);
  new MutationObserver(animate).observe(document.documentElement, { attributes: true, attributeFilter: ["data-deck-mode"] });
  // Moving between slides does not change the presentation mode attribute.
  new MutationObserver(() => {
    const shown = document.querySelector<HTMLElement>("[data-deck-current] section[data-deck-slide]");
    if (shown) prioritize(shown);
    animate();
  }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ["data-deck-current"] });
  document.addEventListener(DECK_FOCUS_PREVIEW_EVENT, previewFromEvent);
  let updateGeneration = 0;
  const pendingSlides = new Set<string>();
  let pendingStructure = false, pendingAppearance = false, pendingCustomization = false;
  async function update(change: DeckRenderChange, ticket: number): Promise<void> {
    const stale = () => ticket !== updateGeneration || change.signal?.aborted;
    if (stale()) return;
    change = {...change, slides:[...pendingSlides], structure:pendingStructure, appearance:pendingAppearance, customization:pendingCustomization};
    const ids = new Set(change.slides);
    if (change.structure) {
      const next = [...document.querySelectorAll<HTMLElement>("section[data-deck-slide]")];
      for (const slide of slides) if (!next.includes(slide)) { observer.unobserve(slide); visible.delete(slide); }
      for (const slide of next) if (!slides.includes(slide)) observer.observe(slide);
      slides = next;
      // Papers added without being named in this change are still drawn, in the background.
      for (const slide of next) if (!drawn.has(slide) && !ids.has(slide.getAttribute("data-deck-id") ?? "") && !backlog.includes(slide)) backlog.push(slide);
      void pump();
    }
    const current = readDeckDesign(document);
    const targets = slides.filter(slide => ids.has(slide.getAttribute("data-deck-id") ?? ""));
    let sliceStart = performance.now();
    for (const [index, slide] of targets.entries()) {
      if (stale()) return;
      if (current !== null && (change.appearance || change.structure)) paintDeckDesign(document, current.design, current.overrides, undefined, [slide]);
      // A paper still waiting in the background is drawn in full here. Charts use the
      // library as it is now; only if it has not arrived is the background's wait used.
      const fresh = !drawn.has(slide);
      if (change.structure) prepareDeckDiagramSources(slide);
      if (fresh && slide.querySelector("[data-dd-chart]") && !Reflect.get(window, "echarts") && !(await chartsReady) && !Reflect.get(window, "echarts")) {
        for (const figure of slide.querySelectorAll("[data-dd-chart]")) figure.setAttribute("data-dd-chart-error", "");
      }
      renderDeckCharts(slide);
      if (change.structure) await renderDeckDiagrams(slide);
      else if (fresh) { try { await renderDeckDiagrams(slide); } catch { slide.setAttribute("data-dd-diagram-error", ""); } }
      if (change.appearance) await refreshDeckDiagramTypography(slide);
      if (fresh) settle(slide);
      change.progress?.(index + 1, targets.length);
      if (performance.now() - sliceStart >= 8) {
        await new Promise<void>(resolve => setTimeout(resolve, 0)); sliceStart = performance.now();
      }
    }
    if (stale()) return;
    if (change.customization || change.structure) {
      const customization = readDeckCustomization(document);
      paintCustomization(customization); announceFocus(customization);
      if (previewSelection !== null) showFocusPreview(previewSelection.slideId, previewSelection.stepId);
    }
    animate();
    pendingSlides.clear(); pendingStructure = false; pendingAppearance = false; pendingCustomization = false;
  }
  document.deckRenderer = {
    suspend() { animate(); },
    update(change) {
      const ticket = ++updateGeneration;
      change.slides.forEach(id=>pendingSlides.add(id));
      pendingStructure ||= change.structure; pendingAppearance ||= change.appearance; pendingCustomization ||= change.customization;
      // Unfinished targets stay dirty: cancelling one generation must not
      // leave its unpainted slides incorrectly marked as current.
      return exclusive(()=>update(change,ticket));
    },
    isDrawn: slide => !ownPaper(slide) || drawn.has(slide),
    whenDrawn(slide) {
      if (!ownPaper(slide) || drawn.has(slide)) return Promise.resolve();
      const done = new Promise<void>(resolve => { waiting.set(slide, [...(waiting.get(slide) ?? []), resolve]); });
      prioritize(slide);
      return done;
    },
    drawRemaining() { held = false; void pump(); },
    release(roots) { for (const root of roots) { releaseDeckCharts(root); releaseDeckDiagrams(root); } },
  };
  document.addEventListener(DECK_CUSTOMIZATION_CHANGE_EVENT, () => {
    void document.deckRenderer?.update({slides:slides.map(slide=>slide.getAttribute("data-deck-id")??""),structure:false,appearance:true,customization:true});
  });
  window.addEventListener("resize", () => resizeDeckCharts(document));
  // The renderer accepts updates and requests now; the remaining papers follow.
  document.body.setAttribute("data-deck-design-live", "");
  void pump();
}
function prepareAndStart(): void {
  keepMermaidSource(document);
  prepareDeckDiagramSources(document);
  void start().catch(() => { document.deckLoading?.finish(); });
}

document.deckReaderCanPause = true;
beginDeckLoading();
whenDeckParsed(prepareAndStart);
