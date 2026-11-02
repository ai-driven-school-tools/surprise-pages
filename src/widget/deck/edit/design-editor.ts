import { DECK_STYLE_OPTIONS as DECK_PRESETS, DECK_ORNAMENT_IDS, decorationLabel, deckStyleText, ornamentLabel, typographyLabel } from "../../../lib/deck/design/style-options";
import { prepareDeckFonts, whenDeckStyleReady, DECK_TYPOGRAPHIES } from "../../../lib/deck/design/typography";
import { deckBackground } from "../../../lib/deck/design/background";
import {
  needsSchool, DECORATIONS, DECK_ID, appearanceColors, appearanceSchema,
  deckOverridesSchema, effectiveAppearance, exportAppearance, importAppearance,
  type DeckAppearance, type DeckAppearancePatch, type DeckOverrides,
} from "../../../lib/deck/design/design";
import { paintDeckDesign, readDeckDesign, writeDeckOverrides, supportsSchool, supportsDiagonal } from "../../../lib/deck/design/dom";
import { customizationForSave, type DeckCustomization } from "../../../lib/deck/edit/customization-html";
import { readDeckCustomization } from "../../../lib/deck/edit/customization-dom";
import { createDeckFocusEditor } from "./focus-editor";
import { createDeckLogoEditor } from "./logo-editor";
import { el } from "../../shared/util";
import { t } from "../../shared/i18n";

export type DeckDesigner = {
  root: HTMLElement;
  modeButton: HTMLButtonElement;
  active: () => boolean;
  dirty: () => boolean;
  busy: () => boolean;
  value: () => DeckOverrides;
  customization: () => DeckCustomization;
  restore: (value: DeckOverrides) => void;
  restoreCustomization: (value: DeckCustomization) => void;
  select: (id: string) => void;
  selectTarget: (element: Element) => boolean;
  refresh: () => void;
};

/** A sidebar inside the existing edit session: never saves independently. */
export function createDeckDesigner(input: {
  master: Document; frame: HTMLIFrameElement; pageSlug: string; changed: () => void; stateChanged?: () => void; fail: (message: string) => void; clearFail: () => void;
}): DeckDesigner | null {
  const found = readDeckDesign(input.master);
  if (!found) return null;
  const source = found;
  const customization = readDeckCustomization(input.master);
  let overrides = source.overrides;
  const initial = JSON.stringify(overrides);
  let selected = source.ids[0];
  let scope: "document" | "slide" = "document";
  let panel: "appearance" | "focus" | "logo" = "appearance";
  let active = false;
  let advancedOpen = false;
  let fontWorking = false;
  let styleRequest = 0;
  const supportsStyles = Boolean(input.master.querySelector('[data-deck-design-runtime="3"]') && input.master.querySelector('[data-deck-design-style="3"]'));
  const root = el("div", "deck-design-workspace");
  const nav = el("nav", "deck-design-list");
  nav.setAttribute("aria-label", t("decks.designEditor.slideList"));
  const inspector = el("section", "deck-design-inspector");
  inspector.setAttribute("aria-label", t("decks.designEditor.adjust"));
  const mobile = button(t("decks.designEditor.openAdjust"), () => {
    const expanded = root.classList.toggle("is-inspector-open");
    mobile.setAttribute("aria-expanded", String(expanded));
    mobile.textContent = expanded ? t("decks.designEditor.closeAdjust") : t("decks.designEditor.openAdjust");
  });
  mobile.classList.add("deck-design-mobile");
  mobile.setAttribute("aria-expanded", "false");
  const modeButton = button(t("decks.designEditor.design"), () => {
    active = !active;
    root.classList.toggle("is-designing", active);
    modeButton.setAttribute("aria-pressed", String(active));
    modeButton.textContent = active ? t("decks.designEditor.editText") : t("decks.designEditor.design");
  });
  modeButton.setAttribute("aria-pressed", "false");
  root.append(nav, input.frame, mobile, inspector);

  const focus = customization?.focus === null || customization === null ? null : createDeckFocusEditor({
    authored: customization.focus.authored,
    overrides: customization.focus.overrides,
    ids: customization.slideIds,
    master: input.master,
    frame: input.frame,
    changed: input.changed,
  });
  const logo = customization?.logo === null || customization === null ? null : createDeckLogoEditor({
    authored: customization.logo.authored,
    overrides: customization.logo.overrides,
    ids: customization.slideIds,
    pageSlug: input.pageSlug,
    master: input.master,
    frame: input.frame,
    changed: input.changed,
    fail: input.fail,
    clearFail: input.clearFail,
  });

  let initializing=supportsStyles && !input.frame.contentDocument?.body?.hasAttribute("data-deck-design-ready");
  input.frame.addEventListener("load",()=>{
    const doc=input.frame.contentDocument;if(!doc)return;
    initializing=supportsStyles && !doc.body.hasAttribute("data-deck-design-ready");
    whenDeckStyleReady(doc,()=>{
      if(input.frame.contentDocument!==doc || !input.frame.isConnected)return;
      initializing=false;renderControls();input.stateChanged?.();
    });
  });
  const appearance = () => effectiveAppearance(source.design, overrides, scope === "slide" ? selected : undefined);
  const commitStyle = (patch: DeckAppearancePatch, targetScope: "document"|"slide", targetId: string) => {
    overrides = targetScope === "document"
      ? { ...overrides, document: { ...overrides.document, ...patch } }
      : { ...overrides, slides: { ...overrides.slides, [targetId]: { ...overrides.slides[targetId], ...patch } } };
    refresh(); input.changed();
  };
  const apply = (patch: DeckAppearancePatch) => {
    styleRequest++; fontWorking=false; commitStyle(patch,scope,selected);
  };
  const chooseStyle = async (value: DeckAppearancePatch) => {
    if(needsSchool(value) && !supportsSchool(input.master)){input.fail(t("decks.designEditor.needsSchool"));return;}
    if(value.decoration==='diagonal'&&!supportsDiagonal(input.master)) {
      input.fail(t("decks.designEditor.needsDiagonal"));
      return;
    }
    const patch={...value};
    if(!supportsStyles){ delete patch.typography; delete patch.ornament; }
    if(patch.typography===undefined){apply(patch);renderControls();return;}
    const ticket=++styleRequest,targetScope=scope,targetId=selected;
    fontWorking=true;input.clearFail();renderControls();input.stateChanged?.();
    try {
      const doc=input.frame.contentDocument;
      if(!doc)throw new Error();
      await prepareDeckFonts(doc,[patch.typography]);
      if(ticket===styleRequest){fontWorking=false;commitStyle(patch,targetScope,targetId);}
    } catch { if(ticket===styleRequest){fontWorking=false;input.fail(t("decks.designEditor.fontFailed"));} }
    finally { if(ticket===styleRequest){fontWorking=false;renderControls();input.stateChanged?.();} }
  };
  const reset = () => {
    styleRequest++; fontWorking=false;
    if (scope === "document") overrides = { ...overrides, document: {} };
    else {
      const slides = { ...overrides.slides };
      if (source.design.slides[selected]) slides[selected] = { followDocument: true };
      else delete slides[selected];
      overrides = { ...overrides, slides };
    }
    refresh(); renderControls(); input.changed();
  };
  const select = (id: string) => {
    if (!source.ids.includes(id)) return;
    selected = id;
    focus?.select(id);
    logo?.select(id);
    input.frame.contentDocument?.querySelector(`[${DECK_ID}="${id}"]`)?.scrollIntoView({ block: "center" });
    renderList(); renderControls();
  };
  const navButtons = new Map<string, HTMLButtonElement>();
  function refresh(): void {
    const doc = input.frame.contentDocument;
    if (doc?.body) {
      writeDeckOverrides(doc, overrides);
      paintDeckDesign(doc, source.design, overrides);
    }
    focus?.refresh();
    logo?.refresh();
    renderList();
    inspector.querySelectorAll(".deck-design-preset").forEach((button, index) => {
      button.setAttribute("aria-pressed", String(JSON.stringify(appearance()) === JSON.stringify(DECK_PRESETS[index]?.appearance)));
    });
  }
  function renderList(): void {
    if (!nav.firstChild) nav.append(el("p", "deck-design-heading", t("decks.designEditor.slides")));
    source.ids.forEach((id, index) => {
      const slide = input.master.querySelector(`[${DECK_ID}="${id}"]`);
      const title = slide?.querySelector("h1,h2,h3,.dd-statement")?.textContent?.trim() || t("decks.designEditor.slideNumber", { number: index + 1 });
      let item = navButtons.get(id);
      if (!item) {
        item = button("", () => select(id)); item.className = "deck-design-slide";
        navButtons.set(id, item); nav.append(item);
      }
      item.setAttribute("aria-current", id === selected ? "true" : "false");
      const colors = effectiveAppearance(source.design, overrides, id);
      const swatch = el("span", "deck-design-slide-paper");
      paintSwatch(swatch, colors);
      swatch.append(el("span", "deck-design-slide-number", String(index + 1).padStart(2, "0")), el("span", undefined, title));
      item.replaceChildren(swatch);
    });
  }
  function renderControls(): void {
    inspector.replaceChildren();
    const heading = el("div", "deck-design-panel-tabs");
    for (const [value, title] of [["appearance", t("decks.designEditor.design")], ["focus", t("decks.designEditor.tabFocus")], ["logo", t("decks.designEditor.tabLogo")]] as const) {
      if ((value === "focus" && focus === null) || (value === "logo" && logo === null)) continue;
      const item = button(title, () => { panel = value; renderControls(); });
      item.classList.add("deck-design-panel-tab");
      item.setAttribute("aria-pressed", String(panel === value));
      heading.append(item);
    }
    inspector.append(heading);
    if (panel === "focus" && focus !== null) { inspector.append(focus.root); return; }
    if (panel === "logo" && logo !== null) { inspector.append(logo.root); return; }
    inspector.append(el("h2", "deck-design-heading", t("decks.designEditor.design")));
    const target = el("select", "deck-design-input");
    target.setAttribute("aria-label", t("decks.designEditor.scope"));
    for (const [value, title] of [["document", t("decks.designEditor.wholeDocument")], ["slide", t("decks.designEditor.thisSlide")]]) {
      const option = el("option", undefined, title); option.value = value; target.append(option);
    }
    target.value = scope;
    target.addEventListener("change", () => { scope = target.value === "slide" ? "slide" : "document"; renderControls(); });
    inspector.append(label(t("decks.designEditor.scope"), target));
    if (scope === "slide") inspector.append(el("p", "deck-design-help", t("decks.designEditor.slideScopeNote", { number: source.ids.indexOf(selected) + 1 })));
    const presets = el("div", "deck-design-presets");
    for (const preset of DECK_PRESETS) {
      const text = deckStyleText(preset, t);
      const card = button(text.name, () => { void chooseStyle(preset.appearance); });
      card.disabled=fontWorking || initializing;
      card.className = "deck-design-preset";
      card.setAttribute("aria-label", t("decks.designEditor.presetLabel", { name: text.name }));
      const swatch = el("span", "deck-design-preset-swatch");
      paintSwatch(swatch, preset.appearance);
      swatch.setAttribute("aria-hidden", "true");
      card.title = text.description;
      card.prepend(swatch);
      card.setAttribute("aria-pressed", String(JSON.stringify(appearance()) === JSON.stringify(preset.appearance)));
      presets.append(card);
    }
    inspector.append(el("h3", "deck-design-heading", t("decks.designEditor.presets")), presets);
    const advanced = el("details", "deck-design-advanced");
    advanced.open = advancedOpen;
    advanced.addEventListener("toggle", () => { advancedOpen = advanced.open; });
    advanced.append(el("summary", "deck-design-advanced-title", t("decks.designEditor.advanced")));
    const controls = el("div", "deck-design-advanced-controls");
    advanced.append(controls); inspector.append(advanced);
    if(!supportsStyles)inspector.append(el("p","deck-design-help",t("decks.designEditor.colorsOnly")));
    if(fontWorking || initializing){const notice=el("p","deck-design-help",initializing ? t("decks.designEditor.preparingView") : t("decks.designEditor.preparingFont"));notice.setAttribute("role","status");inspector.append(notice);}
    if(supportsStyles){
      const font=el("select","deck-design-input");font.setAttribute("aria-label",t("decks.designEditor.font"));font.disabled=fontWorking || initializing;
      for(const item of DECK_TYPOGRAPHIES){const option=el("option",undefined,typographyLabel(item,t));option.value=item.id;font.append(option);}
      font.value=appearance().typography??"system";
      font.addEventListener("change",()=>{const parsed=appearanceSchema.shape.typography.safeParse(font.value);if(parsed.success)void chooseStyle({typography:parsed.data});});
      controls.append(label(t("decks.designEditor.font"),font));
      const ornament=el("select","deck-design-input");ornament.setAttribute("aria-label",t("decks.designEditor.headingOrnament"));
      for(const id of DECK_ORNAMENT_IDS){const option=el("option",undefined,ornamentLabel(id,t));option.value=id;ornament.append(option);}
      ornament.value=appearance().ornament??"none";
      ornament.addEventListener("change",()=>{const parsed=appearanceSchema.shape.ornament.safeParse(ornament.value);if(parsed.success)void chooseStyle({ornament:parsed.data});});
      controls.append(label(t("decks.designEditor.headingOrnament"),ornament));
    }
    const colors = el("div", "deck-design-colors");
    const current = appearance();
    for (const field of [{ key: "background", text: t("decks.designEditor.background") }, { key: "accent", text: t("decks.designEditor.accent") }, { key: "secondary", text: t("decks.designEditor.secondary") }]) {
      const picker = el("input"); picker.type = "color";
      picker.value = field.key === "background" ? current.background : field.key === "accent" ? current.accent : current.secondary;
      picker.setAttribute("aria-label", field.text);
      picker.addEventListener("input", () => {
        if (field.key === "background") apply({ background: picker.value });
        else if (field.key === "accent") apply({ accent: picker.value });
        else apply({ secondary: picker.value });
      });
      colors.append(label(field.text, picker));
    }
    controls.append(colors, el("p", "deck-design-help", t("decks.designEditor.readability")));
    const decoration = el("select", "deck-design-input"); decoration.setAttribute("aria-label", t("decks.designEditor.decoration"));
    for (const item of DECORATIONS) { if(item.value==='diagonal'&&!supportsDiagonal(input.master))continue; const option = el("option", undefined, decorationLabel(item.value, t)); option.value = item.value; decoration.append(option); }
    decoration.value = current.decoration;
    decoration.addEventListener("change", () => {
      const parsed = appearanceSchema.shape.decoration.safeParse(decoration.value);
      if (parsed.success) { apply({ decoration: parsed.data }); renderControls(); }
    });
    controls.append(label(t("decks.designEditor.decoration"), decoration));
    if (current.decoration === "diagonal") controls.append(el("p", "deck-design-help", t("decks.designEditor.diagonalNote")));
    if (current.decoration !== "none") {
      slider(t("decks.designEditor.intensity"), current.intensity, 0, 100, (value) => apply({ intensity: value }), controls);
      slider(t("decks.designEditor.x"), current.x, 0, 100, (value) => apply({ x: value }), controls);
      slider(t("decks.designEditor.y"), current.y, 0, 100, (value) => apply({ y: value }), controls);
      slider(t("decks.designEditor.scale"), current.scale, 50, 150, (value) => apply({ scale: value }), controls);
      if (current.decoration === "gradient" || current.decoration === "grid") slider(t("decks.designEditor.angle"), current.angle, 0, 360, (value) => apply({ angle: value }), controls);
      const motion = el("input"); motion.type = "checkbox"; motion.checked = current.motion;
      motion.addEventListener("change", () => apply({ motion: motion.checked }));
      controls.append(label(t("decks.designEditor.motion"), motion));
    }
    inspector.append(button(scope === "slide" ? t("decks.designEditor.followDocument") : t("decks.designEditor.resetToCreated"), reset));
    const files = el("div", "deck-design-files");
    files.append(button(t("decks.designEditor.export"), () => {
      const url = URL.createObjectURL(new Blob([exportAppearance(appearance())], { type: "application/json" }));
      const link = el("a"); link.href = url; link.download = "deck-appearance.json"; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }));
    const file = el("input"); file.type = "file"; file.accept = ".json,application/json"; file.hidden = true;
    file.addEventListener("change", async () => {
      const selectedFile = file.files?.[0]; if (!selectedFile) return;
      try {
        if (selectedFile.size > 64 * 1024) throw new Error();
        const loaded = importAppearance(await selectedFile.text()); await chooseStyle(loaded);
      } catch { input.fail(t("decks.designEditor.importFailed")); }
    });
    files.append(button(t("decks.designEditor.import"), () => file.click()), file);
    inspector.append(files);
  }
  function slider(text: string, value: number, min: number, max: number, change: (value: number) => void, parent: HTMLElement): void {
    const range = el("input"); range.type = "range"; range.min = String(min); range.max = String(max); range.value = String(value);
    range.setAttribute("aria-label", text);
    const output = el("output", "deck-design-help", String(value));
    range.addEventListener("input", () => { output.textContent = range.value; change(range.valueAsNumber); });
    const row = label(text, range); row.append(output); parent.append(row);
  }
  renderList(); renderControls();
  return { root, modeButton, active: () => active,
    dirty: () => JSON.stringify(overrides) !== initial || (focus?.dirty() ?? false) || (logo?.dirty() ?? false),
    busy: () => initializing || fontWorking || (logo?.busy() ?? false),
    value: () => overrides,
    customization: () => customizationForSave(overrides, focus?.value(), logo?.value()),
    select,
    selectTarget: (element) => panel === "focus" && (focus?.selectTarget(element) ?? false),
    refresh,
    restore(value) { overrides = deckOverridesSchema.parse(value); refresh(); renderControls(); },
    restoreCustomization(value) {
      if (value.appearance) overrides = deckOverridesSchema.parse(value.appearance);
      if (value.focus && focus) focus.restore(value.focus);
      if (value.logo && logo) logo.restore(value.logo);
      refresh(); renderControls();
    },
  };
}
function paintSwatch(swatch: HTMLElement, appearance: DeckAppearance): void {
  const background = deckBackground(appearance), colors = appearanceColors(appearance);
  swatch.style.backgroundColor = appearance.background;
  swatch.style.color = `rgb(${colors.text})`;
  swatch.style.setProperty("--dd-preview-image", background.image);
  swatch.style.setProperty("--dd-preview-size", background.size);
  swatch.style.setProperty("--dd-preview-repeat", background.repeat);
  swatch.style.setProperty("--dd-preview-opacity", String(colors.opacity));
}
function button(text: string, click: () => void): HTMLButtonElement {
  const result = el("button", "edit-button", text); result.type = "button"; result.addEventListener("click", click); return result;
}
function label(text: string, control: HTMLElement): HTMLLabelElement {
  const result = el("label", "deck-design-field"); result.append(el("span", undefined, text), control); return result;
}
