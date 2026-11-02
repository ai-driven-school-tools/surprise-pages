import { t } from "../../shared/i18n";
import { DECK_STYLE_OPTIONS as DECK_PRESETS, deckStyleText, typographyLabel } from "../../../lib/deck/design/style-options";
import { DECK_TYPOGRAPHIES, deckStyleDrawn, whenDeckStyleReady } from "../../../lib/deck/design/typography";
import { needsSchool, appearanceSchema } from "../../../lib/deck/design/design";
import { emptyDeckLogo } from "../../../lib/deck/design/theme-source";
import { openThemeDialog } from "../edit/theme-dialog";
import { deckBackground } from "../../../lib/deck/design/background";
import { readDeckCustomization } from "../../../lib/deck/edit/customization-dom";
import {
  appearanceColors,
  deckOverridesSchema,
  effectiveAppearance,
  type DeckAppearancePatch,
} from "../../../lib/deck/design/design";
import { supportsSchool, readDeckDesign } from "../../../lib/deck/design/dom";
import {
  type DeckEditOperation
} from "../../../lib/deck/edit/model";
import {
  deckSourceSetting
} from "../../../lib/deck/edit/source";
import {
  createDeckFocusEditor,
  DECK_FOCUS_EDITOR_STYLES,
} from "../edit/focus-editor";
import {
  createDeckLogoEditor,
  DECK_LOGO_EDITOR_STYLES,
  type DeckLogoEditor,
} from "../edit/logo-editor";
import type { Input } from './types';
import { el } from "../../shared/util";

/** Owns design behavior; receives only its required page/editor connections. */
type Host = {
  inspector: HTMLElement;
  parse: (html: string) => Document;
  input: Input;
  button: (label: string, fn: () => void, cls?: string) => HTMLButtonElement;
  refreshInspector: () => void;
  find: (doc: Document, id: string) => HTMLElement | undefined;
  current: string;
  frame: HTMLIFrameElement;
  commit: (ops: DeckEditOperation[]) => boolean;
  selectField: (parent: HTMLElement, label: string, items: readonly (readonly [string, string])[], value: string, change: (value: string) => void) => HTMLDivElement | HTMLSelectElement;
  run: (fn: () => void) => void;
  sourceDoc: () => Document;
  field: (parent: HTMLElement, label: string, value: string, change: (value: string) => void, type?: string) => HTMLInputElement;
};

export function createDeckWorkspaceDesign(connections: Host) {
  const button: Host['button'] = (...args) => connections.button(...args);
  const refreshInspector: Host['refreshInspector'] = (...args) => connections.refreshInspector(...args);
  const find: Host['find'] = (...args) => connections.find(...args);
  const commit: Host['commit'] = (...args) => connections.commit(...args);
  const selectField: Host['selectField'] = (...args) => connections.selectField(...args);
  const run: Host['run'] = (...args) => connections.run(...args);
  const sourceDoc: Host['sourceDoc'] = (...args) => connections.sourceDoc(...args);
  const field: Host['field'] = (...args) => connections.field(...args);

  let specialty: DeckLogoEditor | null = null;
  let waitingStyle: Document | null = null;
  let designPanel: "appearance" | "focus" | "logo" = "appearance";
  let scope: "document" | "slide" = "document";

  function renderDesign() {
    connections.inspector.append(el("h2", undefined, t("decks.workspaceDesign.heading")));
    connections.inspector.append(button(t("decks.workspaceDesign.saveTheme"),()=>{if(specialty?.busy()){connections.input.fail(t("decks.workspaceDesign.waitLogoSave"));return;}openThemeDialog(connections.input.screen,'save',{input:connections.input});}),button(t("decks.workspaceDesign.useTheme"),()=>{if(specialty?.busy()){connections.input.fail(t("decks.workspaceDesign.waitLogoApply"));return;}openThemeDialog(connections.input.screen,'apply',{input:connections.input});}));
    const master = sourceDoc(),
      customization = readDeckCustomization(master),
      navigation = el("div", "ds-row");
    for (const [panel, label] of [
      ["appearance", t("decks.workspaceDesign.tabColors")],
      ["focus", t("decks.workspaceDesign.tabFocus")],
      ["logo", t("decks.workspaceDesign.tabLogo")],
    ] satisfies [typeof designPanel, string][]) {
      if (
        (panel === "focus" && !customization?.focus)
      )
        continue;
      const b = button(label, () => {
        if (specialty?.busy()) return;
        if(panel==='logo'&&!customization?.logo){
          if(!commit([{kind:'setting',target:'deck-document',name:'logo-source',before:null,after:JSON.stringify(emptyDeckLogo())}]))return;
        }
        designPanel = panel;
        refreshInspector();
      });
      b.setAttribute("aria-pressed", String(designPanel === panel));
      navigation.append(b);
    }
    if (navigation.childElementCount > 1) {
      navigation.classList.add("ds-design-tabs");
      connections.inspector.append(navigation);
    }
    specialty = null;
    const selectedSlide =
      find(master, connections.current)?.getAttribute("data-deck-id") ?? "";
    if (designPanel === "focus" && customization?.focus) {
      // Step targets are named from the drawn diagrams of any slide the panel offers.
      // Until the style has drawn them all, show that the panel is preparing.
      const shown = connections.frame.contentDocument;
      if (shown && !deckStyleDrawn(shown)) {
        const notice = el("p", "ds-note", t("decks.workspaceDesign.preparing"));
        notice.setAttribute("role", "status");
        connections.inspector.append(notice);
        if (waitingStyle !== shown) {
          waitingStyle = shown;
          whenDeckStyleReady(shown, () => {
            if (waitingStyle === shown) waitingStyle = null;
            if (connections.frame.contentDocument === shown && designPanel === "focus") refreshInspector();
          });
        }
        return;
      }
      const before = deckSourceSetting(connections.input.source(), "focus");
      const editor = createDeckFocusEditor({
        authored: customization.focus.authored,
        overrides: customization.focus.overrides,
        ids: customization.slideIds,
        master,
        frame: connections.frame,
        changed: () => {
          commit(
            [
              {
                kind: "setting",
                target: "deck-document",
                name: "focus",
                before,
                after: JSON.stringify(editor.value()),
              },
            ]
          );
        },
      });
      editor.select(selectedSlide);
      const css = el("style");
      css.textContent = DECK_FOCUS_EDITOR_STYLES;
      connections.inspector.append(css, editor.root);
      return;
    }
    if (designPanel === "logo" && customization?.logo) {
      const before = deckSourceSetting(connections.input.source(), "logo");
      const editor = createDeckLogoEditor({
        authored: customization.logo.authored,
        overrides: customization.logo.overrides,
        ids: customization.slideIds,
        pageSlug: connections.input.pageSlug,
        master,
        frame: connections.frame,
        changed: () => {
          commit(
            [
              {
                kind: "setting",
                target: "deck-document",
                name: "logo",
                before,
                after: JSON.stringify(editor.value()),
              },
            ]
          );
          // Sending starts and ends without a document change; the status must follow it too.
          connections.input.busyChanged();
        },
        fail: connections.input.fail,
        clearFail: () => { },
      });
      specialty = editor;
      editor.select(selectedSlide);
      const css = el("style");
      css.textContent = DECK_LOGO_EDITOR_STYLES;
      connections.inspector.append(css, editor.root);
      return;
    }

    const authored = deckSourceSetting(connections.input.source(), "design-source");
    if (!authored) {
      connections.inspector.append(
        el(
          "p",
          "ds-note",
          t("decks.workspaceDesign.unsupported"),
        ),
      );
      return;
    }
    if (!selectedSlide) scope = "document";
    if (selectedSlide) selectField(
      connections.inspector,
      t("decks.workspaceDesign.scope"),
      [
        ["document", t("decks.workspaceDesign.wholeDocument")],
        ["slide", t("decks.workspaceDesign.thisSlide")],
      ],
      scope,
      (v) => {
        scope = v === "slide" ? "slide" : "document";
        refreshInspector();
      },
    );
    const apply = (patch: DeckAppearancePatch) =>
      run(() => {
        if (needsSchool(patch) && !supportsSchool(sourceDoc())) throw new Error(t("decks.workspaceDesign.needsSchool"));
        const before = deckSourceSetting(connections.input.source(), "appearance"),
          value = before
            ? deckOverridesSchema.parse(JSON.parse(before))
            : { version: 1, document: {}, slides: {} };
        const parsed = deckOverridesSchema.parse(value),
          slideId = find(sourceDoc(), connections.current)?.getAttribute("data-deck-id");
        if (scope === "document")
          parsed.document = { ...parsed.document, ...patch };
        else if (slideId)
          parsed.slides[slideId] = { ...parsed.slides[slideId], ...patch };
        commit(
          [
            {
              kind: "setting",
              target: "deck-document",
              name: "appearance",
              before,
              after: JSON.stringify(parsed),
            },
          ]
        );
      });
    const designSource = readDeckDesign(master);
    const appearance = designSource
      ? effectiveAppearance(
        designSource.design,
        designSource.overrides,
        scope === "slide" ? selectedSlide : undefined,
      )
      : DECK_PRESETS[0].appearance;
    const grid = el("div", "ds-preset-grid");
    for (const preset of DECK_PRESETS) {
      const b = button("", () => apply(preset.appearance), "ds-preset"),
        swatch = el("span", "ds-swatch", "Aa");
      const colors = appearanceColors(preset.appearance),
        background = deckBackground(preset.appearance);
      swatch.style.background = preset.appearance.background;
      swatch.style.color = colors.accent;
      const art = el("span", "ds-swatch-art");
      Object.assign(art.style, {
        backgroundImage: background.image,
        backgroundSize: background.size,
        backgroundRepeat: background.repeat,
        opacity: String(colors.opacity),
      });
      swatch.replaceChildren(art, el("span", "ds-swatch-copy", "Aa"));
      b.setAttribute(
        "aria-pressed",
        String(
          JSON.stringify(Object.entries(appearance).sort()) ===
          JSON.stringify(Object.entries(preset.appearance).sort()),
        ),
      );
      b.append(swatch, el("span", undefined, deckStyleText(preset, t).name));
      grid.append(b);
    }
    connections.inspector.append(grid);
    const details = el("details", "ds-section");
    details.append(el("summary", undefined, t("decks.workspaceDesign.advanced")));
    field(
      details,
      t("decks.workspaceDesign.background"),
      appearance.background,
      (v) => apply({ background: v }),
      "color",
    );
    field(
      details,
      t("decks.workspaceDesign.accent"),
      appearance.accent,
      (v) => apply({ accent: v }),
      "color",
    );
    selectField(
      details,
      t("decks.workspaceDesign.decoration"),
      [
        ["none", t("decks.workspaceDesign.decorationNone")],
        ["gradient", t("decks.workspaceDesign.decorationGradient")],
        ["glow", t("decks.workspaceDesign.decorationGlow")],
        ["grid", t("decks.workspaceDesign.decorationGrid")],
        ["wave", t("decks.workspaceDesign.decorationWave")],
      ],
      appearance.decoration,
      (v) => {
        if (
          v === "none" ||
          v === "gradient" ||
          v === "glow" ||
          v === "grid" ||
          v === "wave"
        )
          apply({ decoration: v });
      },
    );
    selectField(details,t("decks.workspaceDesign.font"),DECK_TYPOGRAPHIES.map(item=>[item.id,typographyLabel(item,t)]),appearance.typography??"system",value=>{const font=appearanceSchema.shape.typography.safeParse(value);if(font.success)apply({typography:font.data});});
    connections.inspector.append(details);
  }
  return {
    renderDesign,
    get specialty() { return specialty; },
    set specialty(value: DeckLogoEditor | null) { specialty = value; },
    get designPanel() { return designPanel; },
    set designPanel(value: "focus" | "appearance" | "logo") { designPanel = value; },
    get scope() { return scope; },
    set scope(value: "document" | "slide") { scope = value; }
  };
}
