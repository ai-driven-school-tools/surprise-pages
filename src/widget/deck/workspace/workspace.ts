import type {DeckLocalSourcePatch} from "../../../lib/deck/edit/local";
import {updateDeckSourceDocument,applyDeckLocalSourcePatch} from "../edit/source-document";
import { DECK_STYLE_OPTIONS as DECK_PRESETS } from "../../../lib/deck/design/style-options";
import { createWidgetLifetime } from "../../shared/widget-lifetime";
import {
  effectiveAppearance
} from "../../../lib/deck/design/design";
import { readDeckDesign } from "../../../lib/deck/design/dom";
import {
  DECK_NODE_MARK,
  deckEditOperationSchema,
  type DeckEditOperation
} from "../../../lib/deck/edit/model";
import {
  applyDeckEditOperations,
  cloneDeckFragment,
  deckSourceChildren,
  deckSourceFragment,
  deckOperationValue,
  inspectDeckEdit
} from "../../../lib/deck/edit/source";
import { isCollaborativeProperty } from "../../../lib/deck/edit/collaboration";
import { styleDeckButton, type DeckIcon } from "../ui";
import { createDeckWorkspaceData } from './data';
import { createDeckWorkspaceDesign } from './design';
import { createDeckWorkspaceDialogs } from './dialogs';
import { createDeckWorkspaceInspector } from './inspector';
import { createDeckWorkspaceNavigation } from './navigation';
import { createDeckLayerPanel } from "../edit/layer-panel";
import { ELEMENT_MENU_CSS, elementMenu, runElementMenuAction } from "../edit/element-menu";
import { DECK_WORKSPACE_STYLES } from "./styles";
import type { Input } from './types';
import { el } from "../../shared/util";
import { markDeferredWork } from "../deferred-work";
import { t } from "../../shared/i18n";
import { LocalizedError } from "../../../lib/i18n/errors";
import { deckErrorMessage } from "../../../lib/deck/edit/message";
const uid = () => `n-${crypto.randomUUID()}`;
const button = (label: string, fn: () => void, cls = "ds-button") => {
  const b = el("button", cls);
  b.type = "button";
  b.textContent = label;
  b.onclick = fn;
  // 押しボタンの字（その人の言語）から絵記号を引く。字は検査表と同じ辞書から採る
  const quiet: Record<string, DeckIcon> = {
    [t("deckEditor.inspector.bold")]: "bold",
    [t("deckEditor.inspector.italic")]: "italic",
    [t("deckEditor.inspector.bringForward")]: "front",
    [t("deckEditor.inspector.sendBackward")]: "back",
    [t("deckEditor.inspector.resetLayout")]: "reset",
    [t("deckEditor.inspector.duplicate")]: "copy",
    [t("deckEditor.inspector.delete")]: "trash",
    [t("deckEditor.inspector.lock")]: "lock",
    [t("deckEditor.navigation.fit")]: "fit",
    "−": "minus",
    "＋": "plus",
  };
  if (cls === "ds-button" && quiet[label])
    styleDeckButton(b, quiet[label], true);
  if (label === t("deckEditor.navigation.openNotes") || label === t("deckEditor.navigation.closeNotes")) {
    styleDeckButton(b, "notes", false, t("deckEditor.workspace.notes"));
    b.setAttribute("aria-pressed", String(label === t("deckEditor.navigation.closeNotes")));
  }
  return b;
};
const titleOf = (slide: Element) =>
  slide.querySelector("h1,h2,h3")?.textContent?.trim() || t("deckEditor.workspace.blank");
const parse = (html: string) =>
  new DOMParser().parseFromString(html, "text/html");
const elementIndexes = new WeakMap<Document, Map<string, HTMLElement>>();
const find = (doc: Document, id: string) => {
  let index = elementIndexes.get(doc);
  if (!index) {
    index = new Map([...doc.querySelectorAll<HTMLElement>(`[${DECK_NODE_MARK}]`)].map(n => [n.getAttribute(DECK_NODE_MARK)!, n]));
    elementIndexes.set(doc, index);
  }
  const cached = index.get(id);
  if (cached && doc.contains(cached)) return cached;
  const current = doc.querySelector<HTMLElement>(`[${DECK_NODE_MARK}="${CSS.escape(id)}"]`);
  if (current) index.set(id, current); else index.delete(id);
  return current ?? undefined;
};
const labelOf = (node: Element) =>
  node.hasAttribute("data-deck-youtube") ? t("deckEditor.workspace.youtube") :
  node.tagName === "FIGURE" && node.querySelector("[data-deck-sample-image]") ? node.querySelector("figcaption")?.textContent?.trim().slice(0,28) || t("deckEditor.workspace.sampleLayout") :
  node.hasAttribute("data-deck-sample-image") ? t("deckEditor.workspace.sampleImage") :
  node.getAttribute("data-deck-media-slot") === "image" ? t("deckEditor.workspace.image") :
  node.getAttribute("data-deck-media-slot") === "video" ? t("deckEditor.workspace.video") :
  node.tagName === "IMG"
    ? t("deckEditor.workspace.image")
    : node.tagName === "VIDEO"
      ? t("deckEditor.workspace.video")
      : node.hasAttribute("data-dd-chart")
        ? t("deckEditor.workspace.chart")
        : node.tagName === "TABLE"
          ? t("deckEditor.workspace.table")
          : node.hasAttribute("data-deck-shape")
            ? t("deckEditor.workspace.shape")
            : node.hasAttribute("data-deck-group")
              ? t("deckEditor.workspace.group")
              : node.textContent?.trim().slice(0, 28) || t("deckEditor.workspace.element");

export function createDeckWorkspace(input: Input) {
  const lifetime = createWidgetLifetime();
  const { screen } = input;
  let frame = input.frame;
  screen.classList.add("deck-studio");
  const style = el("style");
  style.textContent = DECK_WORKSPACE_STYLES + ELEMENT_MENU_CSS;
  screen.append(style);
  const root = el("div", "ds-workspace"),
    nav = el("nav", "ds-nav"),
    stage = el("div", "ds-stage"),
    inspector = el("aside", "ds-inspector"),
    footer = el("footer", "ds-footer");
  nav.setAttribute("aria-label", t("deckEditor.workspace.outline"));
  inspector.setAttribute("aria-label", t("deckEditor.workspace.inspector"));
  const notes = el("div", "ds-notes");
  notes.hidden = true;
  const empty = el("div", "ds-empty");
  empty.hidden = true;
  empty.append(
    Object.assign(el("p", "ds-note"), { className: "ds-empty-theme" }),
    el("p", undefined, t("deckEditor.workspace.emptyTitle")),
    button(t("deckEditor.workspace.addFirst"), () => dialogsFeature.layouts(false), "ds-button ds-primary"),
  );
  stage.append(frame, empty, notes);
  // 右の欄の下端に固定する「レイヤー」の一覧（../edit/layer-panel.ts）。設定を描き直しても一覧は作り直さない
  const layerDock = el("section");
  root.append(nav, stage, inspector, layerDock);
  screen.append(root, footer);
  let mediaControl: HTMLElement | null = null;
  let closeMedia = () => {};
  let closeImages = () => {};
  let current = "",
    selection: string[] = [],
    chosenSlides: string[] = [],
    zoom: number | null = null,
    design = false,
    navMode: "slides" | "elements" = "slides";
  let restoringSelection = false;
  let pendingSelection = false;
  let pendingContentRefresh = false;
  let pendingNavRefresh = false;
  let displayGeneration = 0;
  let attached: Document | null = null,
    observer: ResizeObserver | null = null;
  let resizeFrame: number | undefined;
  let fingerprint = "",
    renderTimer: number | undefined;
  let clipboard: { html: string; id: string }[] = [];
  let parsedSource: { html: string; doc: Document } | null = null;
  const sourceDoc = () => { const html = input.source(); if (parsedSource?.html !== html) parsedSource = { html, doc: parsedSource ? updateDeckSourceDocument(parsedSource.html,html,parsedSource.doc,parse) : parse(html) }; return parsedSource.doc; };
  let indexedSource: Document | null = null;
  let indexedHtml = "";
  let indexedSlides: HTMLElement[] = [];
  const sourceSlides = () => {
    const doc = sourceDoc();
    if (indexedSource !== doc || indexedHtml !== input.source()) { indexedSource = doc; indexedHtml = input.source(); indexedSlides = [...doc.querySelectorAll<HTMLElement>("section[data-deck-slide]")]; }
    return indexedSlides;
  };
  const sourceSelected = () => {
    const doc = sourceDoc();
    return selection.flatMap((id) => {
      const n = find(doc, id);
      return n ? [n] : [];
    });
  };
  const run = (fn: () => void) => {
    try {
      fn();
    } catch (error) {
      input.fail(
        error instanceof Error ? deckErrorMessage(error, t) : t("deckEditor.workspace.operationFailed"),
      );
    }
  };
  const dialogsFeature = createDeckWorkspaceDialogs({
    get openMenu() { return openMenu; },
    set openMenu(value) { openMenu = value; },
    get menuTrigger() { return menuTrigger; },
    set menuTrigger(value) { menuTrigger = value; },
    get tip() { return tip; },
    get slideCommands() { return navigationFeature.slideCommands; },
    get button() { return button; },
    get chosenSlides() { return chosenSlides; },
    set chosenSlides(value) { chosenSlides = value; },
    get screen() { return screen; },
    get disposeLibrary() { return disposeLibrary; },
    set disposeLibrary(value) { disposeLibrary = value; },
    get run() { return run; },
    get sourceDoc() { return sourceDoc; },
    get uid() { return uid; },
    get input() { return input; },
    get current() { return current; },
    set current(value) { current = value; },
    get selection() { return selection; },
    set selection(value) { selection = value; },
    get commit() { return commit; },
    get parse() { return parse; },
    get thumbnail() { return navigationFeature.thumbnail; },
    get find() { return find; },
    get titleOf() { return titleOf; },
    get replacement() { return replacement; },
    get replaceTarget() { return replaceTarget; },
    set replaceTarget(value) { replaceTarget = value; },
    get insert() { return insert; },
    get field() { return inspectorFeature.field; }
  });

  const navigationFeature = createDeckWorkspaceNavigation({
    get run() { return run; },
    get input() { return input; },
    get chosenSlides() { return chosenSlides; },
    set chosenSlides(value) { chosenSlides = value; },
    get commit() { return commit; },
    get uid() { return uid; },
    get sourceDoc() { return sourceDoc; },
    get parse() { return parse; },
    get find() { return find; },
    get current() { return current; },
    set current(value) { current = value; },
    get selection() { return selection; },
    set selection(value) { selection = value; },
    get design() { return design; },
    set design(value) { design = value; },
    get navMode() { return navMode; },
    set navMode(value) { navMode = value; },
    get refreshInspector() { return inspectorFeature.refreshInspector; },
    get attached() { return attached; },
    set attached(value) { attached = value; },
    get empty() { return empty; },
    get screen() { return screen; },
    get frame() { return frame; },
    get zoom() { return zoom; },
    set zoom(value) { zoom = value; },
    get sourceSlides() { return sourceSlides; },
    get notes() { return notes; },
    get footer() { return footer; },
    get mediaControl() { return mediaControl; },
    get button() { return button; },
    get togglePanel() { return inspectorFeature.togglePanel; },
    get modal() { return dialogsFeature.modal; },
    get closeDialog() { return dialogsFeature.closeDialog; },
    get displayGeneration() { return displayGeneration; },
    get closeMenu() { return dialogsFeature.closeMenu; },
    get fingerprint() { return fingerprint; },
    set fingerprint(value) { fingerprint = value; },
    get nav() { return nav; },
    get layouts() { return dialogsFeature.layouts; },
    get slideMenu() { return dialogsFeature.slideMenu; },
    get labelOf() { return labelOf; },
    get titleOf() { return titleOf; }
  });

  const inspectorFeature = createDeckWorkspaceInspector({
    get input() { return input; },
    get selection() { return selection; },
    set selection(value) { selection = value; },
    get commit() { return commit; },
    get sourceSelected() { return sourceSelected; },
    get run() { return run; },
    get button() { return button; },
    get inspector() { return inspector; },
    get closeMedia() { return closeMedia; },
    get screen() { return screen; },
    get cropOriginal() { return cropOriginal; },
    set cropOriginal(value) { cropOriginal = value; },
    get design() { return design; },
    set design(value) { design = value; },
    get renderDesign() { return designFeature.renderDesign; },
    get labelOf() { return labelOf; },
    get current() { return current; },
    get find() { return find; },
    get sourceDoc() { return sourceDoc; },
    get layouts() { return dialogsFeature.layouts; },
    get attached() { return attached; },
    get replaceMedia() { return replaceMedia; },
    get dataEditor() { return dataFeature.dataEditor; },
    get distribute() { return distribute; },
    get groupSelection() { return groupSelection; },
    get ungroupSelection() { return ungroupSelection; },
    get elementCommand() { return elementCommand; },
    get refreshLayers() { return layers.refresh; }
  });

  const dataFeature = createDeckWorkspaceData({
    get input() { return input; },
    get modal() { return dialogsFeature.modal; },
    get selectField() { return inspectorFeature.selectField; },
    get field() { return inspectorFeature.field; },
    get button() { return button; },
    get actions() { return dialogsFeature.actions; },
    get parse() { return parse; },
    get commit() { return commit; },
    get closeDialog() { return dialogsFeature.closeDialog; }
  });

  const designFeature = createDeckWorkspaceDesign({
    get inspector() { return inspector; },
    get parse() { return parse; },
    get input() { return input; },
    get button() { return button; },
    get refreshInspector() { return inspectorFeature.refreshInspector; },
    get find() { return find; },
    get current() { return current; },
    get frame() { return frame; },
    get commit() { return commit; },
    get selectField() { return inspectorFeature.selectField; },
    get run() { return run; },
    get sourceDoc() { return sourceDoc; },
    get field() { return inspectorFeature.field; }
  });

  const layers = createDeckLayerPanel({
    dock: layerDock,
    signal: lifetime.signal,
    slide: () => (attached && current ? find(attached, current) ?? null : null),
    hidden: () => design || !current,
    source: () => input.source(),
    labelOf,
    selection: () => selection,
    select: (ids) => {
      // 一覧で選んでも焦点は一覧に残す（キャンバスは選ぶと枠の文書へ焦点を移す）
      const active = focused();
      input.canvas()?.select(ids);
      if (active instanceof HTMLElement && active.isConnected) active.focus({ preventScroll: true });
    },
    hover: (id) => input.canvas()?.hover(id),
    commit,
    sourceNode: (id) => find(sourceDoc(), id),
    menu: (x, y) => openElementMenu({ x, y }),
    command: (command) => {
      if (command === "cut") { elementCommand("copy"); elementCommand("delete"); }
      else elementCommand(command);
    },
    message: (text) => input.fail(text),
  });

  function commit(ops: DeckEditOperation[]): boolean {
    return input.commit(ops);
  }
  function replacement(id: string, after: string | null): DeckEditOperation {
    const before = deckSourceFragment(input.source(), id);
    if (!before?.parentId) throw new LocalizedError("deckEditor.workspace.notDirectlyEditable");
    return {
      kind: "fragment",
      target: id,
      parentId: before.parentId,
      beforeId: before.beforeId,
      before: before.html,
      after,
    };
  }
  function insert(html: string, id: string) {
    if (!current) return;
    const node = parse(html).body.firstElementChild;
    if (node instanceof HTMLElement && node.matches("table,figure")) {
      Object.assign(node.style, {
        position: "absolute",
        left: "96px",
        top: "180px",
        width: "1088px",
      });
      html = node.outerHTML;
    }
    selection = [id];
    commit(
      [
        {
          kind: "fragment",
          target: id,
          parentId: current,
          beforeId: null,
          before: null,
          after: html,
        },
      ]
    );
  }
  let openMenu: HTMLElement | null = null,
    menuTrigger: HTMLButtonElement | null = null;
  const tip = el("div", "ds-tooltip");
  tip.hidden = true;
  tip.setAttribute("role", "tooltip");
  screen.append(tip);
  const showTip = (event: Event) => {
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-tooltip]")
        : null;
    // 空の data-tooltip は「ここでは出さない」の印（行の中の継ぎ目・開閉が、行の題を被せないため）。
    if (!target || !target.dataset.tooltip || openMenu || target.hasAttribute("disabled")) {
      tip.hidden = true;
      return;
    }
    tip.textContent = target.dataset.tooltip ?? "";
    tip.hidden = false;
    const r = target.getBoundingClientRect(),
      w = tip.offsetWidth;
    tip.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8))}px`;
    tip.style.top = `${r.bottom + tip.offsetHeight + 8 > window.innerHeight ? r.top - tip.offsetHeight - 6 : r.bottom + 6}px`;
  };
  screen.addEventListener("pointerover", showTip, { signal: lifetime.signal });
  screen.addEventListener("focusin", showTip, { signal: lifetime.signal });
  screen.addEventListener("pointerout", () => {
    tip.hidden = true;
  }, { signal: lifetime.signal });
  screen.addEventListener("focusout", () => {
    tip.hidden = true;
  }, { signal: lifetime.signal });
  screen.addEventListener("pointerdown", (event) => {
    if (
      openMenu &&
      event.target instanceof Node &&
      !openMenu.contains(event.target) &&
      !menuTrigger?.contains(event.target)
    )
      dialogsFeature.closeMenu();
  }, { signal: lifetime.signal });
  let disposeLibrary: (() => void) | null = null;
  /** 要素の操作のメニュー（../edit/element-menu.ts）。キャンバスとレイヤーの一覧の右クリックから。at は画面の座標 */
  function openElementMenu(at: { x: number; y: number }) {
    dialogsFeature.closeMenu();
    tip.hidden = true;
    const chosen = sourceSelected();
    elementMenu({
      screen, at, button,
      state: { count: selection.length, locked: chosen.some((node) => node.closest("[data-deck-locked]")), grouped: chosen.length === 1 && chosen[0].hasAttribute("data-deck-group"), canPaste: clipboard.length > 0 },
      close: (restore) => { const menu = openMenu; openMenu = null; menu?.remove(); if (restore) frame.contentWindow?.focus(); },
      opened: (menu) => { openMenu = menu; menuTrigger = null; },
      run: (action) => runElementMenuAction(action, {
        command: (command) => {
          if (command === "cut") { elementCommand("copy"); elementCommand("delete"); }
          else if (command === "group") groupSelection();
          else if (command === "ungroup") ungroupSelection();
          else elementCommand(command);
        },
        align: (mode) => input.canvas()?.align(mode),
        distribute,
        reorder: (direction) => inspectorFeature.reorderLayers(direction),
        lock: (locked) => {
          commit(sourceSelected().map((node): DeckEditOperation => ({ kind: "attribute", target: node.getAttribute(DECK_NODE_MARK) ?? "", name: "data-deck-locked", before: node.getAttribute("data-deck-locked"), after: locked ? "true" : null })));
        },
        selectAll: () => input.canvas()?.selectAll(),
      }),
    });
  }
  function distribute(vertical: boolean) {
    if (!attached || selection.length < 3) return;
    const targets = selection
      .flatMap((id) => {
        const n = find(attached!, id);
        return n ? [n] : [];
      })
      .sort((a, b) =>
        vertical
          ? a.getBoundingClientRect().top - b.getBoundingClientRect().top
          : a.getBoundingClientRect().left - b.getBoundingClientRect().left,
      );
    const start = targets[0].getBoundingClientRect(),
      end = targets.at(-1)!.getBoundingClientRect(),
      scale =
        (targets[0].closest("section")?.getBoundingClientRect().width ?? 1280) /
        1280,
      total = targets.reduce(
        (sum, n) =>
          sum +
          (vertical
            ? n.getBoundingClientRect().height
            : n.getBoundingClientRect().width),
        0,
      ),
      gap =
        ((vertical ? end.bottom - start.top : end.right - start.left) - total) /
        (targets.length - 1);
    let at = vertical ? start.top : start.left;
    const ops: DeckEditOperation[] = [];
    for (const n of targets) {
      const box = n.getBoundingClientRect(),
        id = n.getAttribute(DECK_NODE_MARK)!,
        source = find(sourceDoc(), id),
        before = source?.style.translate || null,
        parts = (before ?? "0 0").split(/\s+/).map(parseFloat),
        delta = (at - (vertical ? box.top : box.left)) / scale;
      ops.push({
        kind: "style",
        target: id,
        property: "translate",
        before,
        after: `${(parts[0] || 0) + (vertical ? 0 : delta)}px ${(parts[1] || 0) + (vertical ? delta : 0)}px`,
      });
      at += (vertical ? box.height : box.width) + gap;
    }
    commit(ops);
  }
  function groupSelection() {
    run(() => {
      const doc = sourceDoc(),
        nodes = selection.flatMap((id) => {
          const n = find(doc, id);
          return n ? [n] : [];
        });
      if (nodes.length < 2) return;
      const parent = nodes[0].parentElement;
      if (!parent || nodes.some((n) => n.parentElement !== parent))
        throw new LocalizedError("deckEditor.workspace.sameGroup");
      const id = uid(),
        parentId = parent.matches("section[data-deck-slide]")
          ? current
          : parent.getAttribute(DECK_NODE_MARK);
      if (!parentId) return;
      const ordered = [...parent.children].filter((n) =>
        nodes.some((node) => node === n),
      );
      const first = deckSourceFragment(
        input.source(),
        ordered[0].getAttribute(DECK_NODE_MARK)!,
      )!;
      // A display:contents group retains the existing layout. Canvas moves its members together.
      const content = ordered
        .map(
          (n) =>
            deckSourceFragment(input.source(), n.getAttribute(DECK_NODE_MARK)!)!
              .html,
        )
        .join("");
      const html = `<div data-deck-node="${id}" data-deck-group="true" style="display:contents">${content}</div>`;
      const ops: DeckEditOperation[] = ordered
        .slice(1)
        .reverse()
        .map((n) => replacement(n.getAttribute(DECK_NODE_MARK)!, null));
      ops.push(
        {
          kind: "fragment",
          target: ordered[0].getAttribute(DECK_NODE_MARK)!,
          parentId: first.parentId,
          beforeId: first.beforeId,
          before: first.html,
          after: null,
        },
        {
          kind: "fragment",
          target: id,
          parentId,
          beforeId:
            deckSourceChildren(input.source(), parentId).find(
              (x) =>
                !selection.includes(x) &&
                deckSourceChildren(input.source(), parentId).indexOf(x) >
                deckSourceChildren(input.source(), parentId).indexOf(
                  selection[0],
                ),
            ) ?? null,
          before: null,
          after: html,
        },
      );
      selection = [id];
      commit(ops);
    });
  }
  function ungroupSelection() {
    run(() => {
      const id = selection[0],
        part = deckSourceFragment(input.source(), id);
      if (!part) return;
      const node = find(sourceDoc(), id);
      if (!node) return;
      const ops: DeckEditOperation[] = [replacement(id, null)];
      for (const child of [...node.children]) {
        const childId = child.getAttribute(DECK_NODE_MARK);
        if (!childId) continue;
        const raw = deckSourceFragment(input.source(), childId)!;
        ops.push({
          kind: "fragment",
          target: childId,
          parentId: part.parentId,
          beforeId: part.beforeId,
          before: null,
          after: raw.html,
        });
      }
      selection = [];
      commit(ops);
    });
  }
  function elementCommand(command: string) {
    run(() => {
      if (command === "copy") {
        clipboard = selection.flatMap((id) => {
          const part = deckSourceFragment(input.source(), id);
          return part ? [{ id, html: part.html }] : [];
        });
        return;
      }
      if (command === "paste" || command === "duplicate") {
        if (command === "duplicate") elementCommand("copy");
        const ops: DeckEditOperation[] = [],
          selected: string[] = [];
        for (const item of clipboard) {
          const cloned = cloneDeckFragment(item.html, uid()),
            id = cloned.ids[item.id];
          ops.push({
            kind: "fragment",
            target: id,
            parentId: current,
            beforeId: null,
            before: null,
            after: cloned.html,
          });
          selected.push(id);
        }
        selection = selected;
        commit(ops);
        return;
      }
      if (command === "delete") {
        const ops = selection.map((id) => replacement(id, null));
        selection = [];
        commit(ops);
      }
    });
  }
  let replaceTarget: { id: string; type: "image" | "video" } | null = null;
  let cropOriginal: { id: string; style: Record<string, string> } | null = null;
  function replaceMedia(type: "image" | "video") {
    replaceTarget = { id: selection[0], type };
    if(type === "image")input.openImages(true);
    else input.addVideo();
  }
  /** The slide the canvas shows: the current one, else the linked target, else the first. */
  function settleCurrent(): string {
    const slides = sourceSlides();
    if (!slides.some((n) => n.getAttribute(DECK_NODE_MARK) === current))
      current = slides.find(slide => slide.getAttribute(DECK_NODE_MARK) === new URL(location.href).searchParams.get("target"))?.getAttribute(DECK_NODE_MARK) ?? slides[0]?.getAttribute(DECK_NODE_MARK) ?? "";
    return current;
  }
  function attach(doc: Document, nextFrame = frame) {
    frame = nextFrame;
    attached = doc;
    displayGeneration++;
    observer?.disconnect();
    if (resizeFrame !== undefined) { cancelAnimationFrame(resizeFrame); resizeFrame = undefined; }
    const css = doc.createElement("style");
    css.setAttribute("data-deck-canvas-chrome", "");
    css.textContent = `html:not([data-deck-mode="present"]),html:not([data-deck-mode="present"]) body{width:100%!important;height:100%!important;margin:0!important;padding:0!important;max-width:none!important;overflow:auto!important;background:var(--studio-desk,var(--deck-surface))!important}html:not([data-deck-mode="present"]) [data-deck-toolbar],html:not([data-deck-mode="present"]) [data-deck-exit],html:not([data-deck-mode="present"]) aside[data-deck-notes],html:not([data-deck-mode="present"]) [data-deck-focus-supplement],html:not([data-deck-mode="present"]) [data-deck-focus-supplements],html:not([data-deck-mode="present"]) [data-deck-focus-supplement-pages]{display:none!important}html:not([data-deck-mode="present"]) main[data-deck-slides]{display:flex!important;align-items:center!important;justify-content:center!important;min-width:calc(var(--studio-w) + 64px)!important;min-height:100%!important;width:100%!important;padding:32px!important;gap:0!important;margin:0!important;box-sizing:border-box!important}html:not([data-deck-mode="present"]) [data-deck-frame]{display:none!important}html:not([data-deck-mode="present"]) [data-deck-frame][data-studio-active]{display:block!important;flex:none!important;width:var(--studio-w)!important;height:var(--studio-h)!important;margin:0!important;padding:0!important;max-width:none!important}html:not([data-deck-mode="present"]) [data-deck-stage]{width:1280px!important;height:720px!important;transform:scale(var(--studio-scale))!important;transform-origin:top left!important;margin:0!important}html:not([data-deck-mode="present"]) [data-deck-stage]>section[data-deck-slide]{width:1280px!important;height:720px!important;transform:none!important;margin:0!important}html:not([data-deck-mode="present"]) [data-deck-stage]::after{display:none!important}html:not([data-deck-mode="present"]) main[data-deck-slides]>section{display:none!important}html:not([data-deck-mode="present"]) main[data-deck-slides]>section[data-studio-active]{display:block!important;flex:none!important;width:1280px!important;height:720px!important;transform:scale(var(--studio-scale))!important;transform-origin:center!important}html[data-deck-mode="present"] [data-deck-canvas-chrome]{display:none!important}`;
    doc.head.append(css);
    doc.querySelector("[data-deck-preview-containment]")?.remove();
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        // Writing layout during resize delivery can trigger another observation
        // in the same frame (WebKit reports an undelivered-notification loop).
        if (resizeFrame !== undefined) return;
        resizeFrame = requestAnimationFrame(() => {
          resizeFrame = undefined;
          if (attached !== doc || !frame.isConnected) return;
          navigationFeature.fit();
          navigationFeature.renderFooter();
        });
      });
      observer.observe(frame);
    }
    settleCurrent();
    if (!chosenSlides.length && current) chosenSlides = [current];
    navigationFeature.showCurrent();
    navigationFeature.renderNav();
    inspectorFeature.refreshInspector();
    navigationFeature.renderNotes();
    if (navigationFeature.pendingNavFocus) {
      navigationFeature.pendingNavFocus = false;
      nav
        .querySelector<HTMLButtonElement>('.ds-slide[aria-selected="true"]')
        ?.focus({ preventScroll: true });
    }
    if (selection.length) {
      restoringSelection = true;
      input.canvas()?.select(selection);
      restoringSelection = false;
    }
    inspectorFeature.refreshInspector();
  }
  function selectionChanged(ids: string[]) {
    dialogsFeature.closeMenu();
    tip.hidden = true;
    selection = ids;
    if (!restoringSelection) design = false;
    inspectorFeature.refreshInspector();
  }
  const focused = () => { const root = screen.getRootNode(); return root instanceof ShadowRoot ? root.activeElement : document.activeElement; };
  function syncAppearanceControls(): boolean {
    if (!design || designFeature.designPanel !== "appearance" || !inspector.querySelector(".ds-preset-grid")) return false;
    const value = readDeckDesign(sourceDoc()); if (!value) return false;
    const key = designFeature.scope === "slide" ? find(sourceDoc(), current)?.getAttribute("data-deck-id") ?? undefined : undefined;
    const appearance = effectiveAppearance(value.design, value.overrides, key);
    inspector.querySelectorAll(".ds-preset").forEach((button, index) => button.setAttribute("aria-pressed", String(JSON.stringify(Object.entries(appearance).sort()) === JSON.stringify(Object.entries(DECK_PRESETS[index].appearance).sort()))));
    const colors = [...inspector.querySelectorAll<HTMLInputElement>(".ds-field input[type=color]")];
    for (const field of inspector.querySelectorAll(".ds-field")) {
      const control = field.querySelector("input,select");
      if ((control instanceof HTMLInputElement || control instanceof HTMLSelectElement) && control !== focused()) {
        // 字面（言語で変わる）ではなく部品の形で見分ける。色の欄は背景色・強調色の順、あしらいは値の選択肢で分かる
        if (control instanceof HTMLInputElement && control.type === "color") control.value = colors.indexOf(control) === 0 ? appearance.background : colors.indexOf(control) === 1 ? appearance.accent : control.value;
        if (control instanceof HTMLSelectElement && control.querySelector('option[value="gradient"]')) control.value = appearance.decoration;
      }
    }
    return true;
  }
  function contentChanged() {
    if (input.canvas()?.isInteracting()) { pendingContentRefresh=true;return; }
    pendingContentRefresh=false;
    pendingNavRefresh=false;
    const ids = new Set(sourceSlides().map(n => n.getAttribute(DECK_NODE_MARK)!));
    chosenSlides = chosenSlides.filter(id => ids.has(id));
    navigationFeature.showCurrent(true); navigationFeature.renderNav();
    const selectionChanged=JSON.stringify(input.canvas()?.selection()) !== JSON.stringify(selection);
    if (pendingSelection || selectionChanged) { pendingSelection = false; if(selectionChanged)input.canvas()?.select(selection); }
    const active = focused();
    if (!syncAppearanceControls() && !(inspector.contains(active) && (active instanceof HTMLInputElement || active instanceof HTMLSelectElement || active instanceof HTMLTextAreaElement))) inspectorFeature.refreshInspector();
    if (!notes.contains(focused())) navigationFeature.renderNotes();
  }
  function refresh() {
    // 直接当てた変更（取り消し・やり直しを含む）でも重なり順と固定の印を描き直す
    layers.refresh();
    if(input.canvas()?.isInteracting()){pendingNavRefresh=true;return;}
    if (renderTimer) return;
    renderTimer = lifetime.timeout(() => {
      renderTimer = undefined;
      try {
        if(input.canvas()?.isInteracting()){pendingNavRefresh=true;return;}
        pendingNavRefresh=false;
        const html = input.source();
        if (fingerprint !== html) {
          fingerprint = html;
          navigationFeature.renderNav();
        }
        navigationFeature.renderFooter();
      } finally { markDeferredWork(root, false); }
    }, 250);
    if (renderTimer) markDeferredWork(root, true);
  }
  const scheme = window.matchMedia?.("(prefers-color-scheme: dark)");
  scheme?.addEventListener("change", navigationFeature.fit, { signal: lifetime.signal });
  return {
    root,
    adoptLocalSource(patch:DeckLocalSourcePatch){
      if(parsedSource?.html===patch.before&&input.source()===patch.after&&applyDeckLocalSourcePatch(patch,parsedSource.doc,parse))parsedSource={html:patch.after,doc:parsedSource.doc};
    },
    resumeUpdates() { if(pendingContentRefresh)contentChanged();else if(pendingNavRefresh)refresh(); },
    mountMedia(panel: HTMLElement, control: HTMLElement, close:()=>void) {
      mediaControl=control;closeMedia=close;root.append(panel);navigationFeature.renderFooter();
    },
    mountImages(panel:HTMLElement,close:()=>void){closeImages=close;root.append(panel);},
    setImagesOpen(open:boolean){
      if(open&&input.canvas()&&!input.canvas()!.flush())return false;
      if(open)closeMedia();screen.toggleAttribute("data-images-open",open);if(open)screen.removeAttribute("data-panel");
      requestAnimationFrame(()=>{if(screen.isConnected)navigationFeature.fit();});return true;
    },
    setMediaOpen(open:boolean) {
      if(open && input.canvas() && !input.canvas()!.flush())return false;
      if(open)closeImages();
      screen.toggleAttribute("data-media-open",open);
      if(open)screen.removeAttribute("data-panel");
      requestAnimationFrame(()=>{if(screen.isConnected)navigationFeature.fit();});return true;
    },
    busy: () => designFeature.specialty?.busy() ?? false,
    stage,
    inspector,
    attach,
    shownSlide: settleCurrent,
    selectionChanged,
    refresh,
    contentChanged,
    currentSlide: () => current || null,
    hasSlides: () => attached ? Boolean(attached.querySelector("section[data-deck-slide]")) : sourceSlides().length > 0,
    insertionMenu: dialogsFeature.insertionMenu,
    documentMenu: dialogsFeature.documentMenu,
    design() {
      closeMedia();closeImages();
      design = !design;
      inspectorFeature.refreshInspector();
    },
    startCrop: inspectorFeature.startCrop,
    editComplex(id: string) {
      const node = find(sourceDoc(), id);
      if (node) run(() => dataFeature.dataEditor(node));
    },
    elementCommand,
    /** キャンバスの右クリック。point は枠の中の座標なので、画面の座標へ直して出す */
    elementMenuAt(point: { x: number; y: number }) {
      const box = frame.getBoundingClientRect();
      openElementMenu({ x: box.left + point.x, y: box.top + point.y });
    },
    rememberSelection(ids: string[]) {
      selection = ids; pendingSelection = true;
    },
    replaceTarget: () => replaceTarget,
    clearReplaceTarget: () => {
      replaceTarget = null;
    },
    setBusy(busy: boolean) {
      root.setAttribute("aria-busy", String(busy));
      for (const control of [
        ...nav.querySelectorAll("button"),
        ...inspector.querySelectorAll("button,input,select,textarea"),
      ]) {
        if (
          control instanceof HTMLButtonElement ||
          control instanceof HTMLInputElement ||
          control instanceof HTMLSelectElement ||
          control instanceof HTMLTextAreaElement
        )
          control.disabled = busy;
      }
    },
    confirmClose(close: () => void) {
      const box = dialogsFeature.modal(t("deckEditor.workspace.unsavedTitle"));
      box.append(
        el(
          "p",
          "ds-note",
          t("deckEditor.workspace.unsavedNote"),
        ),
      );
      dialogsFeature.actions(box, t("deckEditor.workspace.closeKeepDraft"), () => {
        dialogsFeature.closeDialog();
        close();
      });
      const wait = box.querySelector("button");
      if (wait) wait.textContent = t("deckEditor.workspace.waitForSave");
    },
    recovery(
      latest: string,
      ops: readonly DeckEditOperation[],
      resolve: (operations: DeckEditOperation[]) => void,
    ) {
      const box = dialogsFeature.modal(t("deckEditor.workspace.recoverTitle"));
      box.append(
        el(
          "p",
          "ds-note",
          t("deckEditor.workspace.recoverNote"),
        ),
      );
      const area = el("textarea");
      area.style.cssText = "width:100%;min-height:160px";
      area.readOnly = true;
      const operationLabel = (op: DeckEditOperation) =>
        op.kind === "order" || op.kind === "move" || op.kind === "outline-move"
          ? t("deckEditor.workspace.opOrder")
          : op.kind === "setting"
            ? t("deckEditor.workspace.opSetting")
            : op.kind === "style"
              ? t("deckEditor.workspace.opStyle",{value:op.after??t("deckEditor.workspace.opStyleDefault")})
              : op.kind === "fragment"
                ? t("deckEditor.workspace.opStructure")
                : op.kind === "image"
                  ? t("deckEditor.workspace.opImage")
                  : t("deckEditor.workspace.opElement");
      area.value = ops
        .map((op) => (op.kind === "text" ? op.after : operationLabel(op)))
        .join("\n\n");
      area.setAttribute("aria-label", t("deckEditor.workspace.mineCopyable"));
      box.append(el("h3", undefined, t("deckEditor.workspace.mine")));
      box.append(area);
      const local: DeckEditOperation[] = [];
      let temp = latest;
      for (const op of ops) {
        try {
          const rebased =
            op.kind === "text"
              ? {
                ...op,
                before:
                  inspectDeckEdit(temp).nodes.find((n) => n.id === op.target)
                    ?.textRuns[op.run]?.text ?? op.before,
              }
              : isCollaborativeProperty(op)
                ? deckEditOperationSchema.parse({...op,before:deckOperationValue(temp,op)})
                : op;
          const result = applyDeckEditOperations(temp, [rebased]);
          temp = result.html;
          local.push(rebased);
        } catch {
          box.append(
            el(
              "p",
              "ds-note",
              t("deckEditor.workspace.missingTargets"),
            ),
          );
        }
      }
      const latestArea = el("textarea");
      latestArea.readOnly = true;
      latestArea.style.cssText = "width:100%;min-height:120px";
      latestArea.setAttribute("aria-label", t("deckEditor.workspace.latestContent"));
      const latestNodes = inspectDeckEdit(latest).nodes;
      latestArea.value = ops
        .map((op) =>
          op.kind === "text"
            ? (latestNodes.find((n) => n.id === op.target)?.textRuns[op.run]
              ?.text ?? t("deckEditor.workspace.targetGone"))
            : t("deckEditor.workspace.notAutoApplied",{operation:operationLabel(op)}),
        )
        .join("\n\n");
      box.append(el("h3", undefined, t("deckEditor.workspace.latestSamePart")), latestArea);
      const row = el("div", "ds-dialog-actions");
      row.append(
        button(t("deckEditor.workspace.close"), dialogsFeature.closeDialog),
        button(t("deckEditor.workspace.useLatest"), () => {
          resolve([]);
          dialogsFeature.closeDialog();
        }),
      );
      if (ops.every((op) => op.kind === "text") && local.length === ops.length)
        row.append(
          button(
            t("deckEditor.workspace.applyMine"),
            () => {
              resolve(local);
              dialogsFeature.closeDialog();
            },
            "ds-button ds-primary",
          ),
        );
      box.append(row);
    },
    dispose() {
      lifetime.dispose();
      navigationFeature.dispose();
      scheme?.removeEventListener("change", navigationFeature.fit);
      observer?.disconnect();
      if (resizeFrame !== undefined) { cancelAnimationFrame(resizeFrame); resizeFrame = undefined; }
      if (renderTimer) lifetime.clearTimeout(renderTimer);
      markDeferredWork(root, false);
      dialogsFeature.closeDialog();
      dialogsFeature.closeMenu();
    },
  };
}
