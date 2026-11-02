import { openDeckPresenter } from "../present/presenter";
import { hasSecondScreen, moveToOtherScreen } from "../../reading/screens";
import {DECK_SNAPSHOT_HEADER,deckSourcePreview} from "../../../lib/pages/preview";
import {applyDeckRevisionBatches,applyDeckSourceBatches} from "./revision-update";
import { createEditorOpening } from "../../editor/opening";
import { createDeckLocalEdits } from "../../../lib/deck/edit/local";
import { createDeckOperationFeedback } from "./operation-feedback";
import { pauseDeckReader } from "../reader-pause";
import { applyCollaborativeOperations, deckCollaborationSchema, type DeckCollaboration } from "../../../lib/deck/edit/collaboration";
import { DeckTextBindings } from "./text-binding";
import {createDeckTypingBatch} from "./typing-batch";
import type {TextState} from "../../../lib/deck/edit/text-sync";
import { deckDraftOwner, availableDeckDrafts, claimDeckDraft, rememberDeckDraft } from "./draft-owner";
import {MediaFailure,MEDIA_FAILURE_CODES} from "../../../lib/deck/media/failure";
import { createDeckMediaQueue,MediaTargetError } from "./media-queue";
import { isMediaFile, mediaFileType, youtubeId, formatMediaBytes } from "../../../lib/deck/media/media";
import { navigationRuntime } from "../../../lib/deck/preview.generated";
import { openAgentReview } from "../../reading/page-agent-review";
import { completeDeckCreation } from "../../../lib/deck/create-draft";
import { planDeckPaint } from "../render";
import { upgradeDeckPreview } from "../preview";
import { withVendorScripts } from "../../../lib/html/vendor-scripts";
import {deckIcon,styleDeckButton} from "../ui";
import { createDeckWorkspace } from "../workspace/workspace";
import { deckSourceFragment, deckSourceIndexed, deckSourceSetting, inspectDeckNode, inspectDeckSlideNodes, readDeckSourceInSlices } from "../../../lib/deck/edit/source";
import {uploadMediaFile} from "./video-upload";
import { prepareDeckFonts, whenDeckSlideReady } from "../../../lib/deck/design/typography";
import { deckSourceTypographies } from "../../../lib/deck/design/theme-source";
import { markDeferredWork } from "../deferred-work";
import { z } from "zod";
import type { EditorHooks } from "../../editor/editor";
import { createDeckCanvas } from "../canvas";
import { deckEditOperationSchema, deckEditOperationsSchema, isDeckEditImagePath, type DeckEditOperation } from "../../../lib/deck/edit/model";
import { applyDeckEditOperations, inspectDeckEdit, deckEditStructureFingerprint, refineDeckOperations, DeckEditConflictError } from "../../../lib/deck/edit/source";
import { DeckEditQueue, DECK_DRAFT_TTL } from "./sync";
import { el } from "../../shared/util";
import { deckEditSessionActive, setDeckEditSessionActive } from "./state";
import {createDeckImagePalette,paletteChoiceSchema,type PaletteChoice} from "./image-palette";
import {imageRequest} from "./image-provider";
import { t, widgetLocale } from "../../shared/i18n";
import { LocalizedError } from "../../../lib/i18n/errors";
import { deckErrorMessage } from "../../../lib/deck/edit/message";
import { formatDateTime } from "../../../lib/i18n/format";

const presenceSchema = z.array(z.object({ sessionId: z.string(), name: z.string(), selection: z.string().nullable() }));
const snapshotSchema = z.object({ updatedAt:z.string().optional(),updatedBy:z.string().optional(),collaboration:deckCollaborationSchema.optional(),pageId:z.string().uuid().optional(), viewerId:z.string().optional(), html: z.string(), previewHtml: z.string(), previewHref:z.string().nullable().optional(), versionId: z.string(), versionNumber: z.number(), presence: presenceSchema.default([]), inverse: z.array(deckEditOperationSchema).default([]) });
const pollSchema = z.object({ updatedAt:z.string().optional(),updatedBy:z.string().optional(),collaboration:deckCollaborationSchema.optional(), versionId: z.string(), versionNumber: z.number(), html: z.string().optional(), previewHtml: z.string().optional(), previewHref:z.string().nullable().optional(), batches:z.array(z.object({versionId:z.string(),operations:z.array(deckEditOperationSchema)})).optional(), presence: presenceSchema.default([]) });
const acknowledgementSchema=pollSchema.extend({inverse:z.array(deckEditOperationSchema).default([])});
const draftBatchSchema=z.object({ operationId: z.string().uuid(), operations: z.array(deckEditOperationSchema), intent: z.enum(["edit", "undo", "redo"]), baseVersionId: z.string().optional(), inverse: z.array(deckEditOperationSchema).optional(), undone: z.boolean().optional(), undoOf:z.string().optional() });
const draftSchema = z.object({ versionId: z.string(), savedAt: z.number(), blocked: z.boolean(), batches:z.array(draftBatchSchema),rejected:z.array(z.object({batch:draftBatchSchema,reason:z.string()})).optional() });
type Snapshot = z.infer<typeof snapshotSchema>;
type Canvas = ReturnType<typeof createDeckCanvas>;
const DRAFT_PREFIX = "sp-deck-edit-draft:";
const DRAFT_LIMIT = 1024 * 1024;
const API = "/api/pages/deck-edit";
const operationMetadata=new Set(["commandId","reverts","expects","restores","textStates","textSeed","sync"]);
const visibleOperation=(operation:DeckEditOperation)=>JSON.stringify(Object.fromEntries(Object.entries(operation).filter(([key])=>!operationMetadata.has(key)).sort(([a],[b])=>a.localeCompare(b))));

export { deckEditSessionActive } from "./state";

class RequestFailure extends Error {
  constructor(message: string, readonly status: number,readonly conflict?:"operation"|"generation") { super(message); }
}

/** A deck stays in its original renderer; this screen only owns transport and editing tools. */
export async function openDeckEditSession(hooks: EditorHooks): Promise<void> {
  if (deckEditSessionActive()) return;
  setDeckEditSessionActive(true);
  for (const name of ["deck:open-requested","deck:open-feedback-mounted","deck:open-feedback-painted","deck:open-source","deck:open-ready"]) performance.clearMarks?.(name);
  performance.mark?.("deck:open-requested");
  const sessionId = crypto.randomUUID();
  const compactTyping=createDeckTypingBatch();
  let draftKey = DRAFT_PREFIX + hooks.pageSlug;
  let releaseDraft = () => {};
  let textBindings: DeckTextBindings | null = null;
  const lifetime = new AbortController();
  const readRequests=new Set<AbortController>();
  let pageAway=false, pageHidden=false, leaveAttempt=0;
  const abortReads=()=>{for(const request of readRequests)request.abort();};
  const outerOverflow = document.documentElement.style.overflow;
  const reader = pauseDeckReader();
  const resumeReader = () => reader.resume();
  let disposed = false;
  const leave = () => { void fetch(`${API}?${new URLSearchParams({ page: hooks.pageSlug, sessionId })}`, { method: "DELETE", credentials: "same-origin", keepalive: true }).catch(() => undefined); };
  // The server joins this session while answering the open request. Leaving before
  // that answer could arrive first and be undone by the join (a lingering editor).
  let joining: Promise<unknown> | null = null;
  let cancelOpening = () => {
    disposed = true; setDeckEditSessionActive(false); lifetime.abort(); opening.dispose(); resumeReader(); opening.dispose(true);
    if (joining) void joining.catch(() => undefined).finally(leave); else leave();
  };
  const opening = createEditorOpening(hooks.host, () => cancelOpening(), () => {
    cancelOpening(); void openDeckEditSession(hooks);
  }, hooks.restoreFocus);
  let networkBusy = false;
  let pendingUploads = 0;
  let mediaQueue: ReturnType<typeof createDeckMediaQueue> | null = null;
  let imagePalette:ReturnType<typeof createDeckImagePalette>|null=null;
  let uploadMessage = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sendTimer:ReturnType<typeof setTimeout>|undefined;
  let sendAt=0;
  let receiveTimer:ReturnType<typeof setTimeout>|undefined;
  let lastSendAt=0;
  let nextAttempt = 0;
  let lastHeartbeat = 0;
  let changed = false;
  let connected = true;
  let canvas: Canvas | null = null;
  let frameReady = false;
  let delayedSnapshot: Snapshot | null = null;
  let structuralSnapshot: Snapshot | null = null;
  let reopenRequired = false;
  let snapshot: Snapshot;
  let queue: DeckEditQueue<DeckEditOperation>;
  let selected: string[] = [];
  let draftPending = false;
  let workspace: ReturnType<typeof createDeckWorkspace> | null = null;
  let renderedHtml = "";
  let frameHtml = "";
  let appliedHtml = "";
  let canvasNeedsUpdate = false;
  let paintGeneration = 0;
  let paintAbort: AbortController | null = null;
  // 表示の側（deckRenderer）へ渡した描き直しが、中止されたまま最後まで流れていない印。
  // 中止した描き直しの残りは表示の側が次の依頼へ引き継ぐが、次の依頼が来ないまま入力が終わると
  // 残り（配色を変えた後ろの方の枚など）が古いまま画面に残る。本文が同じでも、この印があれば描き直しを流す。
  let rendererBehind = false;
  let paintFailed = false;
  let paintError: string | null = null;
  let pendingPaints = 0;
  let scheduledPaint: number | undefined;
  let paintTask: ReturnType<typeof setTimeout> | undefined;
  let titleSource = "";
  let sourceCache: { html:string; queue:typeof queue; revision:number; value:string; collaboration?:DeckCollaboration } | null = null;
  let presenter: ReturnType<typeof openDeckPresenter> | null = null;
  let presenting = false;
  let waitingToPresent = false;
  const localEdits = createDeckLocalEdits();
  let afterSaved:(()=>void)|null=null;

  /** outlivesCancel: the request reaches the server even if the editor is closed
   * meanwhile. Only its answer is dropped. */
  async function request(method: string, body?: object, query = "", binary?: File, outlivesCancel = false): Promise<unknown> {
    const timeout = AbortSignal.timeout(15000);
    const read=method==="GET"?new AbortController():null;
    if(read&&pageAway)throw new DOMException(t("deckEditor.session.pageLeft"),"AbortError");
    if(read)readRequests.add(read);
    try{
    const response = await fetch(API + query, {
      method, credentials: "same-origin", signal: AbortSignal.any([...(outlivesCancel?[]:[lifetime.signal]), timeout,...(read?[read.signal]:[])]),
      headers: { [DECK_SNAPSHOT_HEADER]:"compact", ...(binary ? { "Content-Type": binary.type || "application/octet-stream" } : body ? { "Content-Type": "application/json" } : {}) },
      body: binary ?? (body ? JSON.stringify(body) : undefined),
    });
    if (lifetime.signal.aborted) { void response.body?.cancel().catch(() => undefined); throw new DOMException(t("deckEditor.session.closed"),"AbortError"); }
    if (!response.ok) {
      if ([401,403,404].includes(response.status)) presenter?.revoke(t("deckEditor.session.accessLost"));
      const error = z.object({ message: z.string().optional(), error: z.string().optional(), conflict:z.enum(["operation","generation"]).optional() }).safeParse(await response.json().catch(() => null));
      throw new RequestFailure(error.success ? error.data.message ?? error.data.error ?? t("deckEditor.session.saveFailed") : t("deckEditor.session.saveFailed"), response.status,error.success?error.data.conflict:undefined);
    }
    if (response.status === 204) return null;
    const value:unknown=await response.json();
    const compact=z.object({html:z.string(),previewHref:z.string().nullable(),previewHtml:z.undefined().optional()}).safeParse(value);
    // A compact reply carries the source and how its preview is derived. The preview
    // (several copies of the whole document) is derived only when one is shown: previewSource().
    if(compact.success&&value!==null&&typeof value==="object")return {...value,previewHtml:""};
    return value;
    }catch(error){if(read?.signal.aborted)throw new DOMException(t("deckEditor.session.fetchAborted"),"AbortError");throw error;}
    finally{if(read)readRequests.delete(read);}
  }

  await opening.painted();
  if (disposed) return;
  try {
    reader.prepare();
    joining = request("POST", { page: hooks.pageSlug, action: "open", sessionId, protocol:2 }, "", undefined, true);
    snapshot = snapshotSchema.parse(await joining);
    lastHeartbeat=Date.now();
  } catch (error) {
    if (!disposed) opening.fail(error instanceof Error ? deckErrorMessage(error, t) : t("deckEditor.session.openFailed"));
    return;
  }
  if (disposed) return;
  performance.mark?.("deck:open-source");
  const draftPage=snapshot.pageId??hooks.pageSlug;
  if (snapshot.viewerId) { const owner=await deckDraftOwner(snapshot.viewerId,draftPage);draftKey=owner.key;releaseDraft=owner.release; }
  if (snapshot.collaboration) textBindings=new DeckTextBindings(snapshot.collaboration.fields);

  if(disposed){await releaseDraft();return;}
  const initialVersion = snapshot.versionId;
  try { completeDeckCreation(sessionStorage, location.pathname); } catch { /* Storage may be unavailable. */ }
  queue = new DeckEditQueue(snapshot.versionId);
  document.documentElement.style.overflow="hidden";
  const screen = el("div", "edit-screen");
  screen.inert = true;
  screen.setAttribute("role", "dialog");
  screen.setAttribute("aria-modal", "true");
  screen.setAttribute("aria-label", t("deckEditor.session.editSlides"));
  screen.setAttribute("aria-busy", "true");
  screen.style.position = "fixed";
  screen.style.zIndex = "2147483000";
  const styles = el("style");
  styles.textContent = `.deck-edit-notice{display:flex;align-items:center;gap:var(--space-2);flex-wrap:wrap;padding:var(--space-2) var(--space-3);background:var(--surface-sunken);font-size:var(--font-sm)}.deck-edit-notice[hidden]{display:none}`;
  const bar = el("div", "edit-bar deck-edit-bar");
  const title = el("button", "edit-title");title.type="button";const titleText=el("span");titleText.textContent=t("deckEditor.session.editSlides");title.append(titleText,deckIcon("chevron"));
  const status = el("span", "deck-edit-status"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  const presence = el("span", "deck-edit-presence");
  const feedback = createDeckOperationFeedback();
  const notice = el("div", "deck-edit-notice"); notice.hidden = true;
  const alert = el("p", "edit-alert"); alert.hidden = true; alert.setAttribute("role", "alert");
  let frame = el("iframe", "edit-frame"); frame.title = t("deckEditor.session.frameTitle");
  const fileInput = el("input"); fileInput.type = "file"; fileInput.accept = "image/png,image/jpeg,image/webp,image/gif,image/avif"; fileInput.multiple = true; fileInput.hidden = true;
  function button(label: string, action: () => void): HTMLButtonElement {
    const result = el("button", "edit-button"); result.type = "button"; result.textContent = label; result.addEventListener("click", action); return result;
  }
  const deferred = () => markDeferredWork(screen, !disposed && (scheduledPaint !== undefined || paintTask !== undefined || pendingPaints > 0 || warming !== null));
  function showError(message: string): void { paintError=null; alert.textContent = message; alert.hidden = false; }
  function persist(): boolean {
    try {
      if (!queue.dirty) { if (!draftPending) localStorage.removeItem(draftKey); return true; }
      const text = JSON.stringify(queue.exportDraft(Date.now()));
      if (text.length > DRAFT_LIMIT) throw new LocalizedError("deckEditor.session.draftTooLarge");
      localStorage.setItem(draftKey, text);return true;
    } catch { showError(t("deckEditor.session.draftUnavailable"));return false; }
  }
  function render(): void {
    // Before the first picture the title waits for the source to be read in slices
    // (opening does that anyway) instead of reading all of it at once here.
    if(workspace){if(titleSource!==source()&&(frameReady||deckSourceIndexed(source()))){titleSource=source();titleText.textContent=deckSourceSetting(titleSource,"title")||t("deckEditor.session.untitled");}workspace.setBusy(!frameReady||draftPending||queue.status==="conflict"||queue.status==="paused");}
    const hasSlides=workspace?.hasSlides()??false;
    presentButton.hidden = !hasSlides;
    presenterButton.hidden = !hasSlides;
    insertButton.hidden = !hasSlides;
    recoverButton.hidden=queue.status!=="conflict"&&!queue.needsReview;recoverButton.disabled=queue.busy||queue.status!=="conflict"&&queue.needsReview&&queue.pending;
    const labels = { attention:t("deckEditor.session.status.attention"), saved: connected ? t("deckEditor.session.status.saved") : t("deckEditor.session.status.checking"), pending: t("deckEditor.session.status.pending"), saving: t("deckEditor.session.status.saving"), offline: t("deckEditor.session.status.offline"), paused: t("deckEditor.session.status.paused"), conflict: t("deckEditor.session.status.conflict") };
    // A logo still being sent is not saved yet: the saved mark must not appear before it arrives.
    const sending=workspace?.busy()??false;
    status.textContent = paintFailed ? t("deckEditor.session.status.paintFailed") : frameReady && (frameHtml!==source()||appliedHtml!==source()) ? t("deckEditor.session.status.preparing") : !frameReady && !queue.dirty ? t("deckEditor.session.status.preparing") : pendingUploads > 0 ? (uploadMessage || t("deckEditor.session.status.addingImage")) : sending ? t("deckEditor.session.status.sendingLogo") : structuralSnapshot || reopenRequired ? t("deckEditor.session.status.restructured") : labels[queue.status];
    status.dataset.state=queue.status==="saved"&&connected&&frameReady&&frameHtml===source()&&appliedHtml===source()&&!paintFailed&&pendingUploads===0&&!sending?"saved":"working";status.title=status.textContent;
    if(status.dataset.state==="saved")status.append(deckIcon("check"));
    undoButton.disabled = !queue.canUndo;
    redoButton.disabled = !queue.canRedo;
    designButton.disabled = !frameReady || draftPending || queue.status === "conflict";
    reloadButton.hidden = structuralSnapshot === null && !reopenRequired;
    reloadButton.disabled = queue.dirty || pendingUploads > 0 || Boolean(canvas?.isInteracting());
    retryButton.hidden = !paintFailed && queue.status !== "offline" && queue.status !== "paused";
    // Never rewrite the label here: render runs on every poll, and WebKit drops a click
    // whose pressed text node is replaced before the button is released.
    doneButton.disabled = pendingUploads > 0 || sending;
    if(afterSaved&&!queue.pending&&pendingUploads===0){const action=afterSaved;afterSaved=null;action();return;}
    if(waitingToPresent&&!queue.pending&&pendingUploads===0&&frameReady&&frameHtml===source()&&appliedHtml===source()&&!paintFailed){waitingToPresent=false;startPresentation();}
    canvas?.setReadOnly(draftPending || queue.status === "conflict" || queue.status === "paused");

  }
  function updatePresence(items: Snapshot["presence"]): void {
    snapshot.presence=items;
    const others = items.filter((item) => item.sessionId !== sessionId);
    presence.hidden=others.length===0;presence.replaceChildren();
    if(others.length){presence.append(deckIcon("users"),el("span",undefined,String(others.length+1)));presence.dataset.tooltip=t("deckEditor.session.editingBy",{names:others.map(item=>item.name).join(t("deckEditor.session.nameSeparator"))});presence.setAttribute("aria-label",presence.dataset.tooltip);presence.tabIndex=0;}
  }
  function projection() {
    if(sourceCache?.html===snapshot.html && sourceCache.queue===queue && sourceCache.revision===queue.revision)return sourceCache;
    let change:{html:string;collaboration?:DeckCollaboration};
    if(snapshot.collaboration){
      let html=snapshot.html,state=snapshot.collaboration;
      for(const batch of queue.previewBatches()){
        try{const next=applyCollaborativeOperations(html,state,batch.operations);html=next.html;state=next.collaboration;}
        catch(error){
          if(!(error instanceof DeckEditConflictError)||error.category==="generation"||!queue.quarantine(batch.operationId,deckErrorMessage(error,t)))throw error;
          showError(deckErrorMessage(error,t));persist();
        }
      }
      change={html,collaboration:state};
    }else {const operations=queue.pendingOperations();change=operations.length?localEdits.apply(snapshot.html,operations):{html:snapshot.html};}
    sourceCache={html:snapshot.html,queue,revision:queue.revision,value:change.html,collaboration:change.collaboration};
    return sourceCache;
  }
  function source(): string {
    if(queue.status==="conflict"||queue.status==="paused")return renderedHtml||snapshot.html;
    return projection().value;
  }
  /** The saved preview. Compact deliveries (previewHref present) derive it from the source. */
  function previewSource(): string { return snapshot.previewHref!==undefined?deckSourcePreview(snapshot.html,snapshot.previewHref):snapshot.previewHtml; }
  function preview(): string {
    const base=previewSource(),operations=queue.pendingOperations();
    if(snapshot.collaboration)return withVendorScripts(applyCollaborativeOperations(base,snapshot.collaboration,operations).html);
    // With nothing to apply the preview is the saved one. Reading all of it again
    // would only repeat the source's work (a whole-document pass on opening).
    return withVendorScripts(operations.length?applyDeckEditOperations(base,operations).html:base);
  }
  function attachCanvas(doc: Document, nodes: ReturnType<typeof inspectDeckEdit>["nodes"]): void {
    canvas = createDeckCanvas({ document:doc, nodes, externalToolbar:true,onEditComplex:id=>workspace?.editComplex(id),onCommand:command=>workspace?.elementCommand(command),onCrop:id=>workspace?.startCrop(id), onOperations: ops=>enqueue(ops,true), onUndo: () => history("undo"), onRedo: () => history("redo"), onSelection: (ids) => { selected = ids;workspace?.selectionChanged(ids); }, onExitToToolbar: () => doneButton.focus(), onActivity: interacting => { if(!interacting)workspace?.resumeUpdates(); if (!interacting || snapshot.collaboration && !canvas?.isInputBlocked()) { if(delayedSnapshot)applySnapshot(delayedSnapshot); else paintPending(false,Boolean(snapshot.collaboration)); } }, onFiles: (files, slideId, point, replacementId) => { upload(files, slideId, point, replacementId ? {id:replacementId,type:"image"} : null); }, onUrl:(url,slideId,point,replacementId)=>enqueueMedia(url,slideId,point,replacementId ? {id:replacementId,type:"image"} : null), onPalette:(value,slideId,point,replacementId)=>{try{enqueueMedia(paletteChoiceSchema.parse(JSON.parse(value)),slideId,point,replacementId?{id:replacementId,type:"image"}:null);}catch{showError(t("deckEditor.session.imageSpecUnreadable"));}}, onMessage: showError });
    workspace?.attach(doc,frame);
  }
  async function replacePreview(html:string, ticket:number, signal:AbortSignal):Promise<void> {
    const upgraded=withVendorScripts(await upgradeDeckPreview(preview()));if(signal.aborted)return;
    // The embedded runtime gives fonts only a reader's short wait, then falls back and marks the page,
    // which the editor must treat as a failed paint. Load them first with the editor's own wait (as an
    // in-place update does), so the new frame takes them from the browser's cache.
    if(!deckSourceIndexed(html))await readDeckSourceInSlices(html,yieldToInput);
    if(signal.aborted)return;
    try{await prepareDeckFonts(document,deckSourceTypographies(html));}catch{throw new Error(t("deckEditor.session.fontsNetwork"));}
    if(signal.aborted)return;
    const next=el("iframe","deck-preparing-frame"); next.title=frame.title;next.setAttribute("data-deck-editor-preview", "");
    next.style.cssText="position:absolute;inset:0;width:100%;height:100%;visibility:hidden;pointer-events:none";
    const ready=new Promise<Document>((resolve,reject)=>{
      let stop=()=>{};
      const timeout=setTimeout(()=>finish(new Error(t("deckEditor.session.paintSlow"))),20000);
      function finish(error?:Error,doc?:Document){clearTimeout(timeout);stop();signal.removeEventListener("abort",cancel);if(error)reject(error);else if(doc)resolve(doc);}
      function cancel(){next.remove();finish(new Error(t("deckEditor.session.paintStopped")));}
      signal.addEventListener("abort",cancel,{once:true});
      // Attach once the slide the canvas will show is drawn. The embedded style draws
      // the other slides after it; the canvas waits per slide, the thumbnails for all.
      const shown=(doc:Document)=>{const id=workspace?.shownSlide()??"";return (id?doc.querySelector(`section[data-deck-slide][data-deck-node="${CSS.escape(id)}"]`):null)??doc.querySelector("section[data-deck-slide]");};
      next.addEventListener("load",()=>{const doc=next.contentDocument;if(!doc)return;stop=whenDeckSlideReady(doc,()=>shown(doc),()=>{if(doc.body.hasAttribute("data-deck-font-error"))finish(new Error(t("deckEditor.session.fontsFailed")));else finish(undefined,doc);});},{once:true});
    });
    next.srcdoc=upgraded;
    frame.parentElement?.append(next);
    try {
      const doc=await ready;
      if(disposed||ticket!==paintGeneration||signal.aborted)return;
      if(!snapshot.collaboration)localEdits.prepare(html);
      await new Promise<void>(resolve=>setTimeout(resolve,0));
      if(disposed||ticket!==paintGeneration||signal.aborted)return;
      const nodes=inspectDeckEdit(html).nodes;
      await new Promise<void>(resolve=>setTimeout(resolve,0));
      if(disposed||ticket!==paintGeneration||signal.aborted)return;
      if(canvas?.isInteracting())return;
      doc.deckLayout?.setEditing?.(true);
      const firstFrame = !frameReady;
      canvas?.dispose();const previous=frame;frame=next;frame.className="edit-frame";frame.style.cssText="";
      frameHtml=html;appliedHtml=html;renderedHtml=html;frameReady=true;canvasNeedsUpdate=false;rendererBehind=false;attachCanvas(doc,nodes);previous.remove();
      opening.dispose(); document.documentElement.style.overflow="hidden";
      screen.inert = false;
      screen.removeAttribute("aria-busy");
      if (firstFrame) { doneButton.focus({preventScroll:true}); performance.mark?.("deck:open-ready"); }
      // The style draws the other slides once this picture is on screen.
      requestAnimationFrame(()=>setTimeout(()=>{if(frame===next&&!disposed)doc.deckRenderer?.drawRemaining?.();},0));
    } finally {if(next!==frame)next.remove();}
  }
  function rebuild():void { paintPending(true); }
  // 今の原稿の読み取りを、入力が止まっている間に小分けにして先に済ませておく。文字の直しは枚の中だけで反映するので
  // 原稿全体の読み取りが手元に残らず、次の配色・グラフ・枚の操作が 300 枚ぶんを一度に読み直して入力を止めていたため。
  // 入力中は行わず、ブラウザが手の空いたとき（requestIdleCallback）に 1 回 4ms ずつだけ進める。
  // 入力が来たらそちらが先に通る（遅い端末の入力と取り合わない）。読んだ結果は通常の読み取りと同じ木。
  let warming:string|null=null;
  const yieldToInput=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
  const whenIdle=()=>new Promise<void>(resolve=>{if(typeof requestIdleCallback==="function")requestIdleCallback(()=>resolve(),{timeout:2000});else setTimeout(resolve,50);});
  function warmSource():void{
    if(disposed||canvas?.isInteracting()||queue.status==="conflict"||queue.status==="paused")return;
    const html=source();
    if(warming===html||deckSourceIndexed(html))return;
    warming=html;deferred();
    void readDeckSourceInSlices(html,whenIdle,4).catch(()=>{}).finally(()=>{if(warming===html)warming=null;deferred();});
  }
  function schedulePaint(): void {
    if (disposed || scheduledPaint !== undefined || paintTask !== undefined) return;
    scheduledPaint = requestAnimationFrame(() => {
      scheduledPaint = undefined;
      paintTask = setTimeout(() => { paintTask = undefined; if (!disposed) paintPending(); deferred(); }, 0);
    });
    deferred();
  }
  function clearPaintError():void {
    paintFailed=false;
    if(paintError!==null&&alert.textContent===paintError){alert.hidden=true;alert.textContent="";}
    paintError=null;
  }
  function paintPending(force=false, updateInput=false): void {
    if(disposed)return;
    const html=source();
    const restoreCaret=textBindings && frame.contentDocument ? textBindings.bookmark(frame.contentDocument) : () => {};
    if(snapshot.collaboration && !canvas?.isInputBlocked()) { const state=projection().collaboration;if(state)textBindings?.reset(state.fields); }
    if(!force && html===frameHtml && html===appliedHtml && !pendingPaints && !canvasNeedsUpdate && !rendererBehind){warmSource();if(paintFailed){clearPaintError();render();}return;}
    if(canvas?.isInteracting()){
      if(!updateInput)return;
      if(!force && deckEditStructureFingerprint(appliedHtml)===deckEditStructureFingerprint(html) && canvas.applySnapshot(inspectDeckEdit(html).nodes)){
        appliedHtml=html;frameHtml=html;renderedHtml=html;workspace?.refresh();restoreCaret();return;
      }
      if(!canvas.finishEditing() || canvas.isInteracting())return;
    }
    const ticket=++paintGeneration;paintAbort?.abort();const abort=new AbortController();paintAbort=abort;
    pendingPaints++;deferred();
    const progress = feedback.start(t("deckEditor.session.applying"));
    void (async()=>{
      try {
        const doc=frame.contentDocument;
        const base=appliedHtml;
        const stalePlan=()=>appliedHtml!==base||source()!==html;
        if(!force && doc && frameReady){
          // 比べる前後の原稿の読み取りを、小分けにして先に済ませる。300 枚の資料で配色だけを変えたときも、
          // 比べる側で一度に読むと遅い端末で 100ms を超えて入力が止まるため。読んだ結果は手元に残り、比べる側は読み直さない。
          for(const value of [base,html])if(!deckSourceIndexed(value))await readDeckSourceInSlices(value,yieldToInput);
          if(disposed||abort.signal.aborted||ticket!==paintGeneration||stalePlan())return;
        }
        const plan=!force && doc && frameReady?planDeckPaint(doc,base,html):null;
        if(plan){
          await new Promise<void>(resolve=>setTimeout(resolve,0));
          if(disposed||abort.signal.aborted||ticket!==paintGeneration||canvas?.isInteracting()||stalePlan())return;
          const nodeSlides=plan.nodesChanged&&!canvasNeedsUpdate?plan.nodeSlides:undefined;
          const nodes=plan.nodesChanged||canvasNeedsUpdate?(nodeSlides?inspectDeckSlideNodes(html,nodeSlides):inspectDeckEdit(html).nodes):null;
          if(nodes){
            await new Promise<void>(resolve=>setTimeout(resolve,0));
            if(disposed||abort.signal.aborted||ticket!==paintGeneration||canvas?.isInteracting()||stalePlan())return;
          }
          plan.change.progress = progress.progress;
          plan.change.signal = abort.signal;
          await plan.prepare();
          if(disposed||abort.signal.aborted||ticket!==paintGeneration||canvas?.isInteracting()||stalePlan())return;
          canvasNeedsUpdate ||= plan.nodesChanged;
          rendererBehind=true;
          const finished=plan.apply();
          appliedHtml=html;
          await finished;
          // 中止されずに終わった依頼は、それまでに引き継いだ残りも描き終えている。
          if(!abort.signal.aborted)rendererBehind=false;
          if(disposed||ticket!==paintGeneration||appliedHtml!==html||source()!==html)return;
          frameHtml=html;renderedHtml=html;
          if(canvasNeedsUpdate){canvas?.updateNodes(nodes??inspectDeckEdit(html).nodes,nodeSlides);canvasNeedsUpdate=false;}
          await new Promise<void>(resolve=>setTimeout(resolve,0));
          if(disposed||abort.signal.aborted||ticket!==paintGeneration||appliedHtml!==html||source()!==html)return;
          workspace?.contentChanged();
        }else if(!force && doc && canvas && deckEditStructureFingerprint(appliedHtml)===deckEditStructureFingerprint(html) && canvas.applySnapshot(inspectDeckEdit(html).nodes)) {
          frameHtml=html;appliedHtml=html;renderedHtml=html;
          if(rendererBehind){rendererBehind=false;void doc.deckRenderer?.update({slides:[],structure:false,appearance:false,customization:false});}
          workspace?.contentChanged();
        }else await replacePreview(html,ticket,abort.signal);
        if(ticket===paintGeneration){clearPaintError();render();}
      }catch(error){if(!disposed&&ticket===paintGeneration&&!abort.signal.aborted){paintFailed=true;if(!frameReady)opening.fail(error instanceof Error?deckErrorMessage(error,t):t("deckEditor.session.paintPrepareFailed"));showError(error instanceof Error?deckErrorMessage(error,t):t("deckEditor.session.paintUpdateFailed"));paintError=alert.textContent;render();}}
      finally {progress.finish();pendingPaints--;if(!disposed&&!paintFailed&&pendingPaints===0&&(frameHtml!==source()||rendererBehind)&&!canvas?.isInteracting())schedulePaint();else if(!disposed&&pendingPaints===0)warmSource();deferred();}
    })();
  }
  function applySnapshot(value: Snapshot): void {
    if(value.versionNumber<snapshot.versionNumber)return;
    value={...value,viewerId:value.viewerId??snapshot.viewerId,pageId:value.pageId??snapshot.pageId};
    if(!value.collaboration&&!snapshot.collaboration){
    try{
      const operations=queue.pendingOperations();
      const projected=operations.length?localEdits.apply(value.html,operations).html:value.html;
      snapshot=value;sourceCache={html:value.html,queue,revision:queue.revision,value:projected};
      delayedSnapshot=canvas?.isInteracting()?value:null;updatePresence(value.presence);
      if(!delayedSnapshot)schedulePaint();
    }catch(error){snapshot=value;queue.failed("conflict");showError(error instanceof Error?deckErrorMessage(error,t):t("deckEditor.session.changesOverlap"));persist();}

      render();return;
    }
    const previous=snapshot;
    const newGeneration=Boolean(value.collaboration&&previous.collaboration&&value.collaboration.epoch!==previous.collaboration.epoch);
    if(newGeneration&&(queue.busy||canvas?.isInputBlocked())){delayedSnapshot=value;updatePresence(value.presence);return;}
    if(newGeneration&&queue.dirty){snapshot=value;queue.failed("conflict");showError(t("deckEditor.session.sourceRestructured"));persist();render();return;}
    if(newGeneration){queue=new DeckEditQueue(value.versionId);sourceCache=null;}
    if(value.collaboration?canvas?.isInputBlocked():canvas?.isInteracting()){
      snapshot=value;sourceCache=null;delayedSnapshot=value;updatePresence(value.presence);
      if(value.collaboration){try{canvas?.applyAvailableSnapshot(inspectDeckEdit(source()).nodes);}catch{/* Keep the interaction and stage incompatible changes. */}}
      render();return;
    }
    try{
      snapshot=value;sourceCache=null;projection();delayedSnapshot=null;updatePresence(value.presence);
      paintPending(false,Boolean(value.collaboration));
    }catch(error){
      if(value.collaboration&&queue.previewBatches().some(batch=>batch.baseVersionId!==undefined)){
        snapshot=previous;sourceCache=null;delayedSnapshot=value;updatePresence(value.presence);return;
      }
      snapshot=value;queue.failed("conflict");showError(error instanceof Error?deckErrorMessage(error,t):t("deckEditor.session.changesOverlap"));persist();
    }
    render();
  }
  function materializeUpdate(value:z.infer<typeof pollSchema>,base:string):Snapshot|null{
    if(value.versionNumber<snapshot.versionNumber)return null;
    if(value.html!==undefined&&value.previewHtml!==undefined)return {...snapshot,...value,updatedAt:value.updatedAt,updatedBy:value.updatedBy,html:value.html,previewHtml:value.previewHtml,previewHref:value.previewHref,inverse:[]};
    if(!value.batches)return null;
    let batches=value.batches;
    if(snapshot.versionId!==base){
      const received=batches.findIndex(batch=>batch.versionId===snapshot.versionId);
      if(received<0)throw new Error(t("deckEditor.session.refetchingDiff"));
      batches=batches.slice(received+1);
    }
    const {html,previewHtml}=snapshot.previewHref!==undefined?{html:applyDeckSourceBatches(snapshot.html,batches),previewHtml:""}:applyDeckRevisionBatches(snapshot,batches);
    return {...snapshot,...value,updatedAt:value.updatedAt,updatedBy:value.updatedBy,html,previewHtml,inverse:[]};
  }
  function enqueue(operations: DeckEditOperation[], alreadyPainted=false): void {
    if(!operations.length)return;
    const commandId=crypto.randomUUID();
    const seeded=operations.map(op=>op.kind==="insert"||op.kind==="fragment"||op.kind==="restore"||op.kind==="remove"?{...op,commandId:op.commandId??commandId,textSeed:op.textSeed??crypto.randomUUID()}:{...op,commandId:op.commandId??commandId});
    let checkpoint:ReturnType<DeckTextBindings["checkpoint"]>={};
    let encoded:DeckEditOperation[]=seeded;
    let nextApplied=appliedHtml, beforeSource="",typingBase:Record<string,TextState>|undefined;
    let change:{html:string;inverse:DeckEditOperation[];operations?:DeckEditOperation[];collaboration?:DeckCollaboration};
    try{
      const before=source(),projected=projection();beforeSource=before;typingBase=projected.collaboration?.fields;
      checkpoint=textBindings?.checkpoint(seeded)??{};
      encoded=textBindings?textBindings.encode(seeded):seeded;
      change=projected.collaboration?applyCollaborativeOperations(before,projected.collaboration,encoded):localEdits.apply(before,encoded);
      if(alreadyPainted){
        // Reuse only when both the base bytes and the visible operations match.
        // A CRDT merge can change the resulting text even if the old strings
        // were equal, so comparing the bases alone is insufficient (IME).
        const same=change.operations!==undefined?change.operations.length===operations.length&&change.operations.every((op,index)=>visibleOperation(op)===visibleOperation(operations[index])):true;
        nextApplied=appliedHtml===before&&same?change.html:applyDeckEditOperations(appliedHtml,operations).html;
      }
    }catch(error){
      textBindings?.rollback(checkpoint);
      if(snapshot.collaboration&&error instanceof DeckEditConflictError&&error.category==="operation"&&deckEditOperationsSchema.safeParse(seeded).success){
        const id=crypto.randomUUID();queue.enqueue(seeded,id);queue.quarantine(id,deckErrorMessage(error,t));changed=true;persist();showError(deckErrorMessage(error,t));render();queueMicrotask(()=>paintPending(false,true));return;
      }
      throw error;
    }
    queue.enqueue(change.operations??encoded,crypto.randomUUID(),operations.every(op=>op.kind==="text"),change.inverse);
    if(typingBase&&snapshot.collaboration){const base=typingBase,latest=snapshot.collaboration.fields;queue.compactTyping((id,ops)=>compactTyping(id,ops,base,latest));}
    renderedHtml=change.html;
    sourceCache={html:snapshot.html,queue,revision:queue.revision,value:change.html,collaboration:change.collaboration};
    if(!snapshot.collaboration){const patch=localEdits.takePatch();if(patch&&patch.before===beforeSource&&patch.after===change.html)workspace?.adoptLocalSource(patch);}
    if(alreadyPainted){appliedHtml=nextApplied;if(!pendingPaints)frameHtml=appliedHtml;workspace?.refresh();}

    if(!operations.some(op=>op.kind==="setting"&&op.name==="title"))titleSource=change.html;
    changed=true;persist();render();
    if(delayedSnapshot&&!canvas?.isInteracting())applySnapshot(delayedSnapshot);
    if(snapshot.collaboration)scheduleSend();
  }
  function commit(operations:DeckEditOperation[]):boolean{
    if(draftPending||queue.status==="conflict"||queue.status==="paused")return false;
    if(canvas&&!canvas.flush())return false;
    try{
      const before=source(), refined=refineDeckOperations(before,operations);
      const direct=!snapshot.collaboration && canvas && appliedHtml===before && !pendingPaints && canvas.canApplyDirect(refined);
      enqueue(refined);
      if(direct && canvas?.applyRemote(refined)) {
        appliedHtml=source();frameHtml=appliedHtml;renderedHtml=appliedHtml;titleSource=appliedHtml;
        workspace?.refresh();render();
      } else schedulePaint();
      return true;
    }
    catch(error){showError(error instanceof Error?deckErrorMessage(error,t):t("deckEditor.session.operationFailed"));return false;}
  }
  function history(direction:"undo"|"redo"):void{
    if(canvas&&!canvas.flush())return;
    const operations = queue.historyOperations(direction);
    const before = source();
    const direct = !snapshot.collaboration && operations && canvas?.canApplyDirect(operations) && appliedHtml === before && !pendingPaints;
    const accepted=direction==="undo"?queue.undo(crypto.randomUUID()):queue.redo(crypto.randomUUID());if(!accepted)return;
    try{
      if (direct && operations && canvas) {
        const result = localEdits.apply(before, operations);
        sourceCache = {html:snapshot.html,queue,revision:queue.revision,value:result.html};
        if (canvas.applyRemote(operations)) {
          appliedHtml=result.html;frameHtml=result.html;renderedHtml=result.html;titleSource=result.html;
          workspace?.refresh();
        }
      } else paintPending(false,true);
    }catch(error){queue.failed("conflict");showError(error instanceof Error?deckErrorMessage(error,t):t("deckEditor.session.undoOverlap"));}
    changed=true;persist();render();
  }
  async function recover():Promise<void>{
    const globalConflict=queue.status==="conflict";
    if(queue.busy||queue.needsReview&&queue.pending&&!globalConflict)return;
    const originalQueue=queue;
    const recoveryGeneration=queue.generation;
    const unchanged=()=>queue===originalQueue&&!queue.busy&&queue.generation===recoveryGeneration;
    const operations=globalConflict?[...queue.reviewOperations(),...queue.pendingOperations()]:queue.needsReview?queue.reviewOperations():queue.pendingOperations();
    try{const latest=snapshotSchema.parse(await request("GET",undefined,`?${new URLSearchParams({page:hooks.pageSlug,sessionId})}`));
      if(!unchanged()){showError(t("deckEditor.session.stateUpdated"));return;}
      workspace?.recovery(latest.html,operations,ops=>{
        try{
          if(!unchanged()||snapshot.collaboration?.epoch!==latest.collaboration?.epoch)throw new Error(t("deckEditor.session.stateUpdated"));
          const chosen=ops.map((original):DeckEditOperation=>{const op={...original};delete op.commandId;delete op.reverts;delete op.expects;delete op.restores;delete op.textStates;return op.kind==="text"?{kind:"text",target:op.target,run:op.run,before:op.before,after:op.after}:op.kind==="insert"||op.kind==="fragment"||op.kind==="restore"||op.kind==="remove"?{...op,textSeed:crypto.randomUUID()}:op;});
          const current=snapshot.versionNumber>=latest.versionNumber?snapshot:latest;
          const candidate=current.collaboration?applyCollaborativeOperations(current.html,current.collaboration,chosen,latest.collaboration):applyDeckEditOperations(current.html,chosen);
          const next=new DeckEditQueue<DeckEditOperation>(current.versionId);
          if(chosen.length)next.enqueue("operations" in candidate?candidate.operations:chosen,crypto.randomUUID(),false,candidate.inverse);
          const draft=JSON.stringify(next.exportDraft(Date.now()));if(draft.length>DRAFT_LIMIT)throw new LocalizedError("deckEditor.session.recoverTooLarge");
          if(next.dirty)localStorage.setItem(draftKey,draft);else localStorage.removeItem(draftKey);
          snapshot=current;queue=next;sourceCache=null;draftPending=false;alert.hidden=true;
          if(current.collaboration){textBindings?.destroy();textBindings=new DeckTextBindings(current.collaboration.fields);}
          rebuild();render();
        }catch(error){showError(error instanceof Error?deckErrorMessage(error,t):t("deckEditor.session.recoverFailed"));}
      });
    }catch(error){showError(error instanceof Error?deckErrorMessage(error,t):t("deckEditor.session.latestUnreadable"));}
  }
  const recoverButton=button(t("deckEditor.session.reviewChanges"),()=>{void recover();});recoverButton.hidden=true;
  function startPresentation():void{
    mediaQueue?.close();
    const doc=frame.contentDocument;if(!workspace?.hasSlides()||!doc||!frameReady||!canvas?.flush())return;
    const slide=workspace?.currentSlide();const target=slide?[...doc.querySelectorAll<HTMLElement>("section[data-deck-slide]")].find(n=>n.getAttribute("data-deck-node")===slide):null;
    target?.closest<HTMLElement>("[data-deck-frame]")?.click();
    const trigger=[...doc.querySelectorAll<HTMLButtonElement>("[data-deck-toolbar] button")].find(n=>n.textContent?.includes("プレゼンを始める")); // i18n-keep: 保存済みページの実行部（src/templates/deck.html）の発表ボタンを字面で探す
    if(!trigger){showError(t("deckEditor.session.presentUnsupported"));return;}
    if(trigger.disabled){showError(trigger.title || t("deckEditor.session.noSlidesToPresent"));return;}
    const history=doc.defaultView?.history,replace=history?.replaceState;
    if(history&&replace&&doc.location.protocol==="about:")history.replaceState=(data,unused)=>replace.call(history,data,unused);
    canvas.setReadOnly(true);presenting=true;frame.style.cssText="position:fixed;inset:var(--titlebar-h,0px) 0 0 0;width:100%;height:calc(100% - var(--titlebar-h,0px));z-index:30";trigger.click();
    const observer=new MutationObserver(()=>{if(doc.documentElement.getAttribute("data-deck-mode")!=="present"){observer.disconnect();if(history&&replace)history.replaceState=replace;frame.style.cssText="";presenting=false;canvas?.setReadOnly(false);workspace?.refresh();}});observer.observe(doc.documentElement,{attributes:true,attributeFilter:["data-deck-mode"]});lifetime.signal.addEventListener("abort",()=>observer.disconnect(),{once:true});
  }
  function present():void{if(queue.status==="conflict"){showError(t("deckEditor.session.presentReviewFirst"));return;}if(canvas&&!canvas.flush())return;if(frameHtml!==source()||appliedHtml!==source()||paintFailed){waitingToPresent=true;showError(t("deckEditor.session.presentAfterPaint"));return;}if(!connected||queue.status==="offline"||queue.status==="paused"){showError(t("deckEditor.session.presentOffline"));startPresentation();return;}if(queue.pending||pendingUploads>0){waitingToPresent=true;showError(t("deckEditor.session.presentAfterSave"));return;}startPresentation();}
  const undoButton = button(t("deckEditor.session.undo"), () => history("undo")); undoButton.title = "⌘Z / Ctrl+Z";
  const redoButton = button(t("deckEditor.session.redo"), () => history("redo")); redoButton.title = "⇧⌘Z / Ctrl+Shift+Z";
  const retryButton = button(t("deckEditor.session.retry"), () => { queue.retry(); nextAttempt = 0; if(paintFailed)paintPending(true); render(); });
  function exportDraft(): void {
    canvas?.flush(); persist();
    const href = URL.createObjectURL(new Blob([JSON.stringify(queue.exportDraft(Date.now()), null, 2)], { type: "application/json" }));
    const link = el("a"); link.href = href; link.download = t("deckEditor.session.unsavedFile"); link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  const reloadButton = button(t("deckEditor.session.reloadLatest"), () => {
    if (reopenRequired) {
      if (queue.dirty || !canvas?.flush() || canvas.isInteracting()) return;
      close(() => { void openDeckEditSession(hooks); });
      return;
    }
    if (!structuralSnapshot || queue.dirty || !canvas?.flush() || canvas.isInteracting()) return;
    snapshot = structuralSnapshot;
    structuralSnapshot = null; delayedSnapshot = null;
    queue = new DeckEditQueue(snapshot.versionId);
    alert.hidden = true;
    rebuild();
    render();
  });
  function close(afterClose?: () => void): void {
    if (pendingUploads > 0 || workspace?.busy()) { showError(t("deckEditor.session.mediaBusyClose")); return; }
    if (canvas && !canvas.flush()) { showError(t("deckEditor.session.compositionClose")); return; }
    if (presenter && !presenter.flush()) return;
    presenter?.close();
    const willReload = !afterClose && (changed || snapshot.versionId !== initialVersion || structuralSnapshot !== null) && !queue.dirty;
    persist(); disposed = true; localEdits.dispose();feedback.dispose();
    if (timer) clearTimeout(timer);
    if(sendTimer)clearTimeout(sendTimer);
    if(receiveTimer)clearTimeout(receiveTimer);
    releaseDraft();textBindings?.destroy();mediaQueue?.dispose();imagePalette?.dispose(); lifetime.abort(); paintAbort?.abort(); canvas?.dispose();workspace?.dispose();

    if(scheduledPaint!==undefined)cancelAnimationFrame(scheduledPaint);
    if(paintTask!==undefined)clearTimeout(paintTask);
    window.removeEventListener("beforeunload", beforeUnload);
    window.removeEventListener("online", online);
    window.removeEventListener("offline", offline);
    // Reveal the already loaded reader before destroying large iframe documents.
    // All listeners, timers and editing ownership have already been released.
    screen.style.display="none";screen.inert=true;document.documentElement.style.overflow=outerOverflow;
    // Keep reader focus refresh paused while hiding the focused editor. A
    // reload immediately replaces this document, so do not refocus its tools.
    try { resumeReader();opening.dispose(!willReload); } finally { setDeckEditSessionActive(false); }
    let removed=false,cleanupFrame=0;
    const removeScreen=()=>{if(removed)return;removed=true;clearTimeout(cleanupDeadline);cancelAnimationFrame(cleanupFrame);screen.remove();};
    cleanupFrame=requestAnimationFrame(()=>setTimeout(removeScreen,0));
    const cleanupDeadline=setTimeout(removeScreen,100);
    void fetch(`${API}?${new URLSearchParams({ page: hooks.pageSlug, sessionId })}`, { method: "DELETE", credentials: "same-origin", keepalive: true }).catch(() => undefined);
    if (afterClose) afterClose();
    else if (willReload) { hooks.onSaved?.({ baseVersionId: initialVersion }); window.location.reload(); }
    else { hooks.notify(queue.dirty ? t("deckEditor.session.draftKept") : t("deckEditor.session.closed")); hooks.onClosed?.(); }
  }
  const doneButton = button(t("deckEditor.session.done"), () => { if(canvas&&!canvas.flush())return;if(queue.dirty)workspace?.confirmClose(()=>close());else close(); });
  const designButton = button(t("deckEditor.session.design"),()=>workspace?.design());designButton.setAttribute("data-studio-design","");
  const insertButton=button(t("deckEditor.session.insertButton"),()=>workspace?.insertionMenu());
  const imageButton=button(t("deckEditor.session.images"),()=>{workspace?.clearReplaceTarget();imagePalette?.setOpen(!(imagePalette?.isOpen()??false),false);});
  /** 画面が 2 つあるときの「発表」は、手元を発表者画面にして観客用の窓を向こうへ開き、そのまま始める。 */
  const presentButton=button(t("deckEditor.session.present"),()=>{if(hasSecondScreen()&&!presenter)openPresenter(true);else present();});presentButton.classList.add("ds-primary");
  /** fromReader: 読む画面の入口から来たとき。窓はそちらで開いてあり、閉じたら編集画面ごと閉じて読む画面へ戻る。 */
  function openPresenter(start:boolean,fromReader?:NonNullable<EditorHooks["presenter"]>):void{
    if(presenter || canvas && !canvas.flush())return;
    if(queue.dirty||pendingUploads||draftPending||structuralSnapshot||reopenRequired){fromReader?.audienceWindow?.close();showError(start?t("deckEditor.session.presentSaveFirst"):t("deckEditor.session.presenterSaveFirst"));return;}
    // 窓は押した瞬間にしか開けないので、発表者画面の準備より先に開いて向こうの画面へ送る。
    const audienceWindow=fromReader?fromReader.audienceWindow:start?window.open("about:blank","","popup,width=1280,height=720"):null;
    if(audienceWindow&&!fromReader)void moveToOtherScreen(audienceWindow);
    frame.contentDocument?.deckPauseVideos?.();mediaQueue?.close();
    presenter=openDeckPresenter({host:screen,saved:()=>snapshot,preview:previewSource,source,status:()=>status.textContent??"",commit,
      current:()=>fromReader?.slide??workspace?.currentSlide()??null,audienceWindow,closeLabel:fromReader?t("deckEditor.session.close"):undefined,
      closed:()=>{presenter=null;if(fromReader)close();else (start?presentButton:presenterButton).focus();}});
    pollNeeded=true;void receiveChanges();
  }
  const presenterButton=button(t("deckEditor.session.presenterView"),()=>openPresenter(false));
  title.onclick=()=>workspace?.documentMenu();
  styleDeckButton(undoButton,"undo",true,t("deckEditor.session.undoShortcut"));styleDeckButton(redoButton,"redo",true,t("deckEditor.session.redoShortcut"));
  styleDeckButton(insertButton,"plus",false,t("deckEditor.session.insert"));styleDeckButton(imageButton,"image");styleDeckButton(presentButton,"play");styleDeckButton(presenterButton,"presenter");
  const historyTools=el("div","ds-history-tools");historyTools.setAttribute("role","group");historyTools.setAttribute("aria-label",t("deckEditor.session.history"));historyTools.append(undoButton,redoButton);
  bar.append(title,historyTools,insertButton,imageButton,designButton,el("span","ds-spacer"),status,feedback.root,presence,reloadButton,retryButton,recoverButton,presentButton,presenterButton,doneButton);
  function currentSlide(): string | null {
    return workspace?.currentSlide() ?? canvas?.currentSlide() ?? null;
  }
  function insert(operations: DeckEditOperation[], target: {id:string;type:"image"|"video"}|null = null): void {
    if (target) {
      const doc = new DOMParser().parseFromString(source(), "text/html");
      const old = [...doc.querySelectorAll<HTMLElement>("[data-deck-node]")].find(n => n.getAttribute("data-deck-node") === target.id);
      const op = operations.find(op => op.kind === "insert");
      if (old && op?.kind === "insert" && op.node.tag !== "p" && op.node.tag !== "youtube") {
        const part = deckSourceFragment(source(), target.id);
        if (part) {
          let media = old;
          if (old.hasAttribute("data-deck-media-slot") || old.tagName.toLowerCase() !== op.node.tag) {
            media = doc.createElement(op.node.tag);
            for (const attr of old.attributes)
              if (["id","class","style","width","height","data-deck-node","data-deck-created","data-deck-locked","aria-hidden"].includes(attr.name) || attr.name.startsWith("data-dd-")) media.setAttribute(attr.name, attr.value);
            const style = old.getAttribute("data-deck-media-style");
            if (style) media.setAttribute("style", style);
          }
          media.setAttribute("src", op.node.src);
          if (op.node.tag === "video") {
            media.setAttribute("poster", op.node.poster);media.setAttribute("aria-label",op.node.label);
            media.setAttribute("controls", "");media.setAttribute("playsinline", "");media.setAttribute("preload", "none");
          } else media.setAttribute("alt", op.node.alt);
          commit([{kind:"fragment",target:target.id,parentId:part.parentId,beforeId:part.beforeId,before:part.html,after:media.outerHTML}]);
        }
      }
      workspace?.clearReplaceTarget();imagePalette?.refresh();return;
    }
    const added=operations.flatMap(op=>op.kind==="insert"?[op.node.id]:[]);if(added.length)workspace?.rememberSelection(added);
    commit(operations);imagePalette?.refresh();
  }
  function upload(files: File[], slideId: string, point: {x:number;y:number}|null, dropTarget?: {id:string;type:"image"|"video"}|null):void {
    const replacing=dropTarget === undefined ? workspace?.replaceTarget()??null : dropTarget;workspace?.clearReplaceTarget();
    if(replacing&&files.length!==1){showError(t("deckEditor.session.replaceOne"));return;}
    files.forEach((file,index)=>enqueueMedia(file,slideId,point?{x:point.x+index*24,y:point.y+index*24}:null,replacing));
  }
  async function waitForMediaSave(signal:AbortSignal){
    const deadline=Date.now()+30000;
    while(queue.pending){if(disposed||signal.aborted)throw new DOMException(t("deckEditor.session.stopped"),"AbortError");if(Date.now()>deadline||queue.status==="conflict"||queue.status==="paused")throw new MediaFailure("save",t("deckEditor.session.placementUnsaved"));await new Promise(resolve=>setTimeout(resolve,100));}
  }
  function enqueueMedia(input:File|string|PaletteChoice,slideId:string,point:{x:number;y:number}|null,replacement:{id:string;type:"image"|"video"}|null=null){
    let targetSlide=slideId,targetNode=`node-${crypto.randomUUID()}`,jobId=crypto.randomUUID(),replacing=replacement;
    let name=typeof input==="string"?t("deckEditor.session.fromLink"):isMediaFile(input)?input.name:input.title;
    let asset:{src:string;poster?:string;originalSrc?:string;intrinsicWidth?:number;intrinsicHeight?:number;bytes:number;originalBytes:number;optimized?:boolean;kind?:string}|null=null;
    const expectedSource=replacing?new DOMParser().parseFromString(source(),"text/html").querySelector(`[data-deck-node="${CSS.escape(replacing.id)}"]`)?.getAttribute("src"):null;
    mediaQueue?.enqueue({get id(){return jobId;},name,onState:(state,message,retry,cancel,canCancel)=>{if(typeof input!=="string"&&!(isMediaFile(input)))imagePalette?.transfer(jobId,state,message,retry,cancel,canCancel,input.kind==="remote"?input.sourcePageUrl:undefined);},reselect:file=>{input=file;name=file.name;asset=null;targetNode=`node-${crypto.randomUUID()}`;jobId=crypto.randomUUID();},retarget:()=>{const current=currentSlide();if(!current)throw new Error(t("deckEditor.session.addSlideFirst"));targetSlide=current;targetNode=`node-${crypto.randomUUID()}`;jobId=crypto.randomUUID();replacing=null;},run:async(signal,progress)=>{
      const doc=new DOMParser().parseFromString(source(),"text/html");
      if(!doc.querySelector(`section[data-deck-node="${CSS.escape(targetSlide)}"]`))throw new MediaTargetError(t("deckEditor.session.targetDeleted"));
      const clearPlaceholder=canvas?.showMediaPlaceholder(targetSlide,point,replacing?.id)??(()=>{});
      try{
      const youtube=typeof input==="string"?youtubeId(input):null;
      if(youtube){
        const ops:DeckEditOperation[]=[],runtime=deckSourceSetting(source(),"navigation");
        if(runtime!==navigationRuntime)ops.push({kind:"setting",target:"deck-document",name:"navigation",before:runtime,after:navigationRuntime});
        const placed=point??{x:280,y:158};ops.push({kind:"insert",target:targetSlide,node:{id:targetNode,tag:"youtube",videoId:youtube,label:"YouTube動画"/* i18n-keep: 原稿に入る再生枠の名前 */,style:{position:"absolute",left:`${Math.max(0,Math.min(560,placed.x))}px`,top:`${Math.max(0,Math.min(315,placed.y))}px`,width:"720px",height:"405px"}}});
        workspace?.rememberSelection([targetNode]);if(!commit(ops))throw new LocalizedError("deckEditor.session.videoPlacementFailed");await waitForMediaSave(signal);return {message:t("deckEditor.session.youtubeSaved")};
      }
      if(!asset){
        if(typeof input==="string"){
          progress(t("deckEditor.session.fetchingLink"));
          const response=await fetch(`${API}/media/import`,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({page:hooks.pageSlug,url:input}),signal});
          const body:unknown=await response.json();if(!response.ok){const reason=z.object({error:z.string(),code:z.enum(MEDIA_FAILURE_CODES).optional()}).safeParse(body);throw new MediaFailure(reason.success&&reason.data.code?reason.data.code:response.status===401?"auth":response.status===403||response.status===404?"permission":"remote",reason.success?reason.data.error:t("deckEditor.session.linkUnavailable"));}
          asset=z.object({src:z.string(),poster:z.string().optional(),intrinsicWidth:z.number().optional(),intrinsicHeight:z.number().optional(),bytes:z.number(),originalBytes:z.number(),kind:z.string()}).parse(body);
        }else if(isMediaFile(input)){
          const type=mediaFileType(input);if(!type)throw new MediaFailure("format",t("deckEditor.session.formatsImage"));
          const limit=10;if(!input.size)throw new MediaFailure("empty",t("deckEditor.session.emptyFile"));if(input.size>limit*1024*1024)throw new MediaFailure("size",t("deckEditor.session.tooLarge",{size:formatMediaBytes(input.size),limit}));
          const result=await uploadMediaFile({file:input,page:hooks.pageSlug,signal,progress:(done,total)=>progress(done===total?t("deckEditor.session.imageOptimizing"):t("deckEditor.session.sendingPercent",{percent:Math.floor(done/total*100)}))});
          asset=result;
        }else if(input.kind==="current"){
          asset={src:input.src,intrinsicWidth:input.width,intrinsicHeight:input.height,bytes:0,originalBytes:0,kind:"image"};
        }else{
          progress(t("deckEditor.session.imagePrivate"));
          const request=imageRequest(hooks.pageSlug,input.value);
          const response=await fetch(request.endpoint,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(request.body),signal});
          const body:unknown=await response.json();if(!response.ok){const reason=z.object({error:z.string()}).safeParse(body);throw new MediaFailure(response.status===413?"size":response.status===401?"auth":response.status===403||response.status===404?"permission":"remote",reason.success?reason.data.error:t("deckEditor.session.imageAddFailed"));}
          asset=z.object({src:z.string(),intrinsicWidth:z.number(),intrinsicHeight:z.number(),bytes:z.number(),originalBytes:z.number().optional(),kind:z.string().optional()}).transform(value=>({...value,originalBytes:value.originalBytes??value.bytes})).parse(body);
        }
      }
      if(signal.aborted||disposed)throw new DOMException(t("deckEditor.session.stopped"),"AbortError");
      const now=new DOMParser().parseFromString(source(),"text/html");
      if(!now.querySelector(`section[data-deck-node="${CSS.escape(targetSlide)}"]`))throw new MediaTargetError(t("deckEditor.session.mediaTargetDeleted"));
      if(replacing){const node=now.querySelector(`[data-deck-node="${CSS.escape(replacing.id)}"]`);if(!node||node.getAttribute("src")!==expectedSource)throw new MediaTargetError(t("deckEditor.session.replaceTargetChanged"));}
      const intrinsicWidth=asset.intrinsicWidth??480,intrinsicHeight=asset.intrinsicHeight??270,scale=Math.min(1,720/intrinsicWidth,540/intrinsicHeight),width=intrinsicWidth*scale,height=intrinsicHeight*scale;
      const placed=point??{x:(1280-width)/2,y:(720-height)/2};
      const style={position:"absolute",left:`${Math.max(0,Math.min(1280-width,placed.x))}px`,top:`${Math.max(0,Math.min(720-height,placed.y))}px`,width:`${width}px`,height:`${height}px`,"object-fit":"contain"};
      const existing=now.querySelector(`[data-deck-node="${CSS.escape(replacing?.id??targetNode)}"]`);
      if(!existing||replacing)insert([{kind:"insert",target:targetSlide,node:{id:targetNode,tag:"img",src:asset.src,alt:typeof input==="string"?"追加した画像"/* i18n-keep: 原稿に入る代替テキスト */:isMediaFile(input)?input.name:input.title,style}}],replacing);
      const id=replacing?.id??targetNode;
      if(new DOMParser().parseFromString(source(),"text/html").querySelector(`[data-deck-node="${CSS.escape(id)}"]`)?.getAttribute("src")!==asset.src)throw new MediaTargetError(t("deckEditor.session.placementFailedNew"));
      progress(t("deckEditor.session.placementSaving"),"save");await waitForMediaSave(signal);
      const uploaded=asset;
      return {message:t("deckEditor.session.savedBytes",{from:formatMediaBytes(asset.originalBytes),to:formatMediaBytes(asset.bytes)}),...(asset.optimized&&asset.originalSrc&&asset.originalSrc!==asset.src?{original:async()=>{if(!commit([{kind:"image",target:id,before:uploaded.src,after:uploaded.originalSrc!}]))throw new LocalizedError("deckEditor.session.originalUnsaved");await waitForMediaSave(lifetime.signal);}}:{})};
      }finally{clearPlaceholder();}
    }});
  }
  function addText():void {
    workspace?.clearReplaceTarget();
    const target = currentSlide(); if (!target) return;
    const id = `node-${crypto.randomUUID()}`;
    insert([{ kind: "insert", target, node: { id, tag: "p", text: "テキスト"/* i18n-keep: 原稿に入る新しい文字の初期値 */, style: { position: "absolute", left: "160px", top: "160px", width: "400px", "font-size": "32px" } } }]);
  }
  fileInput.addEventListener("cancel",()=>imagePalette?.resetMode());
  function chooseMedia(input:HTMLInputElement):void{if(!frameReady||draftPending||queue.status==="conflict")return;input.click();}
  fileInput.addEventListener("change", () => { const target = currentSlide(); if (target && fileInput.files) void upload(Array.from(fileInput.files), target, null); fileInput.value = ""; });
  screen.append(styles,bar,notice,alert,fileInput);
  function currentPaletteImages(){
    const base=frame.contentDocument?.baseURI??location.href,seen=new Set<string>();
    return inspectDeckEdit(source()).nodes.flatMap(node=>{
      if(node.tag!=="img"||!node.src||!isDeckEditImagePath(node.src)||seen.has(node.src))return[];seen.add(node.src);
      const image=frame.contentDocument?.querySelector<HTMLImageElement>(`img[data-deck-node="${CSS.escape(node.id)}"]`);
      const width=image?.naturalWidth||Math.round(parseFloat(node.style.width)||480),height=image?.naturalHeight||Math.round(parseFloat(node.style.height)||270);
      return [{src:node.src,title:node.alt?.trim()||t("deckEditor.session.imageFallback"),width,height,previewUrl:new URL(node.src,base).href}];
    });
  }
  function choosePalette(choice:PaletteChoice){const target=currentSlide();if(!target){showError(t("deckEditor.session.addSlideFirst"));return;}enqueueMedia(choice,target,null,workspace?.replaceTarget()??null);imagePalette?.resetMode();}
  async function savedSource(){
    if(!canvas?.flush())throw new Error(t("deckEditor.session.inputCheck"));
    queue.retry();nextAttempt=0;
    const deadline=Date.now()+20000;
    while(queue.pending||pendingUploads>0){if(disposed||Date.now()>deadline||queue.status==="conflict"||queue.status==="paused")throw new Error(t("deckEditor.session.saveUnconfirmed"));await new Promise(resolve=>setTimeout(resolve,100));}
    return {html:source(),versionId:snapshot.versionId};
  }
  workspace=createDeckWorkspace({pageSlug:hooks.pageSlug,screen,bar,get frame(){return frame;},source,inspectNode:id=>snapshot.collaboration?inspectDeckNode(source(),id):localEdits.inspect(source(),id),savedSource,preview,canvas:()=>canvas,commit,fail:showError,busyChanged:()=>{if(!disposed)render();},addText,addImage:()=>imagePalette?.setOpen(true,false),openImages:replace=>imagePalette?.setOpen(true,replace),addLink,exportDraft,present,openTools:panel=>{const open=()=>close(()=>{const url=new URL(window.location.href);url.searchParams.set("deck-panel",panel);window.location.assign(url.href);});if(queue.pending||pendingUploads){afterSaved=open;showError(t("deckEditor.session.opensAfterSave"));}else open();}});
  imagePalette=createDeckImagePalette({page:hooks.pageSlug,current:currentPaletteImages,chooseFile:()=>chooseMedia(fileInput),addLink,choose:choosePalette,open:open=>workspace?.setImagesOpen(open)??false,resetTarget:()=>workspace?.clearReplaceTarget()});
  workspace.mountImages(imagePalette.root,()=>imagePalette?.setOpen(false));
  mediaQueue=createDeckMediaQueue({page:hooks.pageSlug,open:open=>workspace?.setMediaOpen(open)??false,recoverSave:()=>{if(queue.status==="conflict")recoverButton.click();else retryButton.click();},chooseFile:receive=>{
    const chooser=el("input");chooser.type="file";chooser.accept=fileInput.accept;chooser.multiple=!receive;chooser.hidden=true;
    chooser.onchange=()=>{const target=currentSlide();if(chooser.files?.length){if(receive)receive(chooser.files[0]);else if(target)upload([...chooser.files],target,{x:160,y:160});}chooser.remove();};chooser.oncancel=()=>chooser.remove();screen.append(chooser);chooser.click();
  },changed:(busy,message)=>{pendingUploads=busy;uploadMessage=message;if(!disposed)render();},fail:showError});
  workspace.mountMedia(mediaQueue.root,mediaQueue.trigger,mediaQueue.close);
  function addLink(){
    const dialog=el("dialog","ds-dialog"),label=el("label",undefined,t("deckEditor.session.linkLabel")),field=el("input");field.type="url";field.placeholder="https://…";label.append(field);
    const add=button(t("deckEditor.session.add"),()=>{const target=currentSlide();if(!target){showError(t("deckEditor.session.addSlideFirst"));return;}if(!field.checkValidity()||!field.value){field.reportValidity();return;}enqueueMedia(field.value,target,null,workspace?.replaceTarget()??null);imagePalette?.resetMode();dialog.close();dialog.remove();});
    dialog.append(label,add,button(t("deckEditor.session.cancel"),()=>{dialog.close();dialog.remove();}));screen.append(dialog);dialog.showModal();field.focus();
  }
  screen.addEventListener("paste",event=>{
    if(event.target instanceof Element&&event.target.closest("input,textarea,[contenteditable]"))return;
    const data=event.clipboardData,target=currentSlide();if(!data||!target)return;
    if(data.files.length){event.preventDefault();upload([...data.files],target,{x:160,y:160});}
    else{const text=data.getData("text/plain").trim();if(/^https:\/\//i.test(text)){event.preventDefault();enqueueMedia(text,target,{x:160,y:160});}}
  });
  screen.addEventListener("dragover",event=>{if(event.dataTransfer?.types.includes("Files"))event.preventDefault();});
  screen.addEventListener("drop",event=>{if(event.dataTransfer?.files.length){event.preventDefault();showError(t("deckEditor.session.dropCenter"));}});
  hooks.host.append(screen);
  cancelOpening = () => close();
  // 読む画面の「発表者画面」から来たときは、編集の道具を見せずに発表者画面から始める。
  // 編集の枠は裏で準備を続ける（ノートの保存・衝突の確かめは編集画面とまったく同じ仕組みを通る）。
  if(hooks.presenter){opening.dispose();screen.inert=false;screen.removeAttribute("aria-busy");openPresenter(hooks.presenter.audienceWindow!==null,hooks.presenter);}
  const changeId=new URL(location.href).searchParams.get("change");if(changeId)openAgentReview(hooks.host,hooks.pageSlug,changeId);
  updatePresence(snapshot.presence); render();

  // Only this account/document's unowned drafts are offered. Never import an
  // unscoped legacy draft into a different account on a shared browser.
  const savedDrafts:{key:string;draft:z.infer<typeof draftSchema>}[]=[];
  try {
    const keys=snapshot.viewerId?await availableDeckDrafts(snapshot.viewerId,draftPage,draftKey):[draftKey];
    for(const key of keys){
      const result=draftSchema.safeParse(JSON.parse(localStorage.getItem(key)??"null"));
      if(!result.success||Date.now()-result.data.savedAt>=DECK_DRAFT_TTL||Date.now()<result.data.savedAt){localStorage.removeItem(key);continue;}
      if(result.data.batches.length||result.data.rejected?.length)savedDrafts.push({key,draft:result.data});
    }
  }catch{showError(t("deckEditor.session.draftUnreadable"));}
  if(disposed)return;
  savedDrafts.sort((a,b)=>a.key===draftKey?-1:b.key===draftKey?1:b.draft.savedAt-a.draft.savedAt);
  if(savedDrafts.length){
    draftPending=true;notice.hidden=false;
    let choice=savedDrafts[0];
    const text=el("span");text.textContent=t("deckEditor.session.unsavedRemain");notice.append(text);
    const picker=el("select");picker.setAttribute("aria-label",t("deckEditor.session.draftToRecover"));
    for(const item of savedDrafts){const option=el("option");option.value=item.key;option.textContent=(item.key===draftKey?t("deckEditor.session.draftThisTab",{time:formatDateTime(widgetLocale(),item.draft.savedAt)}):t("deckEditor.session.draftClosedTab",{time:formatDateTime(widgetLocale(),item.draft.savedAt)}));picker.append(option);}
    picker.addEventListener("change",()=>{choice=savedDrafts.find(item=>item.key===picker.value)??choice;});
    if(savedDrafts.length>1)notice.append(picker);
    notice.append(button(t("deckEditor.session.restoreDraft"),()=>{void (async()=>{
      if(!canvas)return;
      // Rebuilding the document from the draft takes a whole-document pass. Show
      // that the choice was taken (its controls stop accepting input) and let
      // that paint before the rebuild, instead of freezing on the pressed button.
      const controls=[...notice.querySelectorAll<HTMLButtonElement|HTMLSelectElement>("button,select")];
      for(const control of controls)control.disabled=true;
      notice.setAttribute("aria-busy","true");
      try{
      await new Promise<void>(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
      if(disposed||!canvas)return;
      const release=choice.key===draftKey?async()=>{}:await claimDeckDraft(choice.key);
      if(!release){showError(t("deckEditor.session.draftInOtherTab"));return;}
      let adopted=false;
      try{
        const latestDraft=draftSchema.parse(JSON.parse(localStorage.getItem(choice.key)??"null"));
        const restored=DeckEditQueue.restore(latestDraft,Date.now());if(!restored)return;
        if(choice.key!==draftKey){
          if(snapshot.viewerId)rememberDeckDraft(snapshot.viewerId,draftPage,choice.key);
          await releaseDraft();draftKey=choice.key;releaseDraft=release;adopted=true;
        }
        queue=restored;sourceCache=null;draftPending=false;
        if(snapshot.collaboration)queue.observe(snapshot.versionId);else queue.advance(snapshot.versionId);
        try{paintPending(false,true);}catch{
          if(!choice.draft.batches[0]?.baseVersionId){queue.failed("conflict");showError(t("deckEditor.session.draftOverlap"));}
        }
        changed=true;notice.hidden=true;
        persist();render();
      }catch(error){showError(error instanceof Error?deckErrorMessage(error,t):t("deckEditor.session.draftRecoverFailed"));}
      finally{if(!adopted)await release();}
      }finally{notice.removeAttribute("aria-busy");for(const control of controls)control.disabled=false;}
    })();}),button(t("deckEditor.session.exportDraft"),()=>{
      const href=URL.createObjectURL(new Blob([JSON.stringify(choice.draft,null,2)],{type:"application/json"}));const link=el("a");link.href=href;link.download=t("deckEditor.session.previousFile");link.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
    }),button(t("deckEditor.session.discardDraft"),()=>{void (async()=>{
      const release=choice.key===draftKey?async()=>{}:await claimDeckDraft(choice.key);if(!release){showError(t("deckEditor.session.draftInOtherTab"));return;}
      try{
        localStorage.removeItem(choice.key);
        const index=savedDrafts.indexOf(choice);if(index>=0)savedDrafts.splice(index,1);
        if(savedDrafts.length){
          choice=savedDrafts[0];picker.replaceChildren();
          for(const item of savedDrafts){const option=el("option");option.value=item.key;option.textContent=new Date(item.draft.savedAt).toLocaleString();picker.append(option);}
          if(!picker.isConnected)notice.insertBefore(picker,notice.querySelector("button"));
        }else{draftPending=false;notice.hidden=true;}
        render();
      }finally{await release();}
    })();}));
  }
  renderedHtml=snapshot.html;
  rebuild();
  function beforeUnload(event: BeforeUnloadEvent): void {
    // A clean navigation can take time to finish. Do not restart polling between
    // beforeunload and pagehide after aborting the currently active reads.
    const attempt=++leaveAttempt;
    pageAway=true;abortReads();presenter?.flush();canvas?.flush();persist();
    if(queue.dirty||pendingUploads>0||presenter&&!presenter.flush())event.preventDefault();
    // A confirmation request does not expose the user's choice. Keep the
    // previous live-session behavior in that case, so dismissing any editor's
    // dialog cannot freeze saving. pagehide still aborts on actual departure.
    // Use a task: real browser dispatch can checkpoint microtasks between listeners.
    setTimeout(()=>{
      if(event.defaultPrevented&&!disposed&&!pageHidden&&pageAway&&attempt===leaveAttempt){
        pageAway=false;pollNeeded=true;
        if(timer)clearTimeout(timer);timer=undefined;tick();
      }
    },0);
  }
  function online(): void { connected = true; queue.retry(); nextAttempt = 0; render(); }
  function offline(): void { connected = false; render(); }
  window.addEventListener("beforeunload", beforeUnload);
  window.addEventListener("pagehide",()=>{
    pageHidden=true;pageAway=true;abortReads();
    if(timer)clearTimeout(timer);timer=undefined;
    if(sendTimer)clearTimeout(sendTimer);sendTimer=undefined;sendAt=0;
    if(receiveTimer)clearTimeout(receiveTimer);receiveTimer=undefined;
  },{signal:lifetime.signal});
  window.addEventListener("pageshow",()=>{pageHidden=false;leaveAttempt++;if(pageAway){pageAway=false;pollNeeded=true;tick();}},{signal:lifetime.signal});
  window.addEventListener("online", online);
  window.addEventListener("offline", offline);

  let pollBusy=false;
  let lastPoll=0;
  let pollNeeded=true;
  let forceFullSnapshot=false;
  let heartbeatBusy=false;
  async function heartbeat():Promise<void>{
    if(disposed||pageAway||heartbeatBusy||presenting||document.hidden||!navigator.onLine||Date.now()-lastHeartbeat<10000)return;
    heartbeatBusy=true;lastHeartbeat=Date.now();
    try{await request("POST",{page:hooks.pageSlug,action:"heartbeat",sessionId,selection:selected[0]??null,protocol:2});}
    catch{/* Presence expiry must not delay document synchronization. Reads/saves still enforce permission. */}
    finally{heartbeatBusy=false;}
  }
  function scheduleSend():void{
    if(disposed||pageAway||networkBusy||!queue.pending||!navigator.onLine)return;
    const at=Math.max(Date.now(),lastSendAt+150,nextAttempt);
    if(sendTimer&&sendAt<=at)return;
    if(sendTimer)clearTimeout(sendTimer);
    sendAt=at;sendTimer=setTimeout(()=>{sendTimer=undefined;sendAt=0;void sendPending();},Math.max(0,at-Date.now()));
  }
  async function sendPending(): Promise<void> {
    if (disposed || pageAway || networkBusy || presenting || Date.now()<nextAttempt || !navigator.onLine) return;
    const batch=queue.next();if(!batch)return;
    networkBusy=true;lastSendAt=Date.now();persist();render();
    try {
      const reply=acknowledgementSchema.parse(await request("PATCH",{page:hooks.pageSlug,sessionId,operationId:batch.operationId,baseVersionId:batch.baseVersionId,operations:batch.operations,protocol:snapshot.collaboration?2:undefined,epoch:snapshot.collaboration?.epoch,delta:Boolean(snapshot.collaboration)}));
      if(disposed)return;
      let value:Snapshot|null=null;
      try{value=materializeUpdate(reply,batch.baseVersionId);}catch{/* Fetch a complete, authorized snapshot below. */}
      if(!value&&reply.versionNumber>=snapshot.versionNumber){
        value=snapshotSchema.parse(await request("GET",undefined,`?${new URLSearchParams({page:hooks.pageSlug,sessionId,protocol:"2",delta:"0"})}`));
        if(value.versionNumber<reply.versionNumber)throw new RequestFailure(t("deckEditor.session.verifyingSaved"),503);
      }
      if(disposed)return;
      queue.acknowledge(reply.versionId,reply.inverse);
      connected=true;if(value)applySnapshot(value);if(delayedSnapshot&&!canvas?.isInputBlocked())applySnapshot(delayedSnapshot);if(snapshot.collaboration)queue.observe(snapshot.versionId);
      if(queue.status!=="conflict"&&queue.status!=="paused")paintPending(false,Boolean(snapshot.collaboration));
      persist();
    } catch(error) {
      if(disposed)return;
      const isolated=Boolean(snapshot.collaboration&&error instanceof RequestFailure&&error.status===409&&error.conflict==="operation");
      if(isolated&&error instanceof Error){
        queue.quarantine(batch.operationId,deckErrorMessage(error,t),true);showError(deckErrorMessage(error,t));pollNeeded=true;
        if(delayedSnapshot&&!canvas?.isInputBlocked())applySnapshot(delayedSnapshot);
      }else queue.failed(error instanceof RequestFailure&&error.status===409?"conflict":error instanceof RequestFailure&&error.status<500?"fatal":"network");
      connected=isolated;nextAttempt=isolated?0:Date.now()+queue.retryDelay;
      if(queue.status==="conflict"||queue.status==="paused")showError(error instanceof Error?deckErrorMessage(error,t):t("deckEditor.session.savingStopped"));
      persist();
    } finally {networkBusy=false;if(!disposed){render();if(snapshot.collaboration)scheduleSend();}}
  }
  async function receiveChanges(): Promise<void> {
    if(disposed||pageAway||pollBusy||presenting||document.hidden||!navigator.onLine)return;
    if(!snapshot.collaboration&&(queue.dirty||networkBusy))return;
    if(!pollNeeded&&Date.now()-lastPoll<(snapshot.collaboration?5000:1000))return;
    pollBusy=true;pollNeeded=false;lastPoll=Date.now();
    try {
      const requestedVersion=snapshot.versionId;
      const poll=pollSchema.parse(await request("GET",undefined,`?${new URLSearchParams({page:hooks.pageSlug,versionId:requestedVersion,sessionId,protocol:"2",presentation:presenter?"1":"0",delta:forceFullSnapshot?"0":"1"})}`));
      if(disposed)return;
      connected=true;updatePresence(poll.presence);
      if(poll.versionId===snapshot.versionId&&poll.updatedAt)snapshot={...snapshot,updatedAt:poll.updatedAt,updatedBy:poll.updatedBy};
      if(poll.versionNumber>=snapshot.versionNumber){
        let next:Snapshot|null;
        try{next=materializeUpdate(poll,requestedVersion);}catch{forceFullSnapshot=true;pollNeeded=true;return;}
        if(next&&(poll.collaboration?queue.observe(poll.versionId):queue.advance(poll.versionId))){forceFullSnapshot=false;applySnapshot(next);}
      }
      render();
    }catch(error){
      if(disposed||pageAway||error instanceof DOMException&&error.name==="AbortError")return;
      connected=false;
      if(error instanceof RequestFailure&&error.status<500){
        if(error.status===409)reopenRequired=true;
        queue.failed(error.status===409?"conflict":"fatal");
        showError(error.status===409?t("deckEditor.session.sourceUpdated"):error.message);persist();
      }
      render();
    }finally{
      pollBusy=false;
    }
  }
  function tick(): void {
    if(disposed||pageAway)return;
    if(snapshot.collaboration)scheduleSend();else void sendPending();void receiveChanges();void heartbeat();
    timer=setTimeout(tick,snapshot.collaboration?150:1000);
  }
  window.addEventListener("online",()=>{pollNeeded=true;void receiveChanges();},{signal:lifetime.signal});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden){pollNeeded=true;void receiveChanges();}},{signal:lifetime.signal});
  tick();
}
