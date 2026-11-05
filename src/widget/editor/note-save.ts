import { NOTE_DRAFT_MAX_BYTES, NOTE_DRAFT_TTL_MS, NOTE_RETRY_LIMIT, NOTE_SAVE_MAX_MS, NOTE_SAVE_QUIET_MS, NOTE_WATCH_MS, type NoteSaveResponse } from "../../lib/notes/model";
import { loadLatestVersion } from "../shared/api";
import { widgetLocale } from "../shared/i18n";

/**
 * メモ帳の保存の流れ。
 *
 *   打つ        → 同じ瞬間（次の手番）にブラウザの控えへ書く（3 日で失効）
 *   1 秒静かになる・打ち続けて 10 秒・タブを離れる → 本文を 1 版として送る
 *   受け取った  → 次の土台にする。送っている間に打った分は、次の送信にまとまる
 *   届かない    → 同じ目印・同じ中身で送り直す（サーバーが二度積まない）。5 回届かなければ「保存できていません」
 *   ほかの場所で先に保存されていた（409） → 止める（上書きしない）。控えは残す
 *
 * 成功は字で言わない。言うのは失敗だけ（呼ぶ側の `status`）。
 */

/** 控えの鍵の頭。直す画面の控え（src/widget/editor/draft.ts）とは別の名前にする（形が違う）。 */
export const NOTE_DRAFT_PREFIX = "sp-pages:note-draft:";

export type NoteDraft = { v: 1; base: string | null; title: string; body: string; savedAt: number };

export function readNoteDraft(pageSlug: string): NoteDraft | null {
  try {
    const raw = window.localStorage.getItem(`${NOTE_DRAFT_PREFIX}${pageSlug}`);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const base = Reflect.get(value, "base");
    const title = Reflect.get(value, "title");
    const body = Reflect.get(value, "body");
    const savedAt = Reflect.get(value, "savedAt");
    if (Reflect.get(value, "v") !== 1 || (base !== null && typeof base !== "string") || typeof title !== "string" || typeof body !== "string" || typeof savedAt !== "number") return null;
    if (Date.now() - savedAt > NOTE_DRAFT_TTL_MS) {
      clearNoteDraft(pageSlug);
      return null;
    }
    return { v: 1, base, title, body, savedAt };
  } catch {
    return null;
  }
}

function writeNoteDraft(pageSlug: string, draft: NoteDraft): void {
  try {
    const json = JSON.stringify(draft);
    if (json.length > NOTE_DRAFT_MAX_BYTES) return;
    window.localStorage.setItem(`${NOTE_DRAFT_PREFIX}${pageSlug}`, json);
  } catch {
    // 書けなくても打つことは止めない（保険が無いだけ）
  }
}

export function clearNoteDraft(pageSlug: string): void {
  try {
    window.localStorage.removeItem(`${NOTE_DRAFT_PREFIX}${pageSlug}`);
  } catch {
    // 消えなくても失効で落ちる
  }
}

/** 失効した控えを片付ける。開くたびに 1 度。 */
export function purgeNoteDrafts(): void {
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key !== null && key.startsWith(NOTE_DRAFT_PREFIX)) keys.push(key);
    }
    for (const key of keys) readNoteDraft(key.slice(NOTE_DRAFT_PREFIX.length));
  } catch {
    // 片付けられなくても書ける
  }
}

export type NoteSnapshot = { title: string; body: string };
export type NoteSaveStatus = "ok" | "offline" | "failed" | "conflict";

export type NoteSaverOptions = {
  pageSlug: string;
  baseVersionId: string;
  snapshot(): NoteSnapshot;
  status(state: NoteSaveStatus): void;
  /** 保存の答えのページの名前（題か、題が無ければ本文の冒頭）。タブの名前を書き直す */
  named(name: string): void;
};

type Sending = { key: string; operationId: string; title: string; body: string };

export class NoteSaver {
  private base: string;
  private acknowledged: string | null = null;
  private sending: Sending | null = null;
  /** 届かなかった送信。中身が同じなら同じ目印で送り直す */
  private unsent: Sending | null = null;
  private again = false;
  private quiet: number | null = null;
  private longest: number | null = null;
  private retry: number | null = null;
  private draftTimer: number | null = null;
  private watchTimer: number | null = null;
  private failures = 0;
  private frozen = false;
  private disposed = false;
  private readonly mine = new Set<string>();
  private readonly tab = crypto.randomUUID();
  private readonly channel: BroadcastChannel | null;
  private readonly abort = new AbortController();
  /** 保存が落ち着くのを待っている人（「終える」）。落ち着いたら true、止まったら false を渡す */
  private readonly idleWaiters: Array<(saved: boolean) => void> = [];

  constructor(private readonly options: NoteSaverOptions) {
    this.base = options.baseVersionId;
    this.channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(`sp-pages:note:${options.pageSlug}`) : null;
    this.channel?.addEventListener("message", (event: MessageEvent<unknown>) => this.heard(event.data));
    const signal = this.abort.signal;
    // タブを離れる瞬間に積む（閉じる・ほかのタブへ移る・アプリを切り替える）
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") this.flush(true); }, { signal });
    window.addEventListener("pagehide", () => this.flush(true), { signal });
    window.addEventListener("online", () => { if (this.unsent !== null || this.pending()) this.flush(false); }, { signal });
    this.watch();
  }

  /** いまの土台（出ている版）。 */
  get baseVersionId(): string {
    return this.base;
  }
  /** 打ったあと、まだ受け取られていない字があるか。 */
  pending(): boolean {
    return this.keyOf(this.options.snapshot()) !== this.acknowledged;
  }

  /** 中身から決まる送る単位の鍵。 */
  private keyOf(snapshot: NoteSnapshot): string {
    return JSON.stringify([snapshot.title, snapshot.body]);
  }

  /** 開いたときの中身を「受け取られている」として覚える（開いただけで版を積まない）。 */
  settle(): void {
    this.acknowledged = this.keyOf(this.options.snapshot());
  }

  /** 打った。控えを書き、版を積む時刻を決め直す。 */
  changed(): void {
    if (this.disposed) return;
    this.scheduleDraft();
    if (this.frozen) return;
    if (this.quiet !== null) window.clearTimeout(this.quiet);
    this.quiet = window.setTimeout(() => this.flush(false), NOTE_SAVE_QUIET_MS);
    this.longest ??= window.setTimeout(() => this.flush(false), NOTE_SAVE_MAX_MS);
  }

  /** 送って、保存が落ち着くのを待つ（「終える」）。全部受け取られたら true、止まった・届かないなら false。 */
  finish(): Promise<boolean> {
    if (this.frozen) return Promise.resolve(false);
    if (this.sending === null && !this.pending()) return Promise.resolve(true);
    const waiting = new Promise<boolean>((resolve) => this.idleWaiters.push(resolve));
    this.flush(false);
    return waiting;
  }

  private settleWaiters(saved: boolean): void {
    for (const resolve of this.idleWaiters.splice(0)) resolve(saved);
  }

  private scheduleDraft(): void {
    if (this.draftTimer !== null) return;
    // 同じ瞬間（この手番の直後）に書く。打鍵の処理の中では本文を書き出さない
    this.draftTimer = window.setTimeout(() => {
      this.draftTimer = null;
      const now = this.options.snapshot();
      if (this.keyOf(now) === this.acknowledged) return;
      writeNoteDraft(this.options.pageSlug, { v: 1, base: this.base, title: now.title, body: now.body, savedAt: Date.now() });
    }, 0);
  }

  /** 送る。`leaving` はタブを離れる瞬間（応答を待たずに届ける）。 */
  flush(leaving: boolean): void {
    if (this.disposed || this.frozen) return;
    this.clearTimers();
    if (this.sending !== null) {
      this.again = true;
      return;
    }
    const now = this.options.snapshot();
    const key = this.keyOf(now);
    if (key === this.acknowledged) {
      this.settleWaiters(true);
      return;
    }
    const sending: Sending = this.unsent !== null && this.unsent.key === key ? this.unsent : { key, operationId: crypto.randomUUID(), title: now.title, body: now.body };
    this.sending = sending;
    void this.send(sending, leaving);
  }

  private async send(sending: Sending, leaving: boolean): Promise<void> {
    const body = JSON.stringify({ page: this.options.pageSlug, operationId: sending.operationId, baseVersionId: this.base, title: sending.title, body: sending.body });
    let response: Response;
    try {
      response = await fetch("/api/pages/notes", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "Accept-Language": widgetLocale() },
        body,
        // 閉じる瞬間の送信は、ページが消えても届ける（大きすぎる本文は控えに任せる）
        keepalive: leaving && body.length < 60_000,
      });
    } catch {
      this.missed(sending);
      return;
    }
    if (response.status === 409) {
      this.sending = null;
      this.conflict();
      return;
    }
    if (!response.ok) {
      // 本文の形の断り（書けない形・大きすぎる）は送り直しても直らないので止める（字は控えに残っている）。
      // ログインの確かめ・サーバーの一時の失敗（401・5xx など）は、間を空けて送り直し続ける（一度の失敗で保存をやめない）
      this.missed(sending, response.status === 400 || response.status === 413);
      return;
    }
    const saved: unknown = await response.json().catch(() => null);
    if (!isSaveResponse(saved)) {
      this.missed(sending);
      return;
    }
    this.sending = null;
    this.unsent = null;
    this.failures = 0;
    this.acknowledged = sending.key;
    this.base = saved.versionId;
    this.mine.add(saved.versionId);
    this.channel?.postMessage({ type: "saved", tab: this.tab, versionId: saved.versionId });
    if (typeof saved.name === "string") this.options.named(saved.name);
    this.options.status("ok");
    if (this.keyOf(this.options.snapshot()) === this.acknowledged) clearNoteDraft(this.options.pageSlug);
    else this.scheduleDraft();
    if (this.again || this.idleWaiters.length > 0) {
      this.again = false;
      this.flush(false);
    }
  }

  private missed(sending: Sending, refused = false): void {
    this.sending = null;
    this.unsent = sending;
    this.failures += 1;
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    const failed = this.failures >= NOTE_RETRY_LIMIT || refused;
    this.options.status(failed ? "failed" : offline ? "offline" : "ok");
    if (failed) this.settleWaiters(false);
    if (refused) return;
    // 間を空けて送り直す（1・2・4・8・16 秒・30 秒まで）。回線が戻れば online の合図でもすぐ送る
    const wait = Math.min(30_000, 1000 * 2 ** Math.min(this.failures - 1, 5));
    if (this.retry !== null) window.clearTimeout(this.retry);
    this.retry = window.setTimeout(() => {
      this.retry = null;
      this.flush(false);
    }, wait);
  }

  /** 「もう一度」を押した。 */
  retryNow(): void {
    this.failures = 0;
    this.flush(false);
  }

  private conflict(): void {
    if (this.frozen) return;
    this.frozen = true;
    this.clearTimers();
    // 控えは残す（読み込み直したあとに「保存されなかった直しがあります」で戻せる）
    if (this.pending()) {
      const now = this.options.snapshot();
      writeNoteDraft(this.options.pageSlug, { v: 1, base: this.base, title: now.title, body: now.body, savedAt: Date.now() });
    }
    this.settleWaiters(false);
    this.options.status("conflict");
  }

  /** ほかのタブが積んだ。自分の土台より新しいなら止める。 */
  private heard(message: unknown): void {
    if (typeof message !== "object" || message === null) return;
    const versionId = Reflect.get(message, "versionId");
    if (Reflect.get(message, "type") !== "saved" || Reflect.get(message, "tab") === this.tab || typeof versionId !== "string") return;
    if (versionId !== this.base && !this.mine.has(versionId)) this.conflict();
  }

  /** ほかの端末で積まれた版に気づく（開いている間・表に出ている間だけ 1 分ごと）。 */
  private watch(): void {
    this.watchTimer = window.setTimeout(() => {
      this.watchTimer = null;
      if (this.disposed) return;
      if (document.visibilityState === "visible" && !this.frozen && this.sending === null) {
        void loadLatestVersion(this.options.pageSlug).then((result) => {
          if (!result.ok || result.value === null || this.disposed || this.sending !== null) return;
          const latest = result.value.sha;
          if (latest !== this.base && !this.mine.has(latest)) this.conflict();
        });
      }
      this.watch();
    }, NOTE_WATCH_MS);
  }

  private clearTimers(): void {
    if (this.quiet !== null) window.clearTimeout(this.quiet);
    if (this.longest !== null) window.clearTimeout(this.longest);
    this.quiet = null;
    this.longest = null;
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimers();
    if (this.retry !== null) window.clearTimeout(this.retry);
    if (this.watchTimer !== null) window.clearTimeout(this.watchTimer);
    if (this.draftTimer !== null) window.clearTimeout(this.draftTimer);
    this.abort.abort();
    this.channel?.close();
    this.settleWaiters(false);
  }
}

function isSaveResponse(value: unknown): value is NoteSaveResponse {
  if (typeof value !== "object" || value === null) return false;
  return typeof Reflect.get(value, "versionId") === "string" && typeof Reflect.get(value, "pageSlug") === "string";
}
