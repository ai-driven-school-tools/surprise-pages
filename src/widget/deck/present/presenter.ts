import { EASE, MOTION } from "../../../lib/settings/ui-motion";
import type { DeckEditOperation } from "../../../lib/deck/edit/model";
import type {} from "../../../lib/deck/render-contract";
import { upgradeDeckPreview } from "../preview";
import { planDeckPaint } from "../render";
import { readDeckSourceInSlices } from "../../../lib/deck/edit/source";
import { titleOf } from "../../../lib/html/text";
import { presenterAudienceSource, presenterSlideSource, presenterSlides, holdPresenterSlide } from "./source";
import { deckIcon, styleDeckButton } from "../ui";
import { moveToOtherScreen } from "../../reading/screens";
import { intlLocale } from "../../../lib/i18n/locales";
import { el } from "../../shared/util";
import { t, widgetLocale } from "../../shared/i18n";

type Saved = { html: string; versionId: string; versionNumber: number; updatedAt?: string; updatedBy?: string };
type Hooks = {
  host: HTMLElement;
  saved(): Saved;
  /** The saved preview document. Derived on demand, so call it only when the version changes. */
  preview(): string;
  source(): string;
  status(): string;
  commit(operations: DeckEditOperation[]): boolean;
  current(): string | null;
  closed(): void;
  /** 読む画面から開いたとき。ノートは読むだけで、保存の仕組みに触れない。 */
  readOnly?: boolean;
  /** 押した瞬間に開いておいた観客用の窓。開いたまま渡されたら、準備ができしだい発表を始める。 */
  audienceWindow?: Window | null;
  /** 終える・閉じるの札。既定は、読むだけなら「閉じる」、直せるなら「編集へ戻る」。 */
  closeLabel?: string;
};
/** 1 つの面（現在・次・観客用）は枠を何枚か重ねて持つ。表に出すのは 1 枚だけで、ほかは裏。
 * めくるときは裏の枠で描き終えて（画像・ロゴの読み込みまで）から表と入れ替える。
 * 表の枠をその場で描き替えると、ロゴや画像が一瞬遅れて出る途中の姿が観客に見えるため。 */
type Buffer = { frame: HTMLIFrameElement; html: string; generation: number; used: number; task: { html: string; done: Promise<void> } | null };
type Surface = { label: string; buffers: Buffer[]; shown: Buffer; generation: number; audience: boolean };

/* 面の役割は編集画面と同じ。上下の帯は紙（surface）、そのあいだは机（surface-sunken）で、
   スライドは机に置いた紙として読ませる。線は帯の境だけに引き、スライドを枠で囲まない。
   図の枠は 16:9 に合わせて測る（器いっぱいに伸ばすと、スライドの外に机の色の帯が出る）。 */
const STYLES = `
/* デスクトップアプリでは、窓の題名の帯の下から始める（ブラウザでは全面） */
.dp-screen{position:fixed;inset:var(--titlebar-h,0px) 0 0 0;z-index:40;display:grid;grid-template-rows:var(--studio-header) minmax(0,1fr) var(--studio-header);background:var(--surface-sunken);color:var(--text);font-size:var(--font-md)}
.dp-screen *{box-sizing:border-box}
.dp-screen [hidden]{display:none!important}
.dp-screen iframe{display:block;border:0;background:transparent}
.dp-bar{display:flex;align-items:center;gap:var(--space-2);min-width:0;padding:0 var(--studio-inset);background:var(--surface)}
.dp-header{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);border-bottom:var(--rule-thin) solid var(--border)}
.dp-footer{justify-content:space-between;border-top:var(--rule-thin) solid var(--border)}
.dp-group{display:flex;align-items:center;gap:var(--space-2);min-width:0}
.dp-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--font-base);font-weight:var(--weight-bold)}
.dp-header>:last-child{justify-self:end}
.dp-timer{display:flex;align-items:center;gap:var(--space-2);white-space:nowrap}
.dp-duration{display:flex;align-items:center;gap:var(--space-2);font-size:var(--font-sm);color:var(--muted)}
.dp-duration input{width:calc(var(--space-6) * 2);height:var(--size-control);padding:0 var(--space-2);border:var(--rule-thin) solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text);font:inherit;font-size:var(--font-base);font-variant-numeric:tabular-nums;text-align:right}
.dp-clock{display:flex;align-items:center;gap:var(--space-2);font-variant-numeric:tabular-nums}
.dp-clock-label{font-size:var(--font-sm);color:var(--muted)}
.dp-clock-time{min-width:calc(var(--space-7) + var(--space-2));font-size:var(--font-lg);font-weight:var(--weight-bold);text-align:right}
.dp-clock[data-over] .dp-clock-label::before{content:"";display:inline-block;width:var(--size-dot);height:var(--size-dot);margin-right:var(--space-1);border-radius:var(--radius-pill);background:var(--danger);vertical-align:middle}
.dp-clock[data-paused] .dp-clock-time{color:var(--muted)}
/* 配置は 2 通り。発表中にいちばん長く読むのはノートなので、ノートがある資料はノートを主役にする
   （左に現在と次を縦に、右の約 6 割をノートに。左列は枚の幅に合う 5:9）。ノートが無い資料はスライドを主役にする。
   切り替えは根の印（data-layout）と CSS だけで行い、要素は動かさない（読み込み済みの枠を捨てないため）。 */
.dp-body{display:grid;gap:var(--space-5);min-height:0;padding:var(--space-5)}
.dp-screen[data-layout=notes] .dp-body{grid-template-columns:minmax(0,5fr) minmax(0,9fr);grid-template-rows:minmax(0,11fr) minmax(0,9fr);grid-template-areas:"current notes" "upcoming notes"}
.dp-screen[data-layout=slides] .dp-body{grid-template-columns:minmax(0,8fr) minmax(0,5fr);grid-template-rows:minmax(0,1fr);grid-template-areas:"current upcoming"}
.dp-screen[data-layout=slides] .dp-notes{display:none}
.dp-main{grid-area:current}.dp-upcoming{grid-area:upcoming}.dp-notes{grid-area:notes}
.dp-main,.dp-upcoming{display:grid;grid-template-rows:auto minmax(0,1fr);gap:var(--space-3);min-width:0;min-height:0}
.dp-stage{container-type:size;min-width:0;min-height:0;display:grid;justify-items:start;align-items:start}
.dp-stage>*{grid-area:1/1}
.dp-stage>iframe[data-back]{opacity:0;pointer-events:none}
/* スライド主役のときの次の枚は、見当を付けるための大きさ（列の幅）で上に寄せる */
.dp-screen[data-layout=slides] .dp-upcoming{container-type:inline-size;align-self:start}
.dp-screen[data-layout=slides] .dp-upcoming>.dp-stage{height:calc(100cqw * 9 / 16 + var(--dp-reserve,0px))}
/* 実行部は枚の下に段階の操作の場所（--dp-reserve）を空けて縮める。操作はこちらで隠すので、その分だけ枠を足して枚を幅いっぱいに出す */
/* 幅と高さは整数の px に丸める（端数が出ると、枚の縁に紙の色が 1px 覗く） */
.dp-stage>iframe{--dp-w:round(down,min(100cqw,calc((100cqh - var(--dp-reserve,0px)) * 16 / 9)),16px);width:var(--dp-w);height:calc(var(--dp-w) * 9 / 16 + var(--dp-reserve,0px))}
.dp-caption{display:flex;align-items:center;gap:var(--space-3);min-width:0;min-height:var(--size-control)}
.dp-position{flex:none;font-size:var(--font-base);font-weight:var(--weight-bold);font-variant-numeric:tabular-nums}
.dp-slide-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--font-base);color:var(--muted)}
.dp-notice{display:flex;align-items:center;gap:var(--space-2);margin-left:auto;min-width:0;font-size:var(--font-sm)}
.dp-notice:empty{display:none}
.dp-label{display:flex;align-items:center;gap:var(--space-2);min-width:0;min-height:var(--size-control);font-size:var(--font-sm);color:var(--muted)}
.dp-label>strong{flex:none;font-weight:var(--weight-bold);color:var(--text)}
.dp-label>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dp-end{display:grid;place-items:center;width:min(100cqw,calc(100cqh * 16 / 9));aspect-ratio:16/9;background:var(--surface);font-size:var(--font-sm);color:var(--muted)}
.dp-notes{display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:var(--space-2);min-width:0;min-height:0}
.dp-note-tools{display:flex;align-items:center;gap:var(--space-1);margin-left:auto}
/* 読む表示と書く表示は同じ箱・同じ字の段にして、行き来しても字の位置が動かないようにする。
   1 行は 32 字前後まで（長い行は一瞥で行頭へ戻れない） */
.dp-note-read,.dp-notes textarea{width:100%;height:100%;min-height:0;overflow:auto;padding:var(--space-4) var(--space-5);border:0;border-radius:var(--radius-md);background:var(--surface);color:var(--text);font:inherit;font-size:var(--dp-note-size,var(--font-notes-2));line-height:var(--leading-normal)}
.dp-notes textarea{resize:none}
.dp-note-read{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;cursor:text}
.dp-note-read>span{display:block;max-width:32em}
.dp-note-read[data-empty]{font-size:var(--font-md);color:var(--muted)}
.dp-notes textarea::placeholder{color:var(--muted)}
.dp-notes textarea:read-only{color:var(--muted)}
.dp-note-footer{display:flex;align-items:center;gap:var(--space-2);min-width:0;min-height:var(--size-control);font-size:var(--font-sm);color:var(--muted)}
.dp-note-footer>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dp-note-footer>button{margin-left:auto}
.dp-saved:not(:empty)::before{content:"·";margin-right:var(--space-2)}
.dp-connection{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--font-sm);color:var(--muted)}
.dp-nav{display:flex;align-items:center;gap:var(--space-1)}
/* 背の低い画面（ノート PC の 600px 前後）では、余白を 1 段詰めてノートの行数を守る */
@media (max-height:640px){.dp-body{gap:var(--space-4);padding:var(--space-4)}.dp-main,.dp-upcoming,.dp-notes{gap:var(--space-2)}}
.dp-conflict{width:min(100%,720px)}
.dp-conflict>p{margin:0 0 var(--space-4);font-size:var(--font-base);color:var(--muted);line-height:var(--leading-normal)}
.dp-compare{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-4)}
.dp-compare h3{margin:0 0 var(--space-2);font-size:var(--font-sm);font-weight:var(--weight-bold);color:var(--muted)}
.dp-compare pre{margin:0;max-height:calc(var(--size-scroll-max) + var(--space-7));overflow:auto;padding:var(--space-3);border-radius:var(--radius-sm);background:var(--surface-sunken);white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:var(--font-base);line-height:var(--leading-normal)}
`;

/* 観客用の窓は投影される面。黒地に字だけを置き、操作の札は手を動かしたときにしか出さない。
   別の文書なので影の中の名前（--space-* など）は届かず、ここだけ値を直に持つ。 */
const AUDIENCE_STYLES = `
html,body{height:100%;margin:0;background:#000}
body{overflow:hidden}
button[data-fullscreen]{position:fixed;top:16px;right:16px;z-index:1;height:32px;padding:0 12px;border:0;border-radius:6px;background:rgba(255,255,255,.14);color:#fff;font:500 13px/32px system-ui,sans-serif;cursor:pointer;opacity:0;pointer-events:none;transition:opacity ${MOTION.base}ms ${EASE}}
button[data-fullscreen]:hover,button[data-fullscreen]:focus-visible{background:rgba(255,255,255,.24)}
button[data-fullscreen]:focus-visible{outline:2px solid #fff;outline-offset:2px}
body[data-active] button[data-fullscreen]{opacity:1;pointer-events:auto}
:fullscreen button[data-fullscreen]{display:none}
iframe{position:fixed;top:0;left:0;display:block;width:100%;height:calc(100% + var(--dp-trim,0px));border:0}
iframe[data-back]{opacity:0;pointer-events:none}
`;
const message = (title: string, text: string) =>
  `<!doctype html><html lang="${widgetLocale()}"><title>${title}</title><style>html,body{height:100%;margin:0}body{display:grid;place-items:center;background:#000;color:rgba(255,255,255,.64);font:500 16px/1.6 system-ui,sans-serif}</style><p>${text}</p></html>`;
// 観客用の窓に出す待ちの画面。言語は描く前に決まるので、使うときに組み立てる
const WAITING = () => message(t("decks.presenter.waitingTitle"), t("decks.presenter.waiting"));
const STOPPED = () => message(t("decks.presenter.stopped"), t("decks.presenter.stopped"));
const ENDED = () => message(t("decks.presenter.endedTitle"), t("decks.presenter.ended"));

/** 端末に覚えるのはノートの字の段（0〜3）だけ。本文は持たない。使えない環境では既定の段で動く。 */
const NOTE_SIZE_KEY = "surprise:presenter-note-size", NOTE_SIZES = ["--font-notes-1", "--font-notes-2", "--font-notes-3", "--font-notes-4"], NOTE_SIZE_DEFAULT = 1;
function readNoteSize() {
  try { const value = Number(localStorage.getItem(NOTE_SIZE_KEY)); return Number.isInteger(value) && value >= 0 && value < NOTE_SIZES.length && localStorage.getItem(NOTE_SIZE_KEY) !== null ? value : NOTE_SIZE_DEFAULT; }
  catch { return NOTE_SIZE_DEFAULT; }
}
function writeNoteSize(value: number) {
  try { localStorage.setItem(NOTE_SIZE_KEY, String(value)); } catch { /* 覚えられなくても、この発表の間は効く */ }
}

function clockText(seconds: number) {
  const absolute = Math.abs(seconds), hours = Math.floor(absolute / 3600), minutes = Math.floor(absolute / 60) % 60, rest = String(absolute % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}
const yieldTask = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function savedAt(iso: string) {
  const at = new Date(iso), today = new Date().toDateString() === at.toDateString();
  return at.toLocaleString(intlLocale(widgetLocale()), today ? { hour: "2-digit", minute: "2-digit" } : { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Uses the stock renderer and editor transport. Owns no saved document model. */
export function openDeckPresenter(hooks: Hooks) {
  const root = el("div", "dp-screen");
  const underlying = [...hooks.host.children].filter((node): node is HTMLElement => node instanceof HTMLElement).map(node => ({ node, inert: node.inert }));
  underlying.forEach(({ node }) => { node.inert = true; });
  root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", t("decks.presenter.title"));
  const style = el("style"); style.textContent = STYLES;
  const button = (label: string, fn: () => void) => { const b = el("button", "edit-button"); b.type = "button"; b.textContent = label; b.onclick = fn; return b; };

  // 上の帯: 資料の名前 / 時間 / 終える
  const header = el("div", "dp-bar dp-header"), deckTitle = el("div", "dp-title", t("decks.presenter.title")), timer = el("div", "dp-timer");
  const duration = el("input"); duration.type = "number"; duration.inputMode = "numeric"; duration.min = "1"; duration.max = "1440"; duration.placeholder = t("decks.presenter.durationNone"); duration.setAttribute("aria-label", t("decks.presenter.durationLabel"));
  const durationLabel = el("label", "dp-duration"); durationLabel.append(el("span", undefined, t("decks.presenter.duration")), duration, el("span", undefined, t("decks.presenter.minutes")));
  const clock = el("div", "dp-clock"), clockLabel = el("span", "dp-clock-label"), clockTime = el("span", "dp-clock-time");
  clock.setAttribute("role", "timer"); clock.append(clockLabel, clockTime); clock.hidden = true;

  // 中: 現在のスライド（主役）と、次のスライド・ノート
  const body = el("div", "dp-body"), main = el("div", "dp-main"), stage = el("div", "dp-stage"), caption = el("div", "dp-caption");
  const position = el("span", "dp-position"), slideTitle = el("span", "dp-slide-title"), notice = el("div", "dp-notice");
  notice.setAttribute("role", "status");
  const upcomingPanel = el("div", "dp-upcoming"), nextLabel = el("div", "dp-label"), nextBox = el("div", "dp-stage"), end = el("div", "dp-end", t("decks.presenter.lastSlide"));
  const notePanel = el("div", "dp-notes"), noteHead = el("div", "dp-label"), noteTools = el("div", "dp-note-tools"), notes = el("textarea"), noteFooter = el("div", "dp-note-footer");
  const noteRead = el("div", "dp-note-read"), noteStatus = el("span"), savedMeta = el("span", "dp-saved");
  notes.setAttribute("aria-label", t("decks.presenter.notesLabel")); notes.placeholder = t("decks.presenter.notesPlaceholder"); notes.maxLength = 100_000;
  noteRead.setAttribute("role", "document"); noteRead.setAttribute("aria-label", t("decks.presenter.notesReadLabel")); noteRead.tabIndex = 0; noteRead.hidden = true;
  noteHead.append(el("strong", undefined, t("decks.presenter.notes")), el("span", undefined, t("decks.presenter.notesHidden")), noteTools);

  // 下の帯: 観客用の窓 / 移動と開始
  const footer = el("div", "dp-bar dp-footer"), connection = el("span", "dp-connection", t("decks.presenter.audienceNotOpen"));
  connection.setAttribute("role", "status");

  let bufferUse = 0;
  const makeSurface = (label: string, count: number, audienceSide = false): Surface => {
    const buffers: Buffer[] = Array.from({ length: count }, (_, index) => {
      const frame = el("iframe"); frame.title = index > 0 ? t("decks.presenter.preparingFrame", { label }) : label; frame.setAttribute("allow", "fullscreen");
      if (index > 0) { frame.setAttribute("data-back", ""); frame.setAttribute("aria-hidden", "true"); frame.tabIndex = -1; }
      return { frame, html: "", generation: 0, used: 0, task: null };
    });
    return { label, buffers, shown: buffers[0], generation: 0, audience: audienceSide };
  };
  const frames = (surface: Surface) => surface.buffers.map(buffer => buffer.frame);
  // 現在と観客用は、表・次の枚・前の枚の 3 枚。次の枚の見本は先読みしないので 2 枚。
  const current = makeSurface(t("decks.presenter.currentSlide"), 3), next = makeSurface(t("decks.presenter.nextSlide"), 2);
  let audience: Surface | null = null, popup: Window | null = null, idle: ReturnType<typeof setTimeout> | undefined;
  let disposed = false, blocked = false, version = "", targetHtml = "", appliedHtml = "";
  let pending = false, started = false, paused = false, elapsed = 0, lastTick = performance.now();
  let selected = hooks.current(), step = 0, noteId: string | null = null, noteBase = "", dirty = false, composing = false;
  let noteTimer: ReturnType<typeof setTimeout> | undefined;
  let running = false, desired = false, wantedForce = false;
  const queuedMoves: (-1 | 1)[] = [];
  let lastSource = "", entries: ReturnType<typeof presenterSlides> = [];
  let editing = true, layoutChosen = false, noteSize = readNoteSize();
  const readOnly = hooks.readOnly === true, closeLabel = hooks.closeLabel ?? (readOnly ? t("decks.presenter.close") : t("decks.presenter.backToEdit"));
  let autoStart = !!hooks.audienceWindow && !hooks.audienceWindow.closed;
  const lifetime = new AbortController();

  const syncNotes = () => {
    const source = hooks.source();
    if (source !== lastSource) { lastSource = source; entries = presenterSlides(source); deckTitle.textContent = titleOf(source) ?? t("decks.presenter.title"); }
    const entry = entries.find(item => item.id === selected);
    if (!entry) return;
    if (noteId !== entry.id || !dirty) {
      noteId = entry.id; noteBase = entry.notes;
      if (notes.value !== entry.notes) {
        const start = notes.selectionStart, finish = notes.selectionEnd, scroll = notes.scrollTop;
        notes.value = entry.notes; notes.setSelectionRange(start, finish); notes.scrollTop = scroll;
      }
    }
    const shown = notes.value.trim() ? notes.value : "";
    if (noteRead.dataset.text !== shown || !noteRead.firstChild) {
      noteRead.dataset.text = shown; noteRead.toggleAttribute("data-empty", !shown);
      noteRead.replaceChildren(el("span", undefined, shown || t("decks.presenter.noNotes")));
    }
    if (!layoutChosen && entries.length) { layoutChosen = true; setLayout(entries.some(item => item.notes.trim()) ? "notes" : "slides"); }
    const index = entries.indexOf(entry), upcoming = entries[index + 1];
    position.textContent = `${index + 1} / ${entries.length}`;
    slideTitle.textContent = entry.title;
    nextLabel.replaceChildren(el("strong", undefined, t("decks.presenter.next")), el("span", undefined, upcoming ? (upcoming.title ? t("decks.presenter.nextPositionTitled", { number: index + 2, total: entries.length, title: upcoming.title }) : t("decks.presenter.nextPosition", { number: index + 2, total: entries.length })) : t("decks.presenter.none")));
  };
  const flush = () => {
    if (noteTimer) clearTimeout(noteTimer);
    if (composing) return false;
    if (!dirty || !noteId) return true;
    if (blocked) return false;
    if (!hooks.commit([{ kind: "notes", target: noteId, before: noteBase, after: notes.value }])) { noteStatus.textContent = t("decks.presenter.noteConflict"); conflictButton.hidden = false; savedMeta.hidden = true; return false; }
    conflictButton.hidden = true; savedMeta.hidden = false;
    noteBase = notes.value; dirty = false; return true;
  };
  notes.addEventListener("compositionstart", () => { composing = true; });
  notes.addEventListener("compositionend", () => { composing = false; flush(); });
  notes.addEventListener("input", () => { dirty = true; noteStatus.textContent = t("decks.presenter.noteWaiting"); if (noteTimer) clearTimeout(noteTimer); noteTimer = setTimeout(flush, 400); });
  notes.addEventListener("blur", () => { if (flush()) { noteId = null; syncNotes(); if (started) setEditing(false); } });
  // 発表中の書く表示は Escape で読む表示へ戻す（発表そのものは終わらせない）。変換の確定に使う Escape は除く。
  notes.addEventListener("keydown", event => { if (event.key === "Escape" && started && !event.isComposing && !composing) { event.preventDefault(); notes.blur(); if (!editing) editButton.focus(); } });
  noteRead.addEventListener("click", () => { if (!blocked && !readOnly) { setEditing(true); } });

  /** 枠に 1 枚ぶんの写しを読み込み、実行部の準備ができるまで待つ。同じ枠への新しい依頼が来たら手を引く。 */
  async function load(surface: Surface, buffer: Buffer, html: string, outer: () => boolean) {
    const token = ++buffer.generation;
    const stale = () => outer() || token !== buffer.generation;
    let doc = buffer.frame.contentDocument;
    if (buffer.html !== html) {
      const before = buffer.html;
      if (doc && before) {
        // 描き替えの比較が読む 2 つの写しを、先に小分けで読んでおく（比較の中で一度に読むと長く止まる）。
        await readDeckSourceInSlices(before, yieldTask);
        await readDeckSourceInSlices(html, yieldTask);
        if (stale()) return false;
        doc = buffer.frame.contentDocument;
      }
      const plan = doc && before ? planDeckPaint(doc, before, html) : null;
      buffer.html = "";
      if (plan) { await plan.prepare(); if (stale()) return false; await plan.apply(); }
      else {
        const ready = new Promise<void>((resolve, reject) => {
          const loaded = () => { clearTimeout(timer); clearInterval(cancelled); buffer.frame.removeEventListener("load", loaded); resolve(); };
          const timer = setTimeout(() => { clearInterval(cancelled); buffer.frame.removeEventListener("load", loaded); reject(new Error(t("decks.presenter.slideLoadFailed"))); }, 15000);
          const cancelled = setInterval(() => { if (stale() || !buffer.frame.isConnected) loaded(); }, 50);
          buffer.frame.addEventListener("load", loaded, { once: true });
        });
        buffer.frame.srcdoc = html; await ready;
      }
      if (stale()) return false;
    }
    doc = buffer.frame.contentDocument;
    // 読む画面の操作列・ノートは、準備を待つ前に隠す。待ちが時間切れになっても、
    // 縮小した枠に「プレゼンを始める」や縦並びの紙が出たままにしない。
    if (doc?.head && !doc.head.querySelector("[data-presenter-chrome]")) {
      const css = doc.createElement("style"); css.setAttribute("data-presenter-chrome", "");
      // 枚の外の机の色は外側（発表者画面の机・観客用の黒地）に任せる。
      css.textContent = "[data-deck-toolbar],[data-deck-exit],aside[data-deck-notes]{display:none!important}html,body,html[data-deck-mode=present] [data-deck-frame][data-deck-current]{background:transparent!important}html:not([data-deck-mode=present]) body{visibility:hidden}"; doc.head.append(css);
      const owner = doc, fromAudience = surface.audience;
      doc.addEventListener("keydown", event => controlKey(event, owner, fromAudience), { capture: true, signal: lifetime.signal });
      if (fromAudience) doc.addEventListener("pointermove", wake, { signal: lifetime.signal });
    }
    const deadline = Date.now() + 10000;
    while (doc && (!doc.deckPresentation || doc.querySelector("script[data-deck-design-runtime]") !== null && !doc.body.hasAttribute("data-deck-design-ready"))) {
      if (stale()) return false;
      if (Date.now() > deadline) throw new Error(doc.deckPresentation ? t("decks.presenter.notReady") : t("decks.presenter.unsupported"));
      await new Promise(resolve => setTimeout(resolve, 50));
      doc = buffer.frame.contentDocument;
    }
    if (stale()) return false;
    buffer.html = html;
    return true;
  }
  /** 選んだ枚が描き終わり、画像（ロゴを含む）が絵にできるまで待つ。待ちすぎないよう、どれも上限で切り上げる。 */
  async function settle(buffer: Buffer, id: string) {
    const doc = buffer.frame.contentDocument, view = buffer.frame.contentWindow;
    if (!doc || !view) return;
    const within = (work: Promise<unknown>, ms: number) => Promise.race([work.then(() => undefined, () => undefined), new Promise<void>(resolve => setTimeout(resolve, ms))]);
    const slide = [...doc.querySelectorAll("section[data-deck-slide]")].find(item => item.getAttribute("data-deck-node") === id);
    if (!slide) return;
    const drawn = doc.deckRenderer?.whenDrawn?.(slide);
    if (drawn) await within(drawn, 3000);
    await within(doc.fonts.ready, 1500);
    const paper = slide.closest("[data-deck-frame]") ?? slide;
    await within(Promise.all([...paper.querySelectorAll("img")].map(image => image.decode())), 1500);
    // 絵ができた次の描画の区切りで入れ替える（入れ替えた瞬間に白い枠が挟まらないように）。
    // 窓が隠れていると描画の区切りが来ないので、短い上限を付ける。
    await within(new Promise<void>(resolve => view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve()))), 120);
  }
  function reveal(surface: Surface, buffer: Buffer) {
    if (surface.shown === buffer) return;
    const hidden = surface.shown;
    buffer.frame.removeAttribute("data-back"); buffer.frame.removeAttribute("aria-hidden"); buffer.frame.removeAttribute("tabindex"); buffer.frame.title = surface.label;
    hidden.frame.setAttribute("data-back", ""); hidden.frame.setAttribute("aria-hidden", "true"); hidden.frame.tabIndex = -1; hidden.frame.title = t("decks.presenter.preparingFrame", { label: surface.label });
    surface.shown = buffer; buffer.used = ++bufferUse;
  }
  /** 裏の枠を 1 枚選ぶ。残しておきたい写し（keep）を持つ枠と、それを準備中の枠は避け、いちばん古く使った枠を選ぶ。 */
  function backBuffer(surface: Surface, keep: readonly string[]) {
    const candidates = surface.buffers.filter(buffer => buffer !== surface.shown);
    const free = candidates.filter(buffer => !keep.includes(buffer.html) && !(buffer.task && keep.includes(buffer.task.html)));
    return (free.length ? free : candidates).reduce((oldest, buffer) => buffer.used < oldest.used ? buffer : oldest);
  }
  /** 裏の枠で 1 枚を準備する。同じ写しの準備が進んでいれば、それを待つ（やり直さない）。 */
  function prepare(surface: Surface, buffer: Buffer, html: string, id: string, at: number, outer: () => boolean) {
    if (buffer.task?.html === html) return buffer.task.done;
    const done = (async () => {
      if (!await load(surface, buffer, html, outer)) return;
      if (!buffer.frame.contentDocument?.deckPresentation?.select(id, at)) throw new Error(t("decks.presenter.slideMissing"));
      await settle(buffer, id);
    })();
    const task = { html, done };
    buffer.task = task;
    void done.then(() => { if (buffer.task === task) buffer.task = null; }, () => { if (buffer.task === task) buffer.task = null; });
    return done;
  }
  async function paint(surface: Surface, html: string, id: string, at: number) {
    if (disposed || blocked) return;
    const generation = ++surface.generation;
    const stale = () => disposed || blocked || generation !== surface.generation;
    // 面ごとに処理の区切りを作る。大きな資料では 1 枚ぶんの写しでも実行部を抱えて重く、
    // 現在・次・観客用を 1 続きで描くと、そのあいだ入力が止まる。
    await yieldTask();
    if (stale()) return;
    html = presenterSlideSource(html, id);
    const shown = surface.shown;
    // 同じ枚の中の段階の移動は、表の枠のまま進める（段階の見せ方そのものが演出なので）。
    if (shown.html === html && !shown.task) {
      if (!shown.frame.contentDocument?.deckPresentation?.select(id, at)) throw new Error(t("decks.presenter.slideMissing"));
      fitReserve(surface); return;
    }
    const ready = surface.buffers.find(buffer => buffer !== shown && (buffer.html === html && !buffer.task || buffer.task?.html === html));
    const buffer = ready ?? backBuffer(surface, []);
    await prepare(surface, buffer, html, id, at, stale);
    if (stale() || buffer.html !== html) return;
    // 先読みした枠は別の段階で止まっていることがあるので、表に出す前に合わせる。
    if (!buffer.frame.contentDocument?.deckPresentation?.select(id, at)) throw new Error(t("decks.presenter.slideMissing"));
    reveal(surface, buffer);
    fitReserve(surface);
  }
  /** 前後の枚を裏の枠で描いておく。めくった直後の入力を邪魔しないよう、手が止まってから始める。 */
  let warmTimer: ReturnType<typeof setTimeout> | undefined;
  function warmSoon() {
    if (warmTimer) clearTimeout(warmTimer);
    warmTimer = setTimeout(() => { void warmNeighbors(); }, 300);
  }
  async function warmNeighbors() {
    if (disposed || blocked || running || !targetHtml) return;
    const list = presenterSlides(hooks.saved().html), index = list.findIndex(item => item.id === selected);
    if (index < 0) return;
    const neighbors = [{ slide: list[index + 1], at: 0 }, { slide: list[index - 1], at: Number.MAX_SAFE_INTEGER }].filter(item => item.slide);
    const surfaces = [audience && popup && !popup.closed && started ? audience : null, current].filter((surface): surface is Surface => surface !== null);
    const outer = () => disposed || blocked;
    for (const surface of surfaces) {
      const copies = neighbors.map(item => presenterSlideSource(targetHtml, item.slide.id));
      for (const [position, item] of neighbors.entries()) {
        if (disposed || blocked || running) return;
        const html = copies[position];
        if (surface.buffers.some(buffer => buffer.html === html || buffer.task?.html === html)) continue;
        const buffer = backBuffer(surface, [surface.shown.html, ...copies]);
        try { await prepare(surface, buffer, html, item.slide.id, item.at, outer); } catch { /* 先読みの失敗は、めくったときに改めて描いて知らせる */ }
      }
    }
  }
  function fitReserve(surface: Surface) {
    const style = surface.shown.frame.contentDocument?.body?.style, reserve = style?.getPropertyValue("--deck-controls-reserve") ?? "";
    // 枠の入れ物（stage）に置く。スライド主役の次の枚は、入れ物の高さもこの余白から決める。
    const box = surface.shown.frame.parentElement;
    if (!surface.audience) { if (box && box.style.getPropertyValue("--dp-reserve") !== reserve) box.style.setProperty("--dp-reserve", reserve); return; }
    // 観客用の窓は大きさを選べないので、枠を下へ伸ばして空きを窓の外へ押し出す。
    // 読み手向けの補足がある資料では空きに補足が載るので、押し出さない（24 は実行部が操作の上に空ける間）。
    const controls = parseFloat(style?.getPropertyValue("--deck-controls-height") ?? "") || 0, value = parseFloat(reserve) || 0;
    const trim = value > 0 && value <= controls + 24 ? `${value}px` : "0px";
    // 裏の枠にも同じ高さを与える（入れ替えた瞬間に大きさが変わって縮み直すのを見せない）。
    for (const frame of frames(surface)) if (frame.style.getPropertyValue("--dp-trim") !== trim) frame.style.setProperty("--dp-trim", trim);
  }

  function showSaved() {
    const saved = hooks.saved();
    savedMeta.dataset.version = String(saved.versionNumber);
    savedMeta.title = t("decks.presenter.version", { number: saved.versionNumber });
    savedMeta.textContent = saved.updatedAt ? t("decks.presenter.updatedBy", { time: savedAt(saved.updatedAt), name: saved.updatedBy ?? t("decks.presenter.coEditor") }) : "";
  }
  function showNotice(text: string, action?: HTMLButtonElement) {
    notice.replaceChildren(...(text ? [el("span", undefined, text)] : []), ...(action ? [action] : []));
  }
  async function update(force = false) {
    desired = true; wantedForce ||= force;
    if (running || disposed || blocked) return;
    running = true;
    root.setAttribute("data-ready", "false");
    try {
      while (desired && !disposed && !blocked) {
        desired = false; const adopt = wantedForce; wantedForce = false;
        const saved = hooks.saved();
        const list = presenterSlides(saved.html);
        if (!list.length) throw new Error(t("decks.presenter.noSlides"));
        if (!selected || !started && !list.some(item => item.id === selected)) selected = list[0].id;
        if (!list.some(item => item.id === selected)) { stopAudience(t("decks.presenter.slideRemoved")); return; }
        if (version !== saved.versionId) {
          // 版が変わったときだけ全体を読み直す。一覧の読み取りと同じ処理単位に重ねない。
          await yieldTask();
          if (disposed || blocked) return;
          // 部品の照合は、ノートを外す組み立て直しより先に行う。組み立て直すと
          // `data-deck-diagonal` が `data-deck-diagonal=""` になり、既知の部品と 1 字違いになって照合が必ず外れる。
          targetHtml = presenterAudienceSource(await upgradeDeckPreview(hooks.preview(), true)); version = saved.versionId;
        }
        const held = started && !adopt && appliedHtml ? holdPresenterSlide(appliedHtml, targetHtml, selected) : { html: targetHtml, pending: false, removed: false };
        if (held.removed) { stopAudience(t("decks.presenter.slideRemoved")); return; }
        pending = held.pending;
        if (pending) showNotice(t("decks.presenter.slideUpdated"), adoptButton); else showNotice("");
        const index = list.findIndex(item => item.id === selected), upcoming = list[index + 1];
        await paint(current, held.html, selected, step);
        if (upcoming) { for (const frame of frames(next)) frame.hidden = false; end.hidden = true; await paint(next, targetHtml, upcoming.id, 0); }
        else { for (const frame of frames(next)) frame.hidden = true; end.hidden = false; }
        if (audience && popup && !popup.closed && started) { await paint(audience, held.html, selected, step); showConnection(); }
        appliedHtml = held.html;
        root.setAttribute("data-ready", "true");
        syncNotes();
      }
    } catch (error) { showNotice(error instanceof Error ? error.message : t("decks.presenter.showFailed"), retryButton); connection.textContent = t("decks.presenter.audienceUnchanged"); }
    finally {
      running = false; startButton.disabled = blocked || !appliedHtml;
      // 押した瞬間に観客用の窓まで開いてきた場合は、準備ができたらそのまま始める（押し直させない）。
      if (autoStart && appliedHtml && !blocked && !disposed) { autoStart = false; begin(); }
      const queued = queuedMoves.shift();
      if (queued && !disposed && !blocked) move(queued);
      if (desired && !running && !disposed && !blocked) void update();
      else if (!running && appliedHtml) warmSoon();
    }
  }
  function showConnection() {
    if (!popup || popup.closed || !audience) { connection.textContent = popup?.closed ? t("decks.presenter.audienceClosed") : t("decks.presenter.audienceNotOpen"); return; }
    connection.textContent = started ? t("decks.presenter.audienceShowing") : t("decks.presenter.audienceWaiting");
  }
  function move(direction: -1 | 1) {
    if (blocked || !flush()) return;
    // 描いている途中に押された移動は捨てずに順番に回す（描画は処理を区切って進むので、その間にも押される）。
    if (running) { queuedMoves.push(direction); return; }
    const api = current.shown.frame.contentDocument?.deckPresentation;
    const before = api?.state();
    api?.move(direction); const state = api?.state();
    if (!state?.id) return;
    const list = presenterSlides(hooks.saved().html);
    const nextSlide = list[list.findIndex(item => item.id === selected) + direction];
    const boundary = before?.id === state.id && before?.step === state.step;
    const moved = boundary && !!nextSlide;
    selected = moved ? nextSlide.id : state.id; step = moved ? (direction < 0 ? Number.MAX_SAFE_INTEGER : 0) : state.step;
    syncNotes(); void update(moved);
  }
  function controlKey(event: KeyboardEvent, owner: Document, fromAudience = false) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const ElementType = owner.defaultView?.Element, target = event.target;
    if (ElementType && target instanceof ElementType) {
      if (target.closest("input,textarea,select,[contenteditable],video,audio")) { event.stopPropagation(); return; }
      if (["Enter", " "].includes(event.key) && target.closest("button,a[href]")) { event.stopPropagation(); return; }
    }
    if (!["ArrowRight", "ArrowDown", "PageDown", "Enter", " ", "ArrowLeft", "ArrowUp", "PageUp", "Backspace", "Home", "End", "Escape"].includes(event.key)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    // Escape はブラウザの全画面を抜けるのにも押される。発表中と観客用の窓では、発表そのものを終わらせない。
    if (event.key === "Escape") { if (!started && !fromAudience) close(); return; }
    if (event.key === "Home" || event.key === "End") {
      if (blocked || running || !flush()) return;
      const list = presenterSlides(hooks.saved().html), chosen = event.key === "Home" ? list[0] : list[list.length - 1];
      if (chosen) { selected = chosen.id; step = 0; syncNotes(); void update(true); }
      return;
    }
    move(["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(event.key) ? -1 : 1);
  }
  function stopAudience(text: string) {
    blocked = true; started = false; showNotice(text);
    notes.readOnly = true; editButton.hidden = true; startButton.hidden = true; nav.hidden = true; pause.hidden = true; audienceButton.hidden = true;
    for (const surface of [current, next, audience]) if (surface) { surface.generation++; for (const buffer of surface.buffers) { buffer.generation++; buffer.html = ""; buffer.frame.srcdoc = STOPPED(); } }
    connection.textContent = t("decks.presenter.stopped");
    endButton.textContent = closeLabel;
  }
  function wake() {
    const doc = popup && !popup.closed ? popup.document : null;
    if (!doc?.body) return;
    doc.body.setAttribute("data-active", "");
    if (idle) clearTimeout(idle);
    idle = setTimeout(() => { if (popup && !popup.closed) popup.document.body?.removeAttribute("data-active"); }, 2500);
  }
  function openAudience() {
    if (blocked) return false;
    if (popup && !popup.closed) { popup.focus(); return true; }
    popup = window.open("about:blank", "", "popup,width=1280,height=720");
    if (!popup) { connection.textContent = t("decks.presenter.audienceBlocked"); return false; }
    void moveToOtherScreen(popup);
    mountAudience(); return true;
  }
  function mountAudience() {
    if (!popup || popup.closed || blocked || disposed) return;
    if (audience) audience.generation++;
    const doc = popup.document; doc.title = t("decks.presenter.audienceTitle"); doc.documentElement.lang = widgetLocale();
    doc.head.replaceChildren(); doc.body.replaceChildren();
    const css = doc.createElement("style"); css.textContent = AUDIENCE_STYLES; doc.head.append(css);
    const full = doc.createElement("button"); full.type = "button"; full.textContent = t("decks.presenter.fullscreen"); full.setAttribute("data-fullscreen", "");
    full.onclick = () => { void doc.documentElement.requestFullscreen().catch(() => { full.textContent = t("decks.presenter.fullscreenFallback"); }); };
    if (audience) for (const buffer of audience.buffers) buffer.generation++;
    audience = makeSurface(t("decks.presenter.audienceSurface"), 3, true);
    doc.body.append(full, ...frames(audience)); audience.shown.frame.srcdoc = WAITING();
    doc.addEventListener("pointermove", wake, { signal: lifetime.signal });
    doc.addEventListener("keydown", event => controlKey(event, doc, true), { signal: lifetime.signal });
    wake(); showConnection(); void update();
  }
  function close() {
    if (disposed || !flush()) return;
    disposed = true; clearInterval(tick); if (noteTimer) clearTimeout(noteTimer); if (idle) clearTimeout(idle); lifetime.abort();
    if (warmTimer) clearTimeout(warmTimer);
    if (audience && popup && !popup.closed) { for (const buffer of audience.buffers) buffer.generation++; reveal(audience, audience.shown); audience.shown.frame.srcdoc = ENDED(); }
    root.remove(); underlying.forEach(({ node, inert }) => { node.inert = inert; }); hooks.closed();
  }
  function begin() {
    if (blocked || running || started || !flush()) return;
    if (!duration.checkValidity()) { duration.reportValidity(); return; }
    // 開始の 1 押しで観客用の窓も開く（押した瞬間だけ、ブラウザが窓を開くのを許す）。
    // 開けなくても手元の発表は始める。
    const opened = popup && !popup.closed ? true : openAudience();
    started = true; paused = false; lastTick = performance.now(); renderClock();
    startButton.hidden = true; durationLabel.hidden = true; clock.hidden = false; pause.hidden = false;
    setEditing(false);
    endButton.textContent = t("decks.presenter.end");
    if (opened) showConnection();
    void update(true);
  }
  /** 時計は実際の経過から数える（間隔ごとに 1 秒足す形だと、裏のタブで遅れる）。 */
  function renderClock() {
    const at = performance.now(); if (started && !paused) elapsed += at - lastTick; lastTick = at;
    const spent = Math.floor(elapsed / 1000), budget = Number(duration.value) * 60;
    const seconds = budget > 0 ? budget - spent : spent, over = budget > 0 && seconds < 0;
    const clockState = budget > 0 ? (over ? t("decks.presenter.clockOver") : t("decks.presenter.clockLeft")) : t("decks.presenter.clockElapsed");
    clockLabel.textContent = paused ? t("decks.presenter.clockPaused", { state: clockState }) : clockState;
    clockTime.textContent = clockText(seconds);
    clock.toggleAttribute("data-over", over); clock.toggleAttribute("data-paused", paused);
  }
  function togglePause() {
    renderClock(); paused = !paused; renderClock();
    styleDeckButton(pause, paused ? "play" : "pause", true, paused ? t("decks.presenter.resumeTimer") : t("decks.presenter.pauseTimer"));
    pause.setAttribute("aria-label", paused ? t("decks.presenter.resumeTimer") : t("decks.presenter.pauseTimer"));
  }
  /** 開始前は常に書ける。発表中は読む表示が既定で、押したときだけ書ける。書きかけ（衝突・変換中）は閉じない。 */
  function setEditing(value: boolean) {
    if (!value && (dirty || composing)) return;
    editing = !readOnly && (value || !started);
    notes.hidden = !editing; noteRead.hidden = editing;
    editButton.hidden = readOnly || !started || blocked;
    editButton.textContent = editing ? t("decks.presenter.finishEditing") : t("decks.presenter.editNotes");
    if (value && started) notes.focus();
  }
  function setLayout(value: "notes" | "slides") {
    root.setAttribute("data-layout", value);
    layoutButton.textContent = value === "notes" ? t("decks.presenter.hideNotes") : t("decks.presenter.showNotes");
  }
  function setNoteSize(value: number) {
    noteSize = Math.max(0, Math.min(NOTE_SIZES.length - 1, value));
    notePanel.style.setProperty("--dp-note-size", `var(${NOTE_SIZES[noteSize]})`);
    smaller.hidden = noteSize === 0; larger.hidden = noteSize === NOTE_SIZES.length - 1;
  }
  function openConflict() {
    if (!noteId || blocked) return;
    const id = noteId, latest = presenterSlides(hooks.source()).find(item => item.id === id);
    if (!latest) { noteStatus.textContent = t("decks.presenter.noteSlideRemoved"); return; }
    const backdrop = el("div", "ds-dialog-backdrop"), panel = el("div", "ds-dialog dp-conflict");
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); panel.setAttribute("aria-label", t("decks.presenter.conflictLabel"));
    const compare = el("div", "dp-compare"), theirs = el("div"), mine = el("div");
    const theirsText = el("pre", undefined, latest.notes || t("decks.presenter.empty")), mineText = el("pre", undefined, notes.value || t("decks.presenter.empty"));
    theirsText.setAttribute("data-latest", ""); mineText.setAttribute("data-mine", "");
    theirs.append(el("h3", undefined, t("decks.presenter.latestNotes")), theirsText); mine.append(el("h3", undefined, t("decks.presenter.yourInput")), mineText); compare.append(theirs, mine);
    const dismiss = () => { backdrop.remove(); notes.focus(); };
    const actions = el("div", "ds-dialog-actions");
    actions.append(
      button(t("decks.presenter.backToInput"), dismiss),
      button(t("decks.presenter.useLatest"), () => { notes.value = latest.notes; noteBase = latest.notes; dirty = false; conflictButton.hidden = true; savedMeta.hidden = false; dismiss(); }),
      button(t("decks.presenter.overwrite"), () => { noteBase = latest.notes; dismiss(); flush(); }),
    );
    panel.append(el("h2", undefined, t("decks.presenter.conflictTitle")), el("p", undefined, t("decks.presenter.conflictNote")), compare, actions);
    backdrop.append(panel);
    backdrop.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(); } });
    root.append(backdrop); actions.querySelector("button")?.focus();
  }

  const adoptButton = button(t("decks.presenter.adopt"), () => { if (flush()) void update(true); });
  const retryButton = button(t("decks.presenter.retry"), () => { void update(); });
  const conflictButton = button(t("decks.presenter.conflictLabel"), openConflict); conflictButton.hidden = true;
  const pause = styleDeckButton(button(t("decks.presenter.pauseTimer"), togglePause), "pause", true, t("decks.presenter.pauseTimer")); pause.hidden = true;
  const endButton = button(closeLabel, close);
  const startButton = styleDeckButton(button(t("decks.presenter.start"), begin), "play"); startButton.classList.add("ds-primary");
  const previousButton = styleDeckButton(button(t("decks.presenter.previous"), () => move(-1)), "previous"), nextButton = button(t("decks.presenter.nextButton"), () => move(1));
  nextButton.append(deckIcon("next"));
  const nav = el("div", "dp-nav"); nav.setAttribute("role", "group"); nav.setAttribute("aria-label", t("decks.presenter.navigation")); nav.append(previousButton, nextButton);
  const audienceButton = styleDeckButton(button(t("decks.presenter.openAudience"), () => { openAudience(); }), "monitor");
  const layoutButton = button(t("decks.presenter.hideNotes"), () => setLayout(root.getAttribute("data-layout") === "notes" ? "slides" : "notes"));
  const editButton = button(t("decks.presenter.editNotes"), () => { if (editing) notes.blur(); else setEditing(true); }); editButton.hidden = true;
  const smaller = button("A−", () => { setNoteSize(noteSize - 1); writeNoteSize(noteSize); }), larger = button("A+", () => { setNoteSize(noteSize + 1); writeNoteSize(noteSize); });
  smaller.setAttribute("aria-label", t("decks.presenter.smaller")); larger.setAttribute("aria-label", t("decks.presenter.larger"));
  noteTools.append(smaller, larger, editButton);

  clock.append(pause); timer.append(durationLabel, clock);
  const headerEnd = el("div", "dp-group"); headerEnd.append(layoutButton, endButton);
  header.append(deckTitle, timer, headerEnd);
  caption.append(position, slideTitle, notice);
  stage.append(...frames(current)); main.append(caption, stage);
  nextBox.append(...frames(next), end); end.hidden = true;
  noteFooter.append(noteStatus, savedMeta, conflictButton);
  notePanel.append(noteHead, noteRead, notes, noteFooter);
  upcomingPanel.append(nextLabel, nextBox); body.append(main, upcomingPanel, notePanel);
  const left = el("div", "dp-group"), right = el("div", "dp-group");
  left.append(audienceButton, connection); right.append(nav, startButton); footer.append(left, right);
  root.append(style, header, body, footer); hooks.host.append(root);
  root.addEventListener("keydown", event => controlKey(event, document));

  const tick = setInterval(() => {
    if (disposed) return;
    renderClock();
    if (popup?.closed) { connection.textContent = t("decks.presenter.audienceClosed"); }
    else if (popup && audience) {
      try {
        if (popup.location.href !== "about:blank") { connection.textContent = t("decks.presenter.audienceMoved"); audience = null; popup = null; }
        else if (!popup.document.contains(audience.shown.frame)) mountAudience();
      }
      catch { connection.textContent = t("decks.presenter.audienceLost"); audience = null; popup = null; }
    }
    if (!dirty) noteStatus.textContent = hooks.status();
    showSaved(); fitReserve(current); fitReserve(next); if (audience) fitReserve(audience);
    syncNotes(); if (hooks.saved().versionId !== version) void update();
  }, 250);
  setLayout("notes"); setNoteSize(noteSize); setEditing(true);
  if (readOnly) { notes.readOnly = true; noteFooter.hidden = true; }
  if (autoStart && hooks.audienceWindow) { popup = hooks.audienceWindow; mountAudience(); }
  syncNotes(); showSaved(); void update(); startButton.focus();
  return { close, revoke: stopAudience, update: () => { syncNotes(); void update(); }, flush };
}
