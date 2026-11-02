/**
 * コメントの一覧を「見ている間だけ、勝手に読み直す」ときの時機の決まり（純関数）。
 *
 * 配布版の保存先（Neon Free）は、問い合わせが来ている間は眠れず、月の計算時間を使い続ける。
 * なので読み直しは **見えていて・操作があって・編集中でない** ときだけ回し、それ以外は止める。
 * 止まっていれば保存先は 5 分で眠り、計算時間を使わない。設計は docs/design/live-comments.md。
 *
 * ブラウザ側（src/widget/comments/live.ts）と単体テストが同じこの 1 つを読む。数をここ以外に書かない。
 */
export const LIVE_REFRESH = {
  /** 見ている間に読み直す間隔。 */
  intervalMs: 5_000,
  /** これだけ操作が無ければ止める（放置したタブで保存先を起こし続けない）。 */
  idleAfterMs: 10 * 60_000,
  /** 失敗が続いたときに伸ばす間隔の上限。 */
  failureMaxMs: 60_000,
} as const;

export type LiveRefreshInput = {
  /** タブが見えているか（document.visibilityState === "visible"）。 */
  visible: boolean;
  /** 本文やスライドを直している最中か。 */
  editing: boolean;
  /** 最後の操作からの経過（ミリ秒）。 */
  idleForMs: number;
  /** 直前から続けて失敗した回数。成功で 0 に戻す。 */
  failures: number;
};

/**
 * 次に読み直すまでの待ち（ミリ秒）。`null` は「止まる」。
 *
 * 失敗が続いたら 2 倍ずつ伸ばす（5 → 10 → 20 → 40 → 60 秒）。落ちているサーバーを 5 秒ごとに
 * 叩き続けない。成功すれば呼ぶ側が failures を 0 に戻し、元の間隔に戻る。
 */
export function nextLiveRefreshDelay(input: LiveRefreshInput): number | null {
  if (!input.visible || input.editing) return null;
  if (input.idleForMs >= LIVE_REFRESH.idleAfterMs) return null;
  if (input.failures <= 0) return LIVE_REFRESH.intervalMs;
  return Math.min(LIVE_REFRESH.intervalMs * 2 ** input.failures, LIVE_REFRESH.failureMaxMs);
}
