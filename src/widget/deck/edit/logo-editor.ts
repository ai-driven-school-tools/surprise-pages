import {effectiveAppearance} from "../../../lib/deck/design/design";
import {readDeckDesign} from "../../../lib/deck/design/dom";
import {
  DECK_LOGO_PORTABLE_KIND,
  DECK_LOGO_VERSION,
  effectiveLogo,
  deckLogoLayout,
  canPlaceDeckLogo,
  exportPortableLogo,
  importPortableLogo,
  logoAssetSchema,
  logoPlacementSchema,
  type DeckLogo,
  type DeckLogoOverrides,
  type LogoAsset,
  type PortableLogo,
} from "../../../lib/deck/media/logo";
import type { MessageKey } from "../../../lib/i18n/messages/types";
import { el } from "../../shared/util";
import { t } from "../../shared/i18n";
import { DECK_LOGO_EDITOR_STYLES } from "./logo-editor-styles";

/** 見た目の字は ./deck-logo-editor-styles.ts が正本（道具箱が最初から読むので分けてある）。今までの読み手のために同じ名前で渡す。 */
export { DECK_LOGO_EDITOR_STYLES };

type LogoPresentationPatch = DeckLogoOverrides["document"];

export type DeckLogoEditor = {
  root: HTMLElement;
  dirty: () => boolean;
  busy: () => boolean;
  value: () => DeckLogoOverrides;
  restore: (value: DeckLogoOverrides) => void;
  select: (slideId: string) => void;
  refresh: () => void;
};

type Input = {
  authored: DeckLogo;
  overrides: DeckLogoOverrides;
  ids: readonly string[];
  pageSlug: string;
  master: Document;
  frame: HTMLIFrameElement;
  changed: () => void;
  fail: (message: string) => void;
  clearFail: () => void;
};

const placements: readonly { value: NonNullable<LogoPresentationPatch["placement"]>; label: MessageKey }[] = [
  { value: "top-center", label: "decks.logoEditor.placement.topCenter" },
  { value: "top-left", label: "decks.logoEditor.placement.topLeft" }, { value: "top-right", label: "decks.logoEditor.placement.topRight" },
  { value: "bottom-left", label: "decks.logoEditor.placement.bottomLeft" }, { value: "bottom-right", label: "decks.logoEditor.placement.bottomRight" },
  { value: "cover", label: "decks.logoEditor.placement.cover" }, { value: "watermark", label: "decks.logoEditor.placement.watermark" }, { value: "hidden", label: "decks.logoEditor.placement.hidden" },
];

function button(text: string, click: () => void): HTMLButtonElement {
  const result = el("button", "edit-button", text);
  result.type = "button";
  result.addEventListener("click", click);
  return result;
}

function label(text: string, control: HTMLElement): HTMLLabelElement {
  const result = el("label", "deck-focus-field");
  result.append(el("span", undefined, text), control);
  return result;
}

function assetName(asset: LogoAsset | null): string {
  if (asset === null) return t("decks.logoEditor.noLogo");
  return t("decks.logoEditor.hasLogo");
}

function allowedImage(file: File): boolean {
  return ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml", "image/avif"].includes(file.type);
}

const LOGO_MAX_BYTES = 10 * 1024 * 1024;

function extensionFor(contentType: LogoAsset["contentType"]): string {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/svg+xml") return "svg";
  return contentType.slice("image/".length);
}

function readAsDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(typeof reader.result === "string" ? reader.result : null));
    reader.addEventListener("error", () => resolve(null));
    reader.readAsDataURL(blob);
  });
}

async function portableFile(portable: PortableLogo): Promise<File | null> {
  try {
    const response = await fetch(portable.dataUrl);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > LOGO_MAX_BYTES) return null;
    return new File([bytes], `logo.${extensionFor(portable.contentType)}`, { type: portable.contentType });
  } catch {
    return null;
  }
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? { ...value } : null;
}

/** Upload only reaches the server route. A browser never receives direct storage credentials. */
async function upload(pageSlug: string, file: File): Promise<LogoAsset | null> {
  const response = await fetch(`/api/pages/logo?page=${encodeURIComponent(pageSlug)}&name=${encodeURIComponent(file.name)}`, {
    method: "POST", credentials: "same-origin", body: file,
  });
  let payload: unknown = null;
  try { payload = await response.json(); } catch { /* The caller shows a plain, useful error. */ }
  const result = recordOf(payload);
  if (!response.ok || result === null) return null;
  const record = recordOf(result["asset"]);
  if (record === null) return null;
  const parsed = logoAssetSchema.safeParse(record);
  return parsed.success ? parsed.data : null;
}

export function createDeckLogoEditor(input: Input): DeckLogoEditor {
  const initial = JSON.stringify(input.overrides);
  const supportsLayouts = Boolean(input.master.querySelector("script[data-deck-logo-layouts]"));
  let overrides = input.overrides;
  let selected = input.ids[0] ?? "";
  let scope: "document" | "slide" = "document";
  let working: "upload" | "import" | "export" | null = null;
  const root = el("section", "deck-logo-workspace");
  root.setAttribute("aria-label", t("decks.logoEditor.adjust"));

  const slideOf = (id: string) => [...input.master.querySelectorAll("[data-deck-id]")].find(slide => slide.getAttribute("data-deck-id") === id);
  const current = () => effectiveLogo(input.authored, overrides, scope === "document" ? "" : selected, scope === "slide" ? deckLogoLayout(slideOf(selected)) : undefined);
  const asset = () => overrides.asset === undefined ? input.authored.asset : overrides.asset;
  const present = () => current()?.presentation ?? {...input.authored.document,...overrides.document};
  function change(value: DeckLogoOverrides): void {
    overrides = value;
    input.changed();
    render();
  }
  function apply(patch: LogoPresentationPatch): void {
    if (scope === "document") {
      const layouts = structuredClone(overrides.layouts ?? input.authored.layouts);
      for (const role of ["cover", "closing"] as const) if (layouts?.[role]) layouts[role] = {...layouts[role], ...patch};
      change({ ...overrides, layouts, document: { ...overrides.document, ...patch } });
    }
    else change({ ...overrides, slides: { ...overrides.slides, [selected]: { ...overrides.slides[selected], ...patch } } });
  }
  function reset(): void {
    if (scope === "document") change({ ...overrides, document: {}, layouts: input.authored.layouts });
    else {
      const slides = { ...overrides.slides };
      if (input.authored.slides[selected] || deckLogoLayout(slideOf(selected)) && (overrides.layouts ?? input.authored.layouts)) slides[selected] = { followDocument: true };
      else delete slides[selected];
      change({ ...overrides, slides });
    }
  }
  async function choose(file: File): Promise<void> {
    input.clearFail();
    if (!allowedImage(file)) { input.fail(t("decks.logoEditor.invalidImage")); return; }
    if (file.size > LOGO_MAX_BYTES) { input.fail(t("decks.logoEditor.tooLarge")); return; }
    working = "upload"; input.changed(); render();
    const uploaded = await upload(input.pageSlug, file);
    working = null;
    if (uploaded === null) { input.changed(); input.fail(t("decks.logoEditor.uploadFailed")); render(); return; }
    change({ ...overrides, asset: uploaded });
  }
  async function writePortable(): Promise<void> {
    input.clearFail();
    const selectedAsset = asset();
    if (selectedAsset === null) { input.fail(t("decks.logoEditor.nothingToExport")); return; }
    working = "export"; render();
    try {
      const base = input.frame.contentDocument?.baseURI ?? document.baseURI;
      const response = await fetch(new URL(selectedAsset.path, base), { credentials: "same-origin" });
      const bytes = await response.arrayBuffer();
      if (!response.ok || bytes.byteLength === 0 || bytes.byteLength > LOGO_MAX_BYTES) throw new Error();
      const dataUrl = await readAsDataUrl(new Blob([bytes], { type: selectedAsset.contentType }));
      if (dataUrl === null) throw new Error();
      const text = exportPortableLogo({
        kind: DECK_LOGO_PORTABLE_KIND,
        version: DECK_LOGO_VERSION,
        contentType: selectedAsset.contentType,
        dataUrl,
        mark: selectedAsset.mark,
        layouts: scope === "document" ? (overrides.layouts ?? input.authored.layouts) : undefined,
        document: scope === "slide"
          ? present()
          : { ...input.authored.document, ...overrides.document },
        // Slide ids belong to one document. The chosen effective presentation is
        // carried as a reusable patch and the importer applies it to its current scope.
        slides: {},
      });
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const link = el("a"); link.href = url; link.download = "deck-logo.json"; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      input.fail(t("decks.logoEditor.exportFailed"));
    } finally {
      working = null; render();
    }
  }
  async function readPortable(file: File): Promise<void> {
    input.clearFail();
    working = "import"; input.changed(); render();
    try {
      const portable = importPortableLogo(await file.text());
      if (!supportsLayouts && (portable.mark || portable.layouts || portable.document.variant || portable.document.placement === "top-center")) {
        working = null; input.changed(); input.fail(t("decks.logoEditor.needsRenderer")); render(); return;
      }
      const selectedFile = await portableFile(portable);
      if (selectedFile === null) throw new Error();
      const uploaded = await upload(input.pageSlug, selectedFile);
      if (uploaded === null) throw new Error();
      working = null;
      change(scope === "document"
        ? { ...overrides, version: DECK_LOGO_VERSION, asset: {...uploaded,mark:portable.mark}, layouts: portable.layouts, document: { ...overrides.document, ...portable.document } }
        : {
          ...overrides,
          version: DECK_LOGO_VERSION,
          asset: {...uploaded,mark:portable.mark},
          slides: { ...overrides.slides, [selected]: { ...overrides.slides[selected], ...portable.document } },
        });
    } catch {
      working = null;
      input.changed();
      input.fail(t("decks.logoEditor.importFailed"));
      render();
    }
  }
  function select(id: string): void {
    if (!input.ids.includes(id)) return;
    selected = id;
    render();
  }
  function slider(text: string, value: number, min: number, max: number, step: number, patch: keyof LogoPresentationPatch): HTMLLabelElement {
    const control = el("input"); control.type = "range"; control.min = String(min); control.max = String(max); control.step = String(step); control.value = String(value);
    const output = el("output", "deck-design-help", String(value));
    control.addEventListener("input", () => { output.textContent = control.value; apply({ [patch]: control.valueAsNumber }); });
    const row = label(text, control); row.append(output); return row;
  }
  function render(): void {
    root.replaceChildren();
    root.append(el("h2", "deck-design-heading", t("decks.logoEditor.heading")));
    root.append(el("p", "deck-design-help", t("decks.logoEditor.help")));
    const fileLine = el("div", "deck-logo-file");
    fileLine.append(el("span", "deck-design-help", assetName(asset())));
    const file = el("input"); file.type = "file"; file.accept = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif"; file.hidden = true; file.disabled = working !== null;
    file.addEventListener("change", () => { const picked = file.files?.[0]; if (picked) void choose(picked); });
    const chooseButton = button(working === "upload" ? t("decks.logoEditor.sending") : t("decks.logoEditor.choose"), () => file.click());
    chooseButton.disabled = working !== null;
    fileLine.append(chooseButton, file);
    if (asset() !== null) fileLine.append(button(t("decks.logoEditor.remove"), () => change({ ...overrides, asset: null })));
    root.append(fileLine);

    const scopeSelect = el("select", "deck-design-input");
    for (const [value, name] of [["document", t("decks.logoEditor.wholeDocument")], ["slide", t("decks.logoEditor.thisSlide")]] as const) {
      if(value === "slide" && !input.ids.length)continue;
      const option = el("option", undefined, name); option.value = value; scopeSelect.append(option);
    }
    scopeSelect.value = scope;
    scopeSelect.addEventListener("change", () => { scope = scopeSelect.value === "slide" ? "slide" : "document"; render(); });
    root.append(label(t("decks.logoEditor.scope"), scopeSelect));
    if (scope === "slide") {
      const slideSelect = el("select", "deck-design-input");
      for (const [index, id] of input.ids.entries()) { const option = el("option", undefined, t("decks.logoEditor.slideOption", { number: index + 1 })); option.value = id; slideSelect.append(option); }
      slideSelect.value = selected;
      slideSelect.addEventListener("change", () => select(slideSelect.value));
      root.append(label(t("decks.logoEditor.slide"), slideSelect));
    }

    const value = present();
    const placement = el("select", "deck-design-input");
    for (const item of placements) { if(item.value === "top-center" && !supportsLayouts)continue; const option = el("option", undefined, t(item.label)); option.value = item.value ?? ""; placement.append(option); }
    placement.value = value.placement;
    placement.addEventListener("change", () => { const next = logoPlacementSchema.safeParse(placement.value); if (next.success) apply({ placement: next.data }); });
    root.append(label(t("decks.logoEditor.placementLabel"), placement));
    if (supportsLayouts && asset()?.mark) {
      const variant = el("select", "deck-design-input");
      for (const [key, text] of [["full", t("decks.logoEditor.full")], ["mark", t("decks.logoEditor.mark")]]) {
        const option = el("option", undefined, text); option.value = key; variant.append(option);
      }
      variant.value = value.variant ?? "full";
      variant.addEventListener("change", () => apply({variant: variant.value === "mark" ? "mark" : "full"}));
      root.append(label(t("decks.logoEditor.variant"), variant));
    }
    root.append(slider(t("decks.logoEditor.size"), value.size, 2, 80, 1, "size"), slider(t("decks.logoEditor.opacity"), value.opacity, 0, 100, 1, "opacity"));
    if (value.placement !== "cover" && value.placement !== "watermark" && value.placement !== "hidden") {
      root.append(slider(t("decks.logoEditor.offsetX"), value.offsetX, 0, 256, 1, "offsetX"), slider(t("decks.logoEditor.offsetY"), value.offsetY, 0, 256, 1, "offsetY"));
      root.append(slider(t("decks.logoEditor.nudgeX"), value.nudgeX, -1, 1, 1, "nudgeX"), slider(t("decks.logoEditor.nudgeY"), value.nudgeY, -1, 1, 1, "nudgeY"));
    }
    const monochrome = el("input"); monochrome.type = "checkbox"; monochrome.checked = value.color === "monochrome";
    monochrome.addEventListener("change", () => apply({ color: monochrome.checked ? "monochrome" : "original" }));
    const backplate = el("input"); backplate.type = "checkbox"; backplate.checked = value.backplate;
    backplate.addEventListener("change", () => apply({ backplate: backplate.checked }));
    root.append(label(t("decks.logoEditor.monochrome"), monochrome), label(t("decks.logoEditor.backplate"), backplate));
    const design = readDeckDesign(input.master);
    const unsafe = input.ids.filter((id) => {
      const effective = effectiveLogo(input.authored, overrides, id, deckLogoLayout(slideOf(id)));
      if (effective === null || effective.presentation.placement === "hidden") return false;
      const slide = [...input.master.querySelectorAll("[data-deck-id]")].find((item) => item.getAttribute("data-deck-id") === id);
      const safe = new Set((slide?.getAttribute("data-dd-logo-safe") ?? "").split(/\s+/).filter(Boolean));
      return !canPlaceDeckLogo(safe, design ? effectiveAppearance(design.design, design.overrides, id).typography : undefined, effective);
    });
    if (unsafe.includes(selected)) {
      root.append(el("p", "deck-logo-warning", t("decks.logoEditor.unsafeHere")));
    } else if (scope === "document" && unsafe.length > 0) {
      root.append(el("p", "deck-logo-warning", t("decks.logoEditor.unsafeSlides", { count: unsafe.length })));
    }
    root.append(button(scope === "slide" ? t("decks.logoEditor.followDocument") : t("decks.logoEditor.resetToCreated"), reset));
    const files = el("div", "deck-logo-files");
    const exportButton = button(working === "export" ? t("decks.logoEditor.preparing") : t("decks.logoEditor.export"), () => { void writePortable(); });
    exportButton.disabled = working !== null || asset() === null;
    const importFile = el("input"); importFile.type = "file"; importFile.accept = ".json,application/json"; importFile.hidden = true; importFile.disabled = working !== null;
    importFile.addEventListener("change", () => { const picked = importFile.files?.[0]; if (picked) void readPortable(picked); });
    const importButton = button(working === "import" ? t("decks.logoEditor.reading") : t("decks.logoEditor.import"), () => importFile.click());
    importButton.disabled = working !== null;
    files.append(exportButton, importButton, importFile);
    root.append(files);
  }
  render();
  return { root, dirty: () => JSON.stringify(overrides) !== initial, busy: () => working === "upload" || working === "import", value: () => overrides,
    restore(value) { overrides = value; render(); }, select, refresh: render };
}


