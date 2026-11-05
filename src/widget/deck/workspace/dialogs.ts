import { DECK_STYLE_OPTIONS, deckStyleName } from "../../../lib/deck/design/style-options";
import {DECK_PARENT,outlineBranch} from "../../../lib/deck/outline";
import { DECK_SKIP } from "../../../lib/deck/deck";
import { documentTheme, documentThemeName } from "../../../lib/deck/design/theme-source";
import {
  authorChart,
  AUTHORING_LAYOUTS,
  authorShape,
  authorSlide,
  authorTable
} from "../../../lib/deck/authoring";
import {
  DECK_PRESETS,
  needsSchool, deckOverridesSchema,
  effectiveAppearance
} from "../../../lib/deck/design/design";
import { supportsSchool, readDeckDesign } from "../../../lib/deck/design/dom";
import {
  type DeckEditOperation
} from "../../../lib/deck/edit/model";
import {
  applyDeckEditOperations,
  deckSourceChildren,
  deckSourceOutline,
  deckSourceFragment,
  deckSourceSetting
} from "../../../lib/deck/edit/source";
import { browserSlideOperations } from "../../../lib/deck/design/browser-templates";
import { createDeckLibraryPicker } from "../edit/library-picker";
import { deckIcon, styleDeckButton, type DeckIcon } from "../ui";
import type { DeckInsertion, Input } from './types';
import { openAgentReview } from "../../reading/page-agent-review";
import { el } from "../../shared/util";
import { t } from "../../shared/i18n";
import { LocalizedError } from "../../../lib/i18n/errors";
import { deckErrorMessage } from "../../../lib/deck/edit/message";

/** Owns dialogs behavior; receives only its required page/editor connections. */
type Host = {
  openMenu: HTMLElement | null;
  menuTrigger: HTMLButtonElement | null;
  tip: HTMLDivElement;
  slideCommands: (action: "copy" | "cut" | "paste" | "duplicate" | "delete" | "up" | "down" | "skip" | "unskip" | "indent" | "outdent" | "delete-only" | "delete-tree") => void;
  button: (label: string, fn: () => void, cls?: string) => HTMLButtonElement;
  chosenSlides: string[];
  screen: HTMLElement;
  disposeLibrary: (() => void) | null;
  run: (fn: () => void) => void;
  sourceDoc: () => Document;
  uid: () => string;
  input: Input;
  current: string;
  selection: string[];
  commit: (ops: DeckEditOperation[]) => boolean;
  parse: (html: string) => Document;
  thumbnail: (slide: HTMLElement, holder: HTMLElement) => void;
  find: (doc: Document, id: string) => HTMLElement | undefined;
  titleOf: (slide: Element) => string;
  replacement: (id: string, after: string | null) => DeckEditOperation;
  replaceTarget: { id: string; type: "image" | "video"; } | null;
  insert: (html: string, id: string) => void;
  field: (parent: HTMLElement, label: string, value: string, change: (value: string) => void, type?: string) => HTMLInputElement;
};

export function createDeckWorkspaceDialogs(connections: Host) {
  const slideCommands: Host['slideCommands'] = (...args) => connections.slideCommands(...args);
  const button: Host['button'] = (...args) => connections.button(...args);
  const run: Host['run'] = (...args) => connections.run(...args);
  const sourceDoc: Host['sourceDoc'] = (...args) => connections.sourceDoc(...args);
  const uid: Host['uid'] = (...args) => connections.uid(...args);
  const commit: Host['commit'] = (...args) => connections.commit(...args);
  const parse: Host['parse'] = (...args) => connections.parse(...args);
  const thumbnail: Host['thumbnail'] = (...args) => connections.thumbnail(...args);
  const find: Host['find'] = (...args) => connections.find(...args);
  const titleOf: Host['titleOf'] = (...args) => connections.titleOf(...args);
  const replacement: Host['replacement'] = (...args) => connections.replacement(...args);
  const insert: Host['insert'] = (...args) => connections.insert(...args);
  const field: Host['field'] = (...args) => connections.field(...args);

  let dialog: HTMLElement | null = null;
  let selectionBeforeDialog: HTMLElement | null = null;

  function closeMenu(restore = false) {
    connections.openMenu?.remove();
    connections.openMenu = null;
    connections.menuTrigger?.setAttribute("aria-expanded", "false");
    if (restore) connections.menuTrigger?.focus();
  }

  function slideMenu(trigger: HTMLButtonElement) {
    if (connections.openMenu) {
      closeMenu(true);
      return;
    }
    connections.tip.hidden = true;
    connections.menuTrigger = trigger;
    trigger.setAttribute("aria-expanded", "true");
    const menu = el("div", "ds-menu");
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", t("deckEditor.dialogs.slideActions"));
    connections.openMenu = menu;
    const doc = sourceDoc();
    const allSkipped = connections.chosenSlides.length > 0 && connections.chosenSlides.every(id => connections.find(doc,id)?.getAttribute(DECK_SKIP) === "true");
    for (const [action, label, glyph, keys] of [
      ["up", t("deckEditor.dialogs.moveUp"), "up", "⌥↑"],
      ["down", t("deckEditor.dialogs.moveDown"), "down", "⌥↓"],
      ["indent", t("deckEditor.dialogs.indent"), "right", "⌥→"],
      ["outdent", t("deckEditor.dialogs.outdent"), "left", "⌥←"],
      ["copy", t("deckStudio.clipboard.copy"), "copy", "⌘C"],
      ["paste", t("deckStudio.clipboard.paste"), "plus", "⌘V"],
      ["duplicate", t("deckEditor.dialogs.duplicate"), "copy", "⌘D"],
      [allSkipped ? "unskip" : "skip", allSkipped ? t("deckEditor.dialogs.unskip") : t("deckEditor.dialogs.skip"), allSkipped ? "play" : "skip", ""],
      ["delete", t("deckEditor.dialogs.delete"), "trash", "⌫"],
    ] satisfies [
      Parameters<typeof slideCommands>[0],
      string,
      DeckIcon,
      string,
    ][]) {
      const b = button(
        label,
        () => {
          closeMenu();
          slideCommands(action);
          trigger.focus();
        },
        "ds-menu-item",
      );
      b.setAttribute("role", "menuitem");
      b.setAttribute("aria-label", t("deckEditor.dialogs.slideAction",{action:label}));
      b.disabled = connections.chosenSlides.length === 0;
      b.append(el("kbd", undefined, keys));
      b.prepend(deckIcon(glyph));
      if (action === "delete") b.classList.add("ds-danger");
      menu.append(b);
    }
    connections.screen.append(menu);
    const r = trigger.getBoundingClientRect();
    menu.style.left = `${Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)}px`;
    menu.style.top = `${r.bottom + 6}px`;
    menu.addEventListener("keydown", (event) => {
      const items = [
        ...menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
      ];
      const root = menu.getRootNode(),
        active =
          root instanceof ShadowRoot
            ? root.activeElement
            : document.activeElement;
      const index = items.findIndex((item) => item === active);
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        items[
          (index + (event.key === "ArrowDown" ? 1 : items.length - 1)) %
          items.length
        ]?.focus();
      } else if (event.key === "Tab") closeMenu();
    });
    menu.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
  }

  function closeDialog() {
    connections.disposeLibrary?.();
    connections.disposeLibrary = null;
    dialog?.remove();
    dialog = null;
    selectionBeforeDialog?.focus();
  }

  function modal(title: string) {
    closeDialog();
    closeMenu();
    connections.tip.hidden = true;
    const active =
      connections.screen.getRootNode() instanceof ShadowRoot ? connections.screen.getRootNode() : null;
    selectionBeforeDialog =
      active instanceof ShadowRoot &&
        active.activeElement instanceof HTMLElement
        ? active.activeElement
        : null;
    const backdrop = el("div", "ds-dialog-backdrop"),
      box = el("section", "ds-dialog");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", title);
    box.append(el("h2", undefined, title));
    backdrop.append(box);
    connections.screen.append(backdrop);
    dialog = backdrop;
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeDialog();
      }
      if (event.key === "Tab") {
        const all = [
          ...box.querySelectorAll<HTMLElement>(
            "button,input,select,textarea,[tabindex='0']",
          ),
        ].filter((n) => !n.hasAttribute("disabled"));
        const first = all[0],
          last = all.at(-1),
          owner = box.getRootNode();
        if (!first || !last) return;
        if (
          event.shiftKey &&
          owner instanceof ShadowRoot &&
          owner.activeElement === first
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          owner instanceof ShadowRoot &&
          owner.activeElement === last
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    });
    queueMicrotask(() =>
      box.querySelector<HTMLElement>("button,input,select,textarea")?.focus(),
    );
    return box;
  }

  function actions(box: HTMLElement, label: string, fn: () => void) {
    const row = el("div", "ds-dialog-actions");
    row.append(
      button(t("deckEditor.dialogs.cancel"), closeDialog),
      button(label, () => run(fn), "ds-button ds-primary"),
    );
    box.append(row);
  }

  /** 差し込み先を渡されなければ、選んでいる枚の枝の直後・同じ親のもと（Keynote と同じ）。 */
  function defaultInsertion(): DeckInsertion {
    const source = connections.input.source(), slides = deckSourceChildren(source, "deck-root"), outline = deckSourceOutline(source);
    const position = slides.indexOf(connections.current);
    if (position < 0) return { afterId:null, beforeId: null, parent: null, note: t("deckEditor.dialogs.insertFirst") };
    const branchEnd = outlineBranch(outline, connections.current).at(-1) ?? connections.current;
    return { afterId:connections.current, beforeId: slides[slides.indexOf(branchEnd) + 1] ?? null, parent: outline.find(entry => entry.id === connections.current)?.parent ?? null, note: t("deckEditor.dialogs.insertAfter",{position:position + 1}) };
  }
  function layouts(replace: boolean, at?: DeckInsertion) {
    if (!replace) {
      const box = modal(t("deckEditor.dialogs.addSlide"));
      box.classList.add("ds-library-dialog");
      const insertion = at ?? defaultInsertion();
      const placementNote=el("p", "ds-note", insertion.note);box.append(placementNote);
      const source = readDeckDesign(sourceDoc());
      const appearance = source ? effectiveAppearance(source.design, source.overrides) : DECK_PRESETS[0].appearance;
      const themeRow = el("label", "ds-row"), themeSelect = el("select", "ds-input");
      themeSelect.setAttribute("aria-label", t("deckEditor.dialogs.slideTheme"));
      const currentName = documentThemeName(connections.input.source());
      const currentOption = el("option", undefined, currentName); currentOption.value = "current";
      themeSelect.append(currentOption);
      for (const style of DECK_STYLE_OPTIONS) {
        const option = el("option", undefined, style.name); option.value = style.id;
        themeSelect.append(option);
      }
      themeRow.append(el("span", undefined, t("deckEditor.dialogs.theme")), themeSelect); box.append(themeRow);
      themeSelect.onchange = async () => {
       const selectedTheme = themeSelect.value;
       themeSelect.disabled = true;
       try {
        const style = DECK_STYLE_OPTIONS.find(item => item.id === selectedTheme);
        if (!style) return;
        if (needsSchool(style.appearance) && !supportsSchool(sourceDoc())) {
          themeSelect.value = "current";
          throw new LocalizedError("deckEditor.dialogs.schoolUpgrade");
        }
        const before = deckSourceSetting(connections.input.source(), "appearance");
        const overrides = deckOverridesSchema.parse(before ? JSON.parse(before) : {version:1,document:{},slides:{}});
        if (!commit([{kind:"setting",target:"deck-document",name:"appearance",before,after:JSON.stringify({...overrides,document:style.appearance})}])) {
          themeSelect.value = "current"; return;
        }
        if (!box.isConnected) return;
        currentOption.textContent = deckStyleName(style.appearance);
        picker.setAppearance(style.appearance, {value:documentTheme(connections.input.source()).logo,base:connections.input.frame.contentDocument?.baseURI??location.href});
       } catch (error) {
         themeSelect.value = "current";
         connections.input.fail(error instanceof Error ? deckErrorMessage(error, t) : t("deckEditor.dialogs.themeFailed"));
       } finally { themeSelect.disabled = false; }
      };
      const picker = createDeckLibraryPicker(box, appearance, (templateId, basic) => run(() => {
        const id = uid();
        const slides = deckSourceChildren(connections.input.source(), "deck-root");
        if([insertion.afterId,insertion.beforeId,insertion.parent].some(target=>target!==null&&!slides.includes(target))||(!insertion.afterId&&!insertion.beforeId&&slides.length>0)){
          const message=t("deckEditor.dialogs.targetChanged");
          placementNote.textContent=message;placementNote.setAttribute("role","alert");throw new Error(message);
        }
        const {beforeId,parent}=insertion;
        const ops = browserSlideOperations(connections.input.source(), {kind: basic ? "basic" : "library", id: templateId}, id, beforeId);
        if(parent){for(const op of ops)if(op.kind==="fragment"&&op.parentId==="deck-root"&&op.after){const fresh=parse(op.after).querySelector("section");if(fresh){fresh.setAttribute(DECK_PARENT,parent);op.after=fresh.outerHTML;}}}
        const previous = connections.current;
        connections.current = id; connections.chosenSlides = [id]; connections.selection = [];
        if (commit(ops)) closeDialog();
        else { connections.current = previous; connections.chosenSlides = previous ? [previous] : []; }
      }), {confirmLabel: t("deckEditor.dialogs.addThisSlide"),logo:{value:documentTheme(connections.input.source()).logo,base:connections.input.frame.contentDocument?.baseURI??location.href}});
      connections.disposeLibrary = picker;
      const row = el("div", "ds-dialog-actions"); row.append(button(t("deckEditor.dialogs.close"), closeDialog)); box.append(row);
      return;
    }
    const box = modal(
      replace ? t("deckEditor.dialogs.changeLayout") : t("deckEditor.dialogs.whatSlide"),
    ),
      grid = el("div", "ds-layout-grid");
    box.append(grid);
    for (const item of AUTHORING_LAYOUTS) {
      const card = button(
        "",
        () =>
          run(() => {
            if (replace) {
              previewLayout(item.id);
              return;
            }
            const id = uid(),
              after = authorSlide(item.id, id),
              slides = deckSourceChildren(connections.input.source(), "deck-root"),
              at = slides.indexOf(connections.current);
            connections.current = id;
            connections.chosenSlides = [id];
            connections.selection = [];
            if (
              commit(
                [
                  {
                    kind: "fragment",
                    target: id,
                    parentId: "deck-root",
                    beforeId: slides[at + 1] ?? null,
                    before: null,
                    after,
                  },
                ]
              )
            )
              closeDialog();
          }),
        "ds-layout-card",
      );
      const preview = el("div", "ds-thumb");
      const sample = parse(
        authorSlide(item.id, `sample-${item.id}`),
      ).querySelector<HTMLElement>("section");
      if (sample) thumbnail(sample, preview);
      card.setAttribute("aria-label", t(item.labelKey));
      card.append(
        preview,
        el("strong", undefined, t(item.labelKey)),
        el("small", undefined, t(item.descriptionKey)),
      );
      grid.append(card);
    }
    const row = el("div", "ds-dialog-actions");
    row.append(button(t("deckEditor.dialogs.close"), closeDialog));
    box.append(row);
  }

  function previewLayout(layout: string) {
    const original = deckSourceFragment(connections.input.source(), connections.current);
    if (!original) return;
    const doc = sourceDoc(),
      old = find(doc, connections.current);
    if (!old) return;
    const fresh = parse(
      `<body>${authorSlide(layout, connections.current, titleOf(old))}</body>`,
    ).querySelector("section")!;
    for(const mark of [DECK_PARENT,DECK_SKIP]){const value=old.getAttribute(mark);if(value!==null)fresh.setAttribute(mark,value);}
    // Preserve all existing content; only the authored layout shell and matching title change.
    const title = old.querySelector("h1,h2,h3"),
      newTitle = fresh.querySelector("h1");
    if (title && newTitle) newTitle.replaceWith(title.cloneNode(true));
    for (const child of [...fresh.children])
      if (child !== fresh.querySelector("h1,h2,h3")) child.remove();
    for (const child of [...old.children])
      if (child !== title) fresh.append(child.cloneNode(true));
    if (layout === "comparison" || layout === "process") {
      const body = fresh.querySelector<HTMLElement>(".dd-body");
      if (body) {
        body.style.display = "grid";
        body.style.gridTemplateColumns = `repeat(${layout === "process" ? 3 : 2},minmax(0,1fr))`;
        body.style.gap = "32px";
      }
    }
    const after = fresh.outerHTML,
      box = modal(t("deckEditor.dialogs.keepContentChange"));
    box.append(
      el(
        "p",
        "ds-note",
        t("deckEditor.dialogs.keepContentNote"),
      ),
    );
    const preview = el("iframe");
    preview.title = t("deckEditor.dialogs.afterPreview");
    preview.style.cssText = "width:100%;height:380px;border:0";
    preview.srcdoc = applyDeckEditOperations(connections.input.preview(), [
      replacement(connections.current, after),
    ]).html;
    box.append(preview);
    actions(box, t("deckEditor.dialogs.applyLayout"), () => {
      if (commit([replacement(connections.current, after)])) closeDialog();
    });
  }


  function insertionMenu() {
    connections.replaceTarget = null;
    const box = modal(t("deckEditor.dialogs.insert"));
    box.classList.add("ds-insert-dialog");
    const grid = el("div", "ds-insert-grid");
    box.append(grid);
    for (const [label, fn, glyph] of [
      [t("deckEditor.dialogs.text"), connections.input.addText, "text"],
      [t("deckEditor.dialogs.image"), connections.input.addImage, "image"],
      [t("deckEditor.dialogs.video"), connections.input.addVideo, "video"],
      [t("deckStudio.audio.insert"), connections.input.addAudio, "audio"],
      [t("deckEditor.dialogs.fromLink"), connections.input.addLink, "link"],
      [
        t("deckEditor.dialogs.square"),
        () => {
          const id = uid();
          insert(authorShape(id, "rectangle"), id);
        },
        "square",
      ],
      [
        t("deckEditor.dialogs.circle"),
        () => {
          const id = uid();
          insert(authorShape(id, "circle"), id);
        },
        "circle",
      ],
      [
        t("deckEditor.dialogs.line"),
        () => {
          const id = uid();
          insert(authorShape(id, "line"), id);
        },
        "line",
      ],
      [
        t("deckEditor.dialogs.arrow"),
        () => {
          const id = uid();
          insert(authorShape(id, "arrow"), id);
        },
        "arrow",
      ],
      [
        t("deckEditor.dialogs.table"),
        () => {
          const id = uid();
          insert(authorTable(id), id);
        },
        "table",
      ],
      [
        t("deckEditor.dialogs.chart"),
        () => {
          const id = uid();
          insert(authorChart(id), id);
        },
        "chart",
      ],
    ] satisfies [string, () => void, DeckIcon][]) {
      grid.append(
        styleDeckButton(
          button(
            label,
            () => {
              closeDialog();
              run(fn);
            },
            "ds-insert-card",
          ),
          glyph,
        ),
      );
    }
    const row = el("div", "ds-dialog-actions");
    row.append(button(t("deckEditor.dialogs.close"), closeDialog));
    box.append(row);
  }

  function documentMenu() {
    const box = modal(t("deckEditor.dialogs.documentSettings"));
    field(
      box,
      t("deckEditor.dialogs.documentName"),
      deckSourceSetting(connections.input.source(), "title") ?? t("deckEditor.dialogs.untitled"),
      (value) => {
        const before = deckSourceSetting(connections.input.source(), "title");
        commit(
          [
            {
              kind: "setting",
              target: "deck-document",
              name: "title",
              before,
              after: value.trim() || "無題の資料", // i18n-keep: 原稿に保存する題名の既定値 // i18n-keep: 原稿に保存する題名の既定値
            },
          ]
        );
      },
    );
    box.append(
      button(t("deckEditor.dialogs.sharing"), () => connections.input.openTools("sharing")),
      button(t("deckEditor.dialogs.history"), () => connections.input.openTools("history")),
      button(t("deckEditor.dialogs.thisChange"), () => { closeDialog(); const root = connections.input.screen.getRootNode(); if (root instanceof ShadowRoot) openAgentReview(root, connections.input.pageSlug); }),
      button(t("deckEditor.dialogs.exportDraft"), connections.input.exportDraft),
      button(t("deckEditor.dialogs.exportHtml"), () => {
        const link = el("a"),
          url = URL.createObjectURL(
            new Blob([connections.input.source()], { type: "text/html" }),
          );
        link.href = url;
        link.download = t("deckEditor.dialogs.htmlFile");
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }),
    );
    const row = el("div", "ds-dialog-actions");
    row.append(button(t("deckEditor.dialogs.close"), closeDialog));
    box.append(row);
  }
  return {
    closeMenu,
    slideMenu,
    closeDialog,
    modal,
    actions,
    layouts,
    insertionMenu,
    documentMenu
  };
}
