import { MediaFailure, type MediaFailureCode } from "../../../lib/deck/media/failure";
import { mediaFailureCode, mediaIssue, type MediaIssue, type MediaRecovery } from "./media-feedback";
import { deckIcon } from "../ui";
import { el } from "../../shared/util";
import { t } from "../../shared/i18n";
import { deckErrorMessage } from "../../../lib/deck/edit/message";

export class MediaTargetError extends MediaFailure { constructor(message: string) { super("target", message); } }
export type MediaProgress = (message: string, phase?: "upload" | "save") => void;
type TaskResult = { original?: () => void | Promise<void>; message?: string };
export type MediaTask = {
  id: string; name: string;
  onState?: (state:string,message:string,retry:()=>void,cancel:()=>void,canCancel:boolean)=>void;
  run: (signal: AbortSignal, progress: MediaProgress) => Promise<TaskResult>;
  retarget?: () => void;
  reselect?: (file: File) => void;
};
type State = "queued" | "working" | "failed" | "cancelled" | "saved";
type Item = {
  task: MediaTask; generation:number; canCancel:boolean; state: State; message: string; code: MediaFailureCode;
  controller: AbortController; row: HTMLElement; name: HTMLElement; status: HTMLElement;
  explanation: HTMLElement; actions: HTMLElement; dismiss: HTMLButtonElement; actionError: HTMLElement;
  original?: TaskResult["original"]; busy: boolean;
};
type Input = {
  page: string;
  chooseFile: (receive?: (file: File) => void) => void;
  changed: (busy: number, message: string) => void;
  fail: (message: string) => void;
  recoverSave: () => void;
  open: (open: boolean) => boolean;
};

export function createDeckMediaQueue(input: Input) {
  const root = el("aside", "ds-media-panel"); root.hidden = true;
  root.id = `media-${crypto.randomUUID()}`; root.setAttribute("aria-label", t("deckEditor.mediaQueue.panel"));
  const title = el("h2", undefined, t("deckEditor.mediaQueue.title")); title.tabIndex = -1;
  const header = el("div", "ds-media-header");
  const body = el("div", "ds-media-body"), issueList = el("div"), activeList = el("div"), doneList = el("div");
  const section = (label: string, list: HTMLElement) => { const group = el("section", "ds-media-section"); group.append(el("h3", undefined, label), list); return group; };
  const issues = section(t("deckEditor.mediaQueue.needsAttention"), issueList), activeSection = section(t("deckEditor.mediaQueue.adding"), activeList);
  const completed = el("details", "ds-media-completed"), completedLabel = el("summary"); completed.append(completedLabel, doneList);
  const empty = el("p", "ds-media-empty", t("deckEditor.mediaQueue.empty"));
  const trigger = el("button", "ds-media-trigger"); trigger.type = "button";
  trigger.setAttribute("aria-label", t("deckEditor.mediaQueue.panel")); trigger.setAttribute("aria-controls", root.id); trigger.setAttribute("aria-expanded", "false");
  const dot = el("span", "ds-media-dot"), triggerLabel = el("span", undefined, t("deckEditor.mediaQueue.media")), count = el("span", "ds-media-count"), shortStatus = el("span", "ds-media-short-status");
  dot.setAttribute("aria-hidden", "true"); trigger.append(deckIcon("upload"), dot, triggerLabel, count, shortStatus);
  const announce = el("span", "ds-media-announcement"); announce.setAttribute("role", "status"); announce.setAttribute("aria-live", "polite");
  const items: Item[] = [];
  let active = 0, disposed = false, opened = false, lastAnnouncement = "";
  const button = (label: string, action: () => void, primary = false) => {
    const control = el("button", primary ? "ds-button ds-primary" : "ds-button ds-media-quiet", label);
    control.type = "button"; control.onclick = action; return control;
  };
  const close = button("", () => setOpen(false)); close.append(deckIcon("close")); close.setAttribute("aria-label", t("deckEditor.mediaQueue.closePanel"));
  header.append(title, close); body.append(issues, activeSection, completed, empty); root.append(header, body); trigger.append(announce);
  trigger.onclick = () => setOpen(!opened);
  root.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); } });
  function setOpen(value: boolean, focus=true) {
    if (!input.open(value)) return;
    opened = value; root.hidden = !value; trigger.setAttribute("aria-expanded", String(value));
    if(focus){if (value) title.focus(); else trigger.focus();}
  }
  function changed() {
    const failed = items.filter(item => item.state === "failed").length;
    const running = items.filter(item => ["queued", "working"].includes(item.state)).length;
    const complete = items.filter(item => item.state === "saved" || item.state === "cancelled").length;
    trigger.hidden = false; count.hidden = items.length === 0; shortStatus.hidden = items.length === 0; dot.hidden = failed === 0;
    count.textContent = t("deckEditor.mediaQueue.count",{count:failed || running || complete}); shortStatus.textContent = failed ? t("deckEditor.mediaQueue.shortAttention") : running ? t("deckEditor.mediaQueue.adding") : t("deckEditor.mediaQueue.shortDone");
    trigger.title = failed ? t("deckEditor.mediaQueue.checkFailed",{count:failed}) : running ? t("deckEditor.mediaQueue.addingCount",{count:running}) : t("deckEditor.mediaQueue.allDone");
    issues.hidden = failed === 0; activeSection.hidden = running === 0; completed.hidden = complete === 0;
    completedLabel.textContent = t("deckEditor.mediaQueue.completedCount",{count:complete}); empty.hidden = items.length > 0;
    const announcement = failed ? t("deckEditor.mediaQueue.failedAnnounce",{count:failed}) : running ? t("deckEditor.mediaQueue.addingAnnounce") : items.length ? t("deckEditor.mediaQueue.doneAnnounce") : "";
    if (announcement !== lastAnnouncement) { announce.textContent = announcement; lastAnnouncement = announcement; }
    input.changed(items.filter(item => item.state === "working" || item.state === "queued" || item.busy).length,
      items.some(item => item.busy) ? t("deckEditor.mediaQueue.updating") : items.find(item => item.state === "working")?.message ?? "");
  }
  function remove(item: Item) {
    item.task.onState?.("dismissed","",()=>{},()=>{},false);
    item.generation++;item.controller.abort();
    const at = items.indexOf(item); if (at >= 0) items.splice(at, 1);
    item.row.remove(); changed(); trigger.focus();
  }
  function issueFor(item: Item): MediaIssue {
    return mediaIssue(item.code, item.message);
  }
  function retry(item: Item) {
    item.generation++;item.canCancel=true;item.controller = new AbortController(); item.state = "queued"; item.message = t("deckEditor.mediaQueue.queued"); item.actionError.textContent = "";
    paint(item); pump();
  }
  function recover(item: Item, action: MediaRecovery) {
    if (action === "none") return;
    if (action === "login") { window.open("/signin", "_blank", "noopener"); return; }
    if (action === "save") { input.recoverSave(); return; }
    if (action === "choose") {
      input.chooseFile(file => {
        if (!item.task.reselect) { remove(item); return; }
        item.task.reselect(file); item.task.name = file.name; retry(item);
      }); return;
    }
    if (action === "target") {
      try { item.task.retarget?.(); } catch (error) { item.actionError.textContent = error instanceof Error ? deckErrorMessage(error, t) : t("deckEditor.mediaQueue.chooseTarget"); return; }
      retry(item); return;
    }
    retry(item);
  }
  function paint(item: Item) {
    if (disposed) return;
    notifyTask(item);
    const scope = root.getRootNode(), focused = scope instanceof ShadowRoot ? scope.activeElement : document.activeElement;
    const restoreFocus = focused !== null && item.actions.contains(focused);
    const parent = item.state === "failed" ? issueList : item.state === "saved" || item.state === "cancelled" ? doneList : activeList;
    if (item.row.parentNode !== parent) parent.append(item.row);
    item.row.dataset.state = item.state; item.row.setAttribute("aria-busy", String(item.busy));
    item.name.textContent = item.task.name; item.name.title = item.task.name;
    item.dismiss.hidden = ["queued", "working"].includes(item.state); item.dismiss.disabled = item.busy;
    item.dismiss.setAttribute("aria-label", t("deckEditor.mediaQueue.removeNamed",{name:item.task.name}));
    item.actions.replaceChildren(); item.explanation.hidden = true;
    if (item.state === "failed") {
      const issue = issueFor(item); item.status.textContent = issue.title;
      item.explanation.textContent = issue.detail; item.explanation.hidden = !issue.detail;
      if (issue.action !== "none") item.actions.append(button(issue.label, () => recover(item, issue.action), true));
      if (issue.secondary) { const secondary = issue.secondary; item.actions.append(button(secondary.label, () => recover(item, secondary.action))); }
    } else {
      item.status.textContent = item.message;
      if ((item.state === "queued" || item.state === "working") && item.canCancel) item.actions.append(button(t("deckEditor.mediaQueue.stop"), () => { item.controller.abort(); item.state = "cancelled"; item.message = t("deckEditor.mediaQueue.addStopped"); paint(item); }));
      if (item.state === "cancelled") item.actions.append(button(t("deckEditor.mediaQueue.resume"), () => retry(item)));
      if (item.state === "saved" && item.original) item.actions.append(button(t("deckEditor.mediaQueue.useOriginal"), () => void restoreOriginal(item)));
    }
    for (const control of item.actions.querySelectorAll("button")) control.disabled = item.busy;
    changed(); if (restoreFocus) (item.actions.querySelector("button")??(opened?title:trigger)).focus();
  }
  function notifyTask(item:Item){item.task.onState?.(item.state,item.message,()=>retry(item),()=>{if(item.canCancel)item.controller.abort();if(item.state!=="working")remove(item);},item.canCancel);}
  async function restoreOriginal(item: Item) {
    item.busy = true; paint(item);
    try { await item.original?.(); item.original = undefined; item.message = t("deckEditor.mediaQueue.usingOriginal"); }
    catch { item.actionError.textContent = t("deckEditor.mediaQueue.originalSaveFailed"); }
    finally { item.busy = false; paint(item); }
  }
  function makeItem(task: MediaTask, state: State): Item {
    const row = el("div", "ds-media-item"), itemHeader = el("div", "ds-media-item-header");
    const name = el("strong", "ds-media-name", task.name), status = el("p", "ds-media-item-status"), explanation = el("p", "ds-media-explanation"), actions = el("div", "ds-media-actions"), actionError = el("p", "ds-media-action-error");
    actionError.setAttribute("role", "status"); const dismiss = button("", () => remove(item)); dismiss.append(deckIcon("close")); dismiss.title = t("deckEditor.mediaQueue.remove");
    itemHeader.append(deckIcon("file"), name, dismiss); row.append(itemHeader, status, explanation, actions, actionError);
    const item: Item = { task, generation:0, canCancel:true, state, code: "unknown", message: t("deckEditor.mediaQueue.queued"), controller: new AbortController(), row, name, status, explanation, actions, dismiss, actionError, busy: false };
    items.push(item); return item;
  }
  function pump() {
    if (disposed) return;
    while (active < 2) {
      const item = items.find(candidate => candidate.state === "queued"); if (!item) break;
      const controller=item.controller,generation=++item.generation;
      active++; item.state = "working"; item.message = t("deckEditor.mediaQueue.preparing"); paint(item);
      void Promise.resolve().then(()=>item.task.run(controller.signal, (message,phase) => { if(disposed||item.generation!==generation)return;item.message = message; item.status.textContent = message;if(phase==="save"&&item.canCancel){item.canCancel=false;paint(item);}else {notifyTask(item);changed();} })).then(result => {
        if (disposed || controller.signal.aborted || item.generation!==generation) return;
        item.original = result.original;
        item.state = "saved";
        item.message = result.message ?? t("deckEditor.mediaQueue.added");
      }).catch(error => {
        if (disposed || item.generation!==generation) return;
        item.code = mediaFailureCode(error); item.state = controller.signal.aborted ? "cancelled" : "failed";
        item.message = controller.signal.aborted ? t("deckEditor.mediaQueue.addStopped") : error instanceof Error ? deckErrorMessage(error, t) : t("deckEditor.mediaQueue.addFailed");
      }).finally(() => { active--; if (!disposed) { if(item.generation===generation)paint(item); pump(); } });
    }
  }
  function enqueue(task: MediaTask) {
    if (items.length >= 100) { input.fail(t("deckEditor.mediaQueue.listFull")); return; }
    paint(makeItem(task, "queued")); pump();
  }
  changed();
  return { root, trigger, close:()=>setOpen(false,false), enqueue, empty: () => items.length === 0, cancelAll: () => { for (const item of items) if (["queued", "working"].includes(item.state)) item.controller.abort(); }, dispose: () => { disposed = true; for (const item of items) item.controller.abort(); } };
}
