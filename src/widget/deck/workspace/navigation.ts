import {createDeckOutlineDrag} from "../edit/outline-drag";
import { outlineBranch, outlineRoots, moveOutline, DECK_PARENT } from "../../../lib/deck/outline";
import { DECK_SKIP } from "../../../lib/deck/deck";
import { navigationRuntime } from "../../../lib/deck/preview.generated";
import { documentThemeName } from "../../../lib/deck/design/theme-source";
import {
  effectiveAppearance
} from "../../../lib/deck/design/design";
import { readDeckDesign } from "../../../lib/deck/design/dom";
import {
  DECK_NODE_MARK,
  type DeckEditOperation
} from "../../../lib/deck/edit/model";
import {
  applyDeckEditOperations,
  cloneDeckFragment,
  deckSourceAfterInsertions,
  deckSourceIndexed,
  deckSourceOutline,
  readDeckSourceInSlices,
  deckSourceFragment,
  deckSourceSetting,
  inspectDeckEdit,
  remapDeckReferences,
} from "../../../lib/deck/edit/source";
import { deckFocusSchema } from "../../../lib/deck/design/focus";
import { createDeckThumbnails } from "../edit/thumbnails";
import { deckIcon, styleDeckButton } from "../ui";
import type { DeckInsertion, Input } from './types';
import { el } from "../../shared/util";
import { t } from "../../shared/i18n";
import { LocalizedError } from "../../../lib/i18n/errors";
import { deckErrorMessage } from "../../../lib/deck/edit/message";

/** 一覧の枚の ⌘C・⌘X・⌘V。 */
const SLIDE_CLIPBOARD_KEYS = new Map<string, "copy" | "cut" | "paste">([["c", "copy"], ["x", "cut"], ["v", "paste"]]);

/** Owns navigation behavior; receives only its required page/editor connections. */
type Host = {
  run: (fn: () => void) => void;
  input: Input;
  chosenSlides: string[];
  commit: (ops: DeckEditOperation[]) => boolean;
  uid: () => string;
  sourceDoc: () => Document;
  parse: (html: string) => Document;
  find: (doc: Document, id: string) => HTMLElement | undefined;
  current: string;
  selection: string[];
  design: boolean;
  navMode: "slides" | "elements";
  refreshInspector: () => void;
  attached: Document | null;
  empty: HTMLDivElement;
  screen: HTMLElement;
  frame: HTMLIFrameElement;
  zoom: number | null;
  sourceSlides: () => HTMLElement[];
  notes: HTMLDivElement;
  footer: HTMLElement;
  mediaControl:HTMLElement|null;
  button: (label: string, fn: () => void, cls?: string) => HTMLButtonElement;
  togglePanel: (name: string) => void;
  modal: (title: string) => HTMLElement;
  closeDialog: () => void;
  displayGeneration: number;
  closeMenu: (restore?: boolean) => void;
  fingerprint: string;
  nav: HTMLElement;
  layouts: (replace: boolean, at?: DeckInsertion) => void;
  slideMenu: (trigger: HTMLButtonElement) => void;
  labelOf: (node: Element) => string;
  titleOf: (slide: Element) => string;
  /** 一覧で選んだ枚のコピー・カット・貼り付け（src/widget/deck/workspace/clipboard.ts）。 */
  slideClipboard: (command: "copy" | "cut" | "paste") => void;
};

export function createDeckWorkspaceNavigation(connections: Host) {
  const run: Host['run'] = (...args) => connections.run(...args);
  const commit: Host['commit'] = (...args) => connections.commit(...args);
  const uid: Host['uid'] = (...args) => connections.uid(...args);
  const sourceDoc: Host['sourceDoc'] = (...args) => connections.sourceDoc(...args);
  const parse: Host['parse'] = (...args) => connections.parse(...args);
  const find: Host['find'] = (...args) => connections.find(...args);
  const refreshInspector: Host['refreshInspector'] = (...args) => connections.refreshInspector(...args);
  const sourceSlides: Host['sourceSlides'] = (...args) => connections.sourceSlides(...args);
  const button: Host['button'] = (...args) => connections.button(...args);
  const togglePanel: Host['togglePanel'] = (...args) => connections.togglePanel(...args);
  const modal: Host['modal'] = (...args) => connections.modal(...args);
  const closeDialog: Host['closeDialog'] = (...args) => connections.closeDialog(...args);
  const closeMenu: Host['closeMenu'] = (...args) => connections.closeMenu(...args);
  const layouts: Host['layouts'] = (...args) => connections.layouts(...args);
  const slideMenu: Host['slideMenu'] = (...args) => connections.slideMenu(...args);
  const labelOf: Host['labelOf'] = (...args) => connections.labelOf(...args);
  const titleOf: Host['titleOf'] = (...args) => connections.titleOf(...args);

  let pendingNavFocus = false;
  let footerFingerprint = "";
  let footerPosition: HTMLElement | null = null;
  let shownDocument: Document | null = null, shownSource = "";
  let visibleSlide: HTMLElement | undefined;
  let renderedSlides = new Map<string, HTMLElement>();
  const thumbnails = createDeckThumbnails(connections.nav, () => connections.attached, () => connections.input.canvas()?.isInteracting() ?? false);
  let builtNavMode: "slides" | "elements" | null = null;
  const slideRows = new Map<string, HTMLButtonElement>();

  const folded = new Set<string>();
  function moveSlides(target: string | null, placement: "before" | "after" | "inside") {
    let accepted=false;
    run(()=>{
      const before=deckSourceOutline(connections.input.source());
      const after=moveOutline(before,connections.chosenSlides,target,placement);
      accepted=JSON.stringify(before)===JSON.stringify(after)||commit([{kind:"outline-move",target:"deck-root",ids:[...connections.chosenSlides],anchor:target,placement}]);
    });
    return accepted;
  }
  const outlineDrag=createDeckOutlineDrag({screen:connections.screen,list:()=>connections.nav.querySelector(".ds-slide-list"),source:()=>deckSourceOutline(connections.input.source()),selected:()=>connections.chosenSlides,current:()=>connections.current,select:id=>selectSlide(id),restore:(ids,id)=>{connections.chosenSlides=ids;connections.current=id;showCurrent();syncNavSelection();},move:moveSlides,folded:id=>folded.has(id),unfold:id=>{if(folded.delete(id))renderNav();}});
  type SlideCommand = "copy" | "cut" | "paste" | "duplicate" | "delete" | "delete-only" | "delete-tree" | "up" | "down" | "skip" | "unskip" | "indent" | "outdent";
  // 300 枚の資料では、今の原稿全体の読み取りと、変更後の原稿の読み取りが、遅い端末でそれぞれ 100ms を超える。
  // 1 つの処理単位に積むと、その間の入力がまとめて止まる。大きな資料の枚の操作は「今の原稿の読み取り →
  // 変更の組み立て → 変更後の原稿の読み取り → 検証・設定と一覧の整合・反映」を別々の処理単位で行う。
  // 途中の段が残っている間に来た枚の操作は、その後ろに並べる（順番は変えない）。
  const slideSteps: (() => void | Promise<void>)[] = [];
  let slideStepsScheduled = false;
  function queueSlideStep(step: () => void | Promise<void>, continuation = false): void {
    if (continuation) slideSteps.unshift(step); else slideSteps.push(step);
    if (!slideStepsScheduled) { slideStepsScheduled = true; setTimeout(drainSlideSteps, 0); }
  }
  async function drainSlideSteps(): Promise<void> {
    try {
      const step = slideSteps.shift();
      if (!connections.attached) slideSteps.length = 0;
      else await step?.();
    } catch (error) {
      connections.input.fail(error instanceof Error ? deckErrorMessage(error, t) : t("deckEditor.navigation.operationFailed"));
    } finally {
      if (slideSteps.length) setTimeout(drainSlideSteps, 0); else slideStepsScheduled = false;
    }
  }
  const yieldToInput = () => new Promise<void>(resolve => setTimeout(resolve, 0));
  /** 読み取りだけの段。読み取りそのものも小分けにして、間の入力を先に通す。結果は手元に残るので、
   * 次の段では読み直さない（残っていなくても読み直すだけで、結果は同じ）。 */
  function readSourceStep(html: () => string): () => Promise<void> {
    return async () => { const value = html(); if (!deckSourceIndexed(value)) await readDeckSourceInSlices(value, yieldToInput); };
  }
  function slideCommands(action: SlideCommand) {
    if (action === "copy" || action === "cut" || action === "paste") { connections.slideClipboard(action); return; }
    if (!slideStepsScheduled && deckSourceIndexed(connections.input.source())) { runSlideCommand(action); return; }
    if (!slideStepsScheduled) queueSlideStep(readSourceStep(() => connections.input.source()));
    queueSlideStep(() => runSlideCommand(action));
  }
  function runSlideCommand(action: Exclude<SlideCommand, "copy" | "cut" | "paste">) {
    run(() => {
      const entries=deckSourceOutline(connections.input.source());
      const ids=entries.map(entry=>entry.id);
      const roots=outlineRoots(entries,connections.chosenSlides);
      const deleting=action==="delete"||action==="delete-only"||action==="delete-tree";
      // 枝の一覧は 1 度だけ求める（300 枚で枚ごとに求め直すと、それだけで遅い端末の入力を止める）。
      const branches=new Map(roots.map(root=>[root,outlineBranch(entries,root)]));
      const scope=new Set(action==="duplicate"||action==="delete-tree"?[...branches.values()].flat():connections.chosenSlides);
      const picked=ids.filter(id=>scope.has(id));
      if (!picked.length) return;
      if (action === "delete" && roots.some(id=>(branches.get(id)?.length??0)>1)) {
        const box=modal(t("deckEditor.navigation.hasChildren"));
        box.append(el("p",undefined,t("deckEditor.navigation.deleteOnlyNote")));
        box.append(button(t("deckEditor.navigation.deleteOnly"),()=>{closeDialog();slideCommands("delete-only");}),button(t("deckEditor.navigation.deleteTree"),()=>{closeDialog();slideCommands("delete-tree");}),button(t("deckEditor.navigation.cancel"),closeDialog));
        return;
      }
      pendingNavFocus = true;
      if(action==="indent"||action==="outdent"){
        const first=entries.find(entry=>entry.id===roots[0]);if(!first)return;
        if(action==="outdent") {if(first.parent)moveSlides(first.parent,"after");else throw new LocalizedError("deckEditor.navigation.alreadyTop");}
        else {const siblings=entries.filter(entry=>entry.parent===first.parent&&!roots.includes(entry.id));const previous=siblings.filter(entry=>ids.indexOf(entry.id)<ids.indexOf(first.id)).at(-1);if(!previous)throw new LocalizedError("deckEditor.navigation.noParent");moveSlides(previous.id,"inside");}
        return;
      }
      if (action === "skip" || action === "unskip") {
        const doc = sourceDoc(), ops: DeckEditOperation[] = [];
        const runtime = deckSourceSetting(connections.input.source(), "navigation");
        if (runtime !== navigationRuntime) ops.push({kind:"setting",target:"deck-document",name:"navigation",before:runtime,after:navigationRuntime});
        for (const id of picked) {
          const before = find(doc,id)?.getAttribute(DECK_SKIP) ?? null;
          const after = action === "skip" ? "true" : null;
          if (before !== after) ops.push({kind:"attribute",target:id,name:DECK_SKIP,before,after});
        }
        commit(ops);
        return;
      }
      if (action === "up" || action === "down") {
        const selected=entries.filter(entry=>roots.includes(entry.id));
        const edge=action==="up"?selected[0]:selected.at(-1);if(!edge)return;
        const peers=entries.filter(entry=>entry.parent===edge.parent&&!roots.includes(entry.id));
        const target=action==="up"?peers.filter(entry=>ids.indexOf(entry.id)<ids.indexOf(edge.id)).at(-1):peers.find(entry=>ids.indexOf(entry.id)>ids.indexOf(edge.id));
        if(target)moveSlides(target.id,action==="up"?"before":"after");
        return;
      }
      const ops: DeckEditOperation[] = [];
      let temp = connections.input.source();
      const newIds: string[] = [],
        duplicationMaps: Record<string, string>[] = [];
      for (const id of picked) {
        const part = deckSourceFragment(temp, id);
        if (!part) continue;
        let op: DeckEditOperation;
        if (deleting)
          op = {
            kind: "fragment",
            target: id,
            parentId: part.parentId,
            beforeId: part.beforeId,
            before: part.html,
            after: null,
          };
        else {
          const cloned = cloneDeckFragment(part.html, uid()),
            newId = cloned.ids[id];
          newIds.push(newId);
          duplicationMaps.push(cloned.ids);
          op = {
            kind: "fragment",
            target: newId,
            parentId: "deck-root",
            beforeId: part.beforeId,
            before: null,
            after: cloned.html,
          };
        }
        ops.push(op);
        if (deleting) temp = applyDeckEditOperations(temp, [op]).html;
      }
      const base = connections.input.source(), planned = deleting ? null : deckSourceAfterInsertions(temp, ops);
      // 組み立てた変更は、読み取った原稿に対してだけ正しい。次の段までに原稿が変わっていたら、今の原稿で組み立て直す。
      queueSlideStep(() => {
        if (connections.input.source() !== base) { runSlideCommand(action); return; }
        run(() => { if (!deleting) temp = applyDeckEditOperations(temp, ops).html; finish(); });
      }, true);
      if (planned !== null && !deckSourceIndexed(planned)) queueSlideStep(readSourceStep(() => planned), true);
      function finish(): void {
        // Keep authored settings and per-slide overrides consistent with structural changes.
        // 資料全体の DOM は、対象の枚が個別の設定を持つときだけ要る。300 枚では 1 回で数十 ms かかり、
        // 複製の 1 回の処理に積むと遅い端末で入力を止めるので、必要になった時点で 1 度だけ作る。
        let oldParsed: Document | undefined, newParsed: Document | undefined;
        const oldDoc = () => (oldParsed ??= sourceDoc()),
          newDoc = () => (newParsed ??= parse(temp));
        for (const name of [
          "appearance",
          "design-source",
          "focus-source",
          "focus",
          "logo-source",
          "logo",
        ] satisfies Extract<DeckEditOperation, { kind: "setting" }>["name"][]) {
          const before = deckSourceSetting(connections.input.source(), name);
          if (!before) continue;
          const value: unknown = JSON.parse(before);
          if (
            !value ||
            typeof value !== "object" ||
            !("slides" in value) ||
            !value.slides ||
            typeof value.slides !== "object"
          )
            continue;
          const slides: Record<string, unknown> = { ...value.slides };
          for (let i = 0; i < picked.length; i++) {
            const oldId = find(oldDoc(), picked[i])?.getAttribute("data-deck-id");
            if (!oldId) continue;
            if (deleting) delete slides[oldId];
            else if (slides[oldId] !== undefined) {
              const newId = find(newDoc(), newIds[i])?.getAttribute("data-deck-id");
              const mapping = duplicationMaps[i];
              if (newId && mapping) slides[newId] = remapDeckReferences(slides[oldId], mapping);
            }
          }
          const after = JSON.stringify({ ...value, slides });
          if (before !== after)
            ops.push({
              kind: "setting",
              target: "deck-document",
              name,
              before,
              after,
            });
        }
        const afterOutline = deleting
          ? entries.filter(entry=>!picked.includes(entry.id)).map(entry=>{
            let parent=entry.parent;
            while(parent&&picked.includes(parent))parent=entries.find(item=>item.id===parent)?.parent??null;
            return {...entry,parent};
          })
          : (()=>{
            // 複製は各枝の最後の枚の直後に並ぶ。枝の終わりの枚から、その枝を引けるようにしておく（先に選んだ枝が優先）。
            const endings=new Map<string,Set<string>>();
            for(const root of roots){const branch=branches.get(root)??[],last=branch.at(-1);if(last!==undefined&&!endings.has(last))endings.set(last,new Set(branch));}
            const mapping=new Map(picked.map((id,index)=>[id,newIds[index]]));
            return entries.flatMap(entry=>{
              const branch=endings.get(entry.id);
              if(!branch)return [entry];
              return [entry,...entries.filter(item=>branch.has(item.id)).map(item=>({id:mapping.get(item.id)!,parent:item.parent?(mapping.get(item.parent)??item.parent):null}))];
            });
          })();
        ops.push({kind:"outline",target:"deck-root",before:deckSourceOutline(temp),after:afterOutline});
        connections.current =
          action === "duplicate"
            ? newIds[0]
            : (ids.find((id) => !picked.includes(id)) ?? "");
        connections.chosenSlides = connections.current ? [connections.current] : [];
        connections.selection = [];
        commit(ops);
      }
    });
  }

  function selectSlide(id: string, multi = false) {
    if (!connections.input.canvas()?.flush()) return;
    connections.current = id;
    connections.chosenSlides = multi
      ? connections.chosenSlides.includes(id)
        ? connections.chosenSlides.filter((x) => x !== id)
        : [...connections.chosenSlides, id]
      : [id];
    connections.selection = [];
    if(connections.input.canvas()?.selection().length)connections.input.canvas()?.select([]);
    connections.design = false;
    showCurrent();
    if (connections.navMode === "elements") renderNav(); else syncNavSelection();
    refreshInspector();
    renderNotes();
  }

  function showCurrent(refresh = false) {
    if (!connections.attached) return;
    const source = connections.input.source();
    if (refresh || shownDocument !== connections.attached || shownSource !== source) {
      shownDocument = connections.attached; shownSource = source;
      renderedSlides = new Map([...connections.attached.querySelectorAll<HTMLElement>("section[data-deck-slide]")].map(slide => [slide.getAttribute(DECK_NODE_MARK) ?? "", slide]));
      visibleSlide = connections.attached.querySelector<HTMLElement>("section[data-studio-active]") ?? undefined;
    }
    if (!renderedSlides.has(connections.current)) {
      const target = new URL(location.href).searchParams.get("target") ?? "";
      connections.current = renderedSlides.has(target) ? target : (renderedSlides.keys().next().value ?? "");
    }
    connections.empty.hidden = renderedSlides.size > 0;
    if (!renderedSlides.size) {
      connections.notes.hidden = true;
      const source = readDeckDesign(sourceDoc());
      const name = connections.empty.querySelector(".ds-empty-theme");
      if (name) name.textContent = source ? t("deckEditor.navigation.themeName",{name:documentThemeName(connections.input.source())}) : "";
    }
    const next = renderedSlides.get(connections.current);
    if (visibleSlide !== next) {
      for (const [slide, active] of [[visibleSlide, false], [next, true]] satisfies [HTMLElement | undefined, boolean][]) {
        slide?.closest("[data-deck-frame]")?.toggleAttribute("data-studio-active", active);
        slide?.toggleAttribute("data-studio-active", active);
      }
      visibleSlide = next;
    }
    fit();
    renderFooter();
  }

  function fit() {
    if (!connections.attached) return;
    const style=connections.attached.documentElement.style;
    const set=(name:string,value:string)=>{if(style.getPropertyValue(name)!==value)style.setProperty(name,value);};
    set(
      "--studio-desk",
      getComputedStyle(connections.screen).getPropertyValue("--surface-sunken"),
    );
    const w = connections.frame.clientWidth,
      h = connections.frame.clientHeight,
      s = connections.zoom ?? Math.max(0.1, Math.min((w - 64) / 1280, (h - 64) / 720, 1));
    set("--studio-scale", String(s));
    set("--studio-w", `${1280 * s}px`);
    set("--studio-h", `${720 * s}px`);
    connections.input.canvas()?.refreshSelection();
  }

  function renderFooter() {
    const ids = sourceSlides().map((n) => n.getAttribute(DECK_NODE_MARK));
    const position = t("deckEditor.navigation.position",{position:Math.max(0, ids.indexOf(connections.current) + 1),count:ids.length});
    if (footerPosition && footerPosition.textContent !== position) footerPosition.textContent = position;
    const signature = JSON.stringify([
      ids.length,
      connections.notes.hidden,
      connections.zoom,
      connections.frame.clientWidth,
      connections.frame.clientHeight,
    ]);
    if (`${signature}:${Boolean(connections.mediaControl)}` === footerFingerprint) return;
    footerFingerprint = `${signature}:${Boolean(connections.mediaControl)}`;
    const owner = connections.footer.getRootNode(),
      active =
        owner instanceof ShadowRoot
          ? owner.activeElement
          : document.activeElement;
    const focused =
      active instanceof HTMLButtonElement && connections.footer.contains(active)
        ? active.getAttribute("aria-label") || active.textContent
        : null;
    connections.footer.replaceChildren();
    footerPosition = el("span", undefined, position);
    connections.footer.append(
      button(t("deckEditor.navigation.list"), () => togglePanel("slides"), "ds-button ds-mobile"),
      footerPosition,
      ...(ids.length ? [button(connections.notes.hidden ? t("deckEditor.navigation.openNotes") : t("deckEditor.navigation.closeNotes"), () => {
        connections.notes.hidden = !connections.notes.hidden;
        renderNotes();
        fit();
        renderFooter();
      })] : []),
      el("span", "ds-spacer"),
      ...(connections.mediaControl?[connections.mediaControl]:[]),
      styleDeckButton(
        button(t("deckEditor.navigation.guide"), () => {
          const box = modal(t("deckEditor.navigation.guide"));
          const rows = [
            [t("deckEditor.navigation.guideEditText"), t("deckEditor.navigation.guideEditTextKeys")],
            [t("deckEditor.navigation.guideMulti"), t("deckEditor.navigation.guideMultiKeys")],
            [t("deckEditor.navigation.guideNudge"), t("deckEditor.navigation.guideNudgeKeys")],
            [t("deckEditor.navigation.guideUndo"), "⌘Z / Ctrl+Z"],
          ];
          for (const [label, keys] of rows) {
            const row = el("div", "ds-guide-row");
            row.append(
              el("strong", undefined, label),
              el("span", undefined, keys),
            );
            box.append(row);
          }
          const row = el("div", "ds-dialog-actions");
          row.append(button(t("deckEditor.navigation.close"), closeDialog));
          box.append(row);
        }),
        "help",
        true,
      ),
      button(t("deckEditor.navigation.adjust"), () => togglePanel("inspector"), "ds-button ds-mobile"),
      button(t("deckEditor.navigation.fit"), () => {
        connections.zoom = null;
        fit();
        renderFooter();
      }),
      button("−", () => {
        connections.zoom = Math.max(
          0.1,
          (connections.zoom ??
            Math.min(
              (connections.frame.clientWidth - 64) / 1280,
              (connections.frame.clientHeight - 64) / 720,
              1,
            )) - 0.1,
        );
        fit();
        renderFooter();
      }),
      el(
        "span",
        undefined,
        `${Math.round((connections.zoom ?? Math.min((connections.frame.clientWidth - 64) / 1280, (connections.frame.clientHeight - 64) / 720, 1)) * 100)}%`,
      ),
      button("＋", () => {
        connections.zoom = Math.min(
          2,
          (connections.zoom ??
            Math.min(
              (connections.frame.clientWidth - 64) / 1280,
              (connections.frame.clientHeight - 64) / 720,
              1,
            )) + 0.1,
        );
        fit();
        renderFooter();
      }),
    );
    if (focused) {
      const normalized = (name: string | null) =>
        name === t("deckEditor.navigation.openNotes") || name === t("deckEditor.navigation.closeNotes") ? t("deckEditor.workspace.notes") : name;
      [...connections.footer.querySelectorAll<HTMLButtonElement>("button")]
        .find(
          (button) =>
            normalized(
              button.getAttribute("aria-label") || button.textContent,
            ) === normalized(focused),
        )
        ?.focus({ preventScroll: true });
    }
  }

  function renderNotes() {
    if (connections.notes.hidden) return;
    connections.notes.replaceChildren();
    const doc = sourceDoc(),
      noteSlide = connections.current,
      slide = find(doc, noteSlide);
    if (!slide) return;
    const note = slide.querySelector("aside[data-deck-notes]");
    const wrap = el("label", "ds-field"),
      area = el("textarea");
    area.value = note?.textContent ?? "";
    wrap.append(
      el("span", undefined, t("deckEditor.navigation.speakerNotes")),
      area,
    );
    connections.notes.append(wrap);
    let noteBase = note?.textContent ?? "";
    area.onchange = () => {
      if (commit([{ kind: "notes", target: noteSlide, before: noteBase, after: area.value }])) noteBase = area.value;
    };
    const slideId = slide.getAttribute("data-deck-id");
    if (slideId) {
      const before = deckSourceSetting(connections.input.source(), "focus-source"),
        focus = before
          ? deckFocusSchema.parse(JSON.parse(before))
          : { version: 1, guidedByDefault: false, slides: {} };
      const parsed = deckFocusSchema.parse(focus),
        stepId = "studio-public-supplement",
        step = parsed.slides[slideId]?.steps.find((s) => s.id === stepId),
        publicWrap = el("label", "ds-field"),
        publicText = el("textarea");
      publicText.value = step?.supplement ?? "";
      publicText.maxLength = 1000;
      publicWrap.append(
        el("span", undefined, t("deckEditor.navigation.readerNotes")),
        publicText,
      );
      connections.notes.append(publicWrap);
      publicText.onchange = () => {
        const currentSource = deckSourceSetting(connections.input.source(), "focus-source"),
          value = currentSource
            ? deckFocusSchema.parse(JSON.parse(currentSource))
            : deckFocusSchema.parse({ version: 1, slides: {} }),
          steps = (value.slides[slideId]?.steps ?? []).filter(
            (s) => s.id !== stepId,
          );
        if (publicText.value.trim())
          steps.push({
            id: stepId,
            supplement: publicText.value.trim(),
            actions: [
              { id: "studio-public-overview", kind: "overview", targets: [] },
            ],
          });
        value.slides[slideId] = { steps };
        commit(
          [
            {
              kind: "setting",
              target: "deck-document",
              name: "focus-source",
              before: currentSource,
              after: JSON.stringify(value),
            },
          ]
        );
      };
    }
  }

  let thumbnailDocument: Document | null = null;
  let thumbnailSource = "";
  let thumbnailDesign: ReturnType<typeof readDeckDesign> = null;
  let thumbnailLogo = "";
  function thumbnail(slide: HTMLElement, holder: HTMLElement) {
    const doc = sourceDoc();
    if (thumbnailDocument !== doc || thumbnailSource !== connections.input.source()) {
      thumbnailSource = connections.input.source();
      thumbnailDocument = doc; thumbnailDesign = readDeckDesign(doc);
      thumbnailLogo = [...doc.head.querySelectorAll("script[data-deck-logo],script[data-deck-logo-overrides]")].map(n => n.textContent).join("");
    }
    const master = thumbnailDesign;
    const appearance = master ? effectiveAppearance(master.design, master.overrides, slide.getAttribute("data-deck-id") ?? undefined) : null;
    thumbnails.update(slide, holder, String(connections.displayGeneration) + slide.outerHTML + JSON.stringify(appearance) + thumbnailLogo);
  }

  function syncNavSelection() {
    for (const [id, row] of slideRows) { const selected=String(connections.chosenSlides.includes(id) || connections.current === id);if(row.getAttribute("aria-selected")!==selected)row.setAttribute("aria-selected",selected);row.toggleAttribute("data-current", connections.current === id); }
  }
  /** 継ぎ目「A の下」に差し込む先。見えている次の行 B の前に置き、B が A の子なら A の子として、そうでなければ A と同じ親のもとに置く。 */
  function seamInsertion(above: string) {
    const list = connections.nav.querySelector<HTMLElement>(".ds-slide-list");
    const rows = [...(list?.querySelectorAll<HTMLElement>(".ds-slide") ?? [])].filter(row => !row.hidden);
    const below = rows[rows.findIndex(row => row.dataset.slideId === above) + 1]?.dataset.slideId ?? null;
    const outline = deckSourceOutline(connections.input.source());
    const entry = (id: string | null) => outline.find(item => item.id === id);
    const parent = below && entry(below)?.parent === above ? above : (entry(above)?.parent ?? null);
    const position = outline.findIndex(item => item.id === above) + 1;
    layouts(false, { afterId:above, beforeId: below, parent, note: t("deckEditor.navigation.insertAfter",{position}) });
  }

  function renderNav() {
    closeMenu();
    connections.fingerprint = connections.input.source();
    if (builtNavMode !== connections.navMode) {
      for (const row of slideRows.values()) {
        const holder=row.querySelector<HTMLElement>(".ds-thumb"); if(holder)thumbnails.forget(holder);
      }
      connections.nav.replaceChildren(); slideRows.clear(); builtNavMode = connections.navMode;
      const header = el("div", "ds-nav-header");
      header.append(
        el("span", "ds-nav-title", connections.navMode === "slides" ? t("deckEditor.navigation.slides") : t("deckEditor.navigation.elements")),
      );
      const switcher = button(
        connections.navMode === "slides" ? t("deckEditor.navigation.elementList") : t("deckEditor.navigation.slideList"),
        () => {
          connections.navMode = connections.navMode === "slides" ? "elements" : "slides";
          renderNav();
        },
      );
      styleDeckButton(switcher, connections.navMode === "slides" ? "layers" : "grid", true);
      // 追加の入口は 2 つ——ここ（いつでも届く）と、選んでいる枚の下の継ぎ目（その場で差し込む）。専用の行は置かない。
      const add = button(t("deckEditor.navigation.addSlide"), () => layouts(false));
      styleDeckButton(add, "plus", true);
      header.append(add, switcher);
      const more = button(t("deckEditor.navigation.slideActions"), () => slideMenu(more));
      styleDeckButton(more, "more", true);
      more.setAttribute("aria-haspopup", "menu");
      header.append(more);
      connections.nav.append(header);
      const list = el("div", "ds-slide-list");
      connections.nav.append(list);
    }
    const list = connections.nav.querySelector<HTMLElement>(".ds-slide-list")!;
    const more = connections.nav.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
    if (connections.navMode === "elements") {
      list.replaceChildren();
      const doc = sourceDoc(),
        slide = find(doc, connections.current);
      const editable = new Map(
        inspectDeckEdit(connections.input.source()).nodes.map((node) => [node.id, node]),
      );
      if (!slide) return;
      for (const node of slide.querySelectorAll<HTMLElement>(
        `[${DECK_NODE_MARK}]`,
      )) {
        if (
          (node.closest("[data-dd-chart]") !== node &&
            node.closest("[data-dd-chart]")) ||
          (node.closest("table") !== node && node.closest("table"))
        )
          continue;
        const id = node.getAttribute(DECK_NODE_MARK)!;
        if (
          !node.matches(
            "img,video,table,figure,[data-deck-media-slot],[data-deck-shape],[data-deck-group]",
          ) &&
          !editable.get(id)?.textRuns.some((run) => run.text.trim())
        )
          continue;
        const b = button(
          node.hasAttribute("data-deck-locked") ? t("deckEditor.navigation.lockedElement",{label:labelOf(node)}) : labelOf(node),
          () => {
            connections.selection = [id];
            connections.input.canvas()?.select([id]);
            refreshInspector();
          },
        );
        b.style.cssText =
          "display:block;width:100%;text-align:left;overflow:hidden;text-overflow:ellipsis";
        b.setAttribute("aria-pressed", String(connections.selection.includes(id)));
        list.append(b);
      }
      return;
    }
    const slides = sourceSlides(), ids = new Set(slides.map(n => n.getAttribute(DECK_NODE_MARK)!));
    for (const [id, row] of slideRows) if (!ids.has(id)) { const holder = row.querySelector<HTMLElement>(".ds-thumb"); if (holder) thumbnails.forget(holder); row.remove(); slideRows.delete(id); }
    const outline=slides.map(slide=>({id:slide.getAttribute(DECK_NODE_MARK)!,parent:slide.getAttribute(DECK_PARENT)}));
    const parents=new Map(outline.map(entry=>[entry.id,entry.parent]));
    const hierarchy=new Map<string,{depth:number;hidden:boolean;descendants:number}>();
    for(const entry of outline)hierarchy.set(entry.id,{depth:0,hidden:false,descendants:0});
    for(const entry of outline){
      const state=hierarchy.get(entry.id)!;let parent=entry.parent;const seen=new Set([entry.id]);
      while(parent){
        const ancestor=hierarchy.get(parent);
        if(!ancestor||seen.has(parent))throw new LocalizedError("deckEditor.navigation.outlineBroken");
        seen.add(parent);state.depth++;state.hidden ||= folded.has(parent);ancestor.descendants++;parent=parents.get(parent)??null;
      }
    }
    function paintSkip(row: HTMLButtonElement, slide: HTMLElement, position: number) {
      const id=slide.getAttribute(DECK_NODE_MARK)!;
      const state=hierarchy.get(id)!;
      const depth=state.depth;
      row.style.setProperty("--deck-depth",String(depth));
      row.toggleAttribute("data-outline-child",depth>0);

      row.hidden=state.hidden;
      const branchLength=state.descendants+1;
      let fold=row.querySelector<HTMLElement>(".ds-fold");
      // 行自体がボタンなので、中に button は置けない。押せる面だけ分けて行末に置く。位置は溝の下端に CSS が決める。
      if(branchLength>1&&!fold){fold=el("span","ds-fold");fold.setAttribute("role","button");fold.tabIndex=0;fold.dataset.tooltip="";fold.onclick=event=>{event.preventDefault();event.stopPropagation();if(folded.has(id))folded.delete(id);else folded.add(id);renderNav();};fold.onkeydown=event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();event.stopPropagation();fold?.click();}};row.append(fold);}
      if(branchLength===1)row.removeAttribute("aria-expanded");
      if(fold){if(branchLength===1)fold.remove();else{const closed=folded.has(id),count=branchLength-1;fold.replaceChildren(deckIcon("chevron"));if(closed)fold.append(el("span","ds-fold-count",String(count)));fold.querySelector("svg")?.style.setProperty("rotate",closed?"-90deg":"0deg");row.setAttribute("aria-expanded",String(!closed));fold.setAttribute("aria-label",closed?t("deckEditor.navigation.expandChildren",{count}):t("deckEditor.navigation.collapseChildren"));fold.setAttribute("aria-expanded",String(!closed));}}
      const skipped = slide.getAttribute(DECK_SKIP) === "true";
      row.toggleAttribute("data-skipped", skipped);
      const label = (skipped ? t("deckEditor.navigation.slideLabelSkipped",{position,title:titleOf(slide)}) : t("deckEditor.navigation.slideLabel",{position,title:titleOf(slide)}));
      row.setAttribute("aria-label",label); row.dataset.tooltip = label;
      row.querySelector(".ds-seam")?.setAttribute("aria-label", t("deckEditor.navigation.insertSlideAfter",{position}));
      let status = row.querySelector<HTMLElement>(".ds-skip-label");
      if (skipped && !status) { status = el("span","ds-skip-label",t("deckEditor.navigation.skipped")); row.append(status); }
      if (!skipped) status?.remove();
    }
    let position = 0;
    for (const slide of slides) {
      const id = slide.getAttribute(DECK_NODE_MARK)!;
      position++;
      const existing = slideRows.get(id);
      if (existing) {
        paintSkip(existing, slide, position);
        existing.querySelector(".ds-slide-number")!.textContent = String(position);
        thumbnail(slide, existing.querySelector<HTMLElement>(".ds-thumb")!);
        if (list.children[position - 1] !== existing) list.insertBefore(existing, list.children[position - 1] ?? null);
        continue;
      }
      const b = button("", () => { }, "ds-slide");
      b.setAttribute(
        "aria-selected",
        String(connections.chosenSlides.includes(id) || connections.current === id),
      );
      b.setAttribute(
        "aria-label",
        t("deckEditor.navigation.slideLabel",{position,title:titleOf(slide)}),
      );
      b.onclick = (event) => selectSlide(id, event.shiftKey || event.metaKey);
      outlineDrag.bind(b,id);
      const holder = el("span", "ds-thumb");
      thumbnail(slide, holder);
      const number = String(position);
      holder.setAttribute("aria-hidden", "true");
      b.dataset.tooltip = titleOf(slide);
      b.append(el("span", "ds-slide-number", number), holder);
      // 継ぎ目は行の下の隙間。行自体がボタンなので押せる面だけ分ける（開閉と同じ流儀）。
      const seam = el("span", "ds-seam"); seam.setAttribute("role", "button"); seam.tabIndex = 0; seam.dataset.tooltip = "";
      const chip = el("span", "ds-seam-chip"); chip.setAttribute("aria-hidden", "true"); chip.append(deckIcon("plus")); seam.append(chip);
      seam.onclick = event => { event.preventDefault(); event.stopPropagation(); seamInsertion(id); };
      seam.onkeydown = event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); seamInsertion(id); } };
      b.append(seam);
      paintSkip(b,slide,position);
      b.oncontextmenu = (event) => {
        event.preventDefault();
        if (!connections.chosenSlides.includes(id)) selectSlide(id);
        slideMenu(more);
      };
      b.onkeydown = (event) => {
        if(event.altKey&&(event.key==="ArrowLeft"||event.key==="ArrowRight")){event.preventDefault();slideCommands(event.key==="ArrowRight"?"indent":"outdent");return;}
        if(!event.altKey&&(event.key==="ArrowLeft"||event.key==="ArrowRight")){
          if(outlineBranch(deckSourceOutline(connections.input.source()),id).length>1){event.preventDefault();if(event.key==="ArrowLeft")folded.add(id);else folded.delete(id);renderNav();return;}
          if(event.key==="ArrowLeft"){const parent=deckSourceOutline(connections.input.source()).find(entry=>entry.id===id)?.parent;if(parent){event.preventDefault();selectSlide(parent);return;}}
        }
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          slideCommands("delete");
        }
        if ((event.metaKey || event.ctrlKey) && event.key === "d") {
          event.preventDefault();
          slideCommands("duplicate");
        }
        // 枚のコピー・カット・貼り付け（別のタブ・窓の資料にも貼れる）
        const clip = (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey ? SLIDE_CLIPBOARD_KEYS.get(event.key.toLowerCase()) : undefined;
        if (clip) { event.preventDefault(); slideCommands(clip); }
        if (
          event.altKey &&
          (event.key === "ArrowUp" || event.key === "ArrowDown")
        ) {
          event.preventDefault();
          slideCommands(event.key === "ArrowUp" ? "up" : "down");
        }
      };
      slideRows.set(id, b); list.insertBefore(b, list.children[position - 1] ?? null);
    }
    // 次に見える行が根なら隙間は 16px。継ぎ目の的もその高さまで広げる。
    const visible = [...list.querySelectorAll<HTMLElement>(".ds-slide")].filter(row => !row.hidden);
    visible.forEach((row, index) => row.toggleAttribute("data-seam-wide", !!visible[index + 1] && !visible[index + 1].hasAttribute("data-outline-child")));
    syncNavSelection();
  }
  return {
    dispose() { outlineDrag.dispose(); thumbnails.dispose(); }, slideCommands,
    showCurrent,
    fit,
    renderFooter,
    renderNotes,
    thumbnail,
    renderNav,
    get pendingNavFocus() { return pendingNavFocus; },
    set pendingNavFocus(value: boolean) { pendingNavFocus = value; },
  };
}
