import { nextLiveRefreshDelay } from "../../lib/comments/live-refresh";
import type { createWidgetLifetime } from "../shared/widget-lifetime";

/**
 * コメントの一覧を、見ている間だけ勝手に読み直す。**いつ読み直すかを決めるのはここ 1 つ。**
 *
 * 以前は「タブに戻ったとき（focus）」「編集画面を閉じたとき」の 2 か所が別々に読み直していた。
 * ここへ寄せ、「見えていて・操作があって・編集中でないときは数秒ごと」を足した。時機の決まり
 * （間隔・放置の判定・失敗の伸び方）は src/lib/comments/live-refresh.ts の純関数。
 *
 * 原本の取り込み（origin.ts）の 5 秒ごとの確認は、仕事の進みを見る別のものなので、ここに寄せない。
 */
type Host = {
  /** 一覧を読み直す。うまくいったら true。quiet のときは失敗を画面に出さない（定期の読み直しで断りを連発しない）。 */
  refresh: (options: { quiet: boolean }) => Promise<boolean>;
  /** 本文やスライドを直している最中か。 */
  editing: () => boolean;
  lifetime: ReturnType<typeof createWidgetLifetime>;
};

/** 最後の操作からの経過を数える出来事。どれか 1 つで「触った」と見る。 */
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;

export function createCommentLive(host: Host) {
  const { lifetime } = host;
  let timer = 0;
  let inflight = false;
  let failures = 0;
  let lastActivity = Date.now();

  function visible(): boolean {
    return document.visibilityState === "visible";
  }

  function stop(): void {
    if (timer !== 0) {
      lifetime.clearTimeout(timer);
      timer = 0;
    }
  }

  /** 次の 1 回を予約する。条件が揃わなければ予約せず止まる（止まれば保存先は眠れる）。 */
  function schedule(): void {
    stop();
    const delay = nextLiveRefreshDelay({
      visible: visible(),
      editing: host.editing(),
      idleForMs: Date.now() - lastActivity,
      failures,
    });
    if (delay === null) return;
    timer = lifetime.timeout(() => void tick(true), delay);
  }

  async function tick(quiet: boolean): Promise<void> {
    timer = 0;
    if (inflight || lifetime.disposed) return;
    inflight = true;
    const ok = await host.refresh({ quiet });
    inflight = false;
    if (lifetime.disposed) return;
    failures = ok ? 0 : failures + 1;
    schedule();
  }

  /** 戻ってきた・閉じた: すぐ 1 回読み、定期に戻る。 */
  function resume(): void {
    lastActivity = Date.now();
    failures = 0;
    stop();
    void tick(false);
  }

  /** 触った: 止まっていたら再開する。動いていれば操作の時刻だけ進める。 */
  function activity(): void {
    lastActivity = Date.now();
    if (timer === 0 && !inflight) schedule();
  }

  function start(): void {
    document.addEventListener("visibilitychange", () => {
      if (visible()) resume();
      else stop();
    }, { signal: lifetime.signal });
    window.addEventListener("focus", resume, { signal: lifetime.signal });
    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, activity, { passive: true, capture: true, signal: lifetime.signal });
    }
    schedule();
  }

  return { start, resume, stop };
}
