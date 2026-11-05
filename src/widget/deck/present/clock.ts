/** 発表者画面（src/widget/deck/present/presenter.ts）の上の帯の時計: 持ち時間・経過または残り・計時を止める・計時をリセット。 */
import { styleDeckButton } from "../ui";
import { clockText } from "./local";
import { el } from "../../shared/util";
import { t } from "../../shared/i18n";

type Button = (label: string, fn: () => void) => HTMLButtonElement;

/**
 * 時計は実際の経過から数える（間隔ごとに 1 秒足す形だと、裏のタブで遅れる）。数えるのは running() の間だけ。
 * 持ち時間は開始前にも発表中にも入れる・直せる（残りは始めてからの経過で数える）。
 */
export function presenterClock(button: Button, running: () => boolean) {
  const timer = el("div", "dp-timer");
  const duration = el("input"); duration.type = "number"; duration.inputMode = "numeric"; duration.min = "1"; duration.max = "1440"; duration.placeholder = t("decks.presenter.durationNone"); duration.setAttribute("aria-label", t("decks.presenter.durationLabel"));
  const durationLabel = el("label", "dp-duration"); durationLabel.append(el("span", undefined, t("decks.presenter.duration")), duration, el("span", undefined, t("decks.presenter.minutes")));
  const clock = el("div", "dp-clock"), clockLabel = el("span", "dp-clock-label"), clockTime = el("span", "dp-clock-time");
  clock.setAttribute("role", "timer"); clock.hidden = true;
  let paused = false, elapsed = 0, lastTick = performance.now();

  function render() {
    const at = performance.now(); if (running() && !paused) elapsed += at - lastTick; lastTick = at;
    const spent = Math.floor(elapsed / 1000), budget = duration.checkValidity() ? Number(duration.value) * 60 : 0;
    const seconds = budget > 0 ? budget - spent : spent, over = budget > 0 && seconds < 0;
    const clockState = budget > 0 ? (over ? t("decks.presenter.clockOver") : t("decks.presenter.clockLeft")) : t("decks.presenter.clockElapsed");
    clockLabel.textContent = paused ? t("decks.presenter.clockPaused", { state: clockState }) : clockState;
    clockTime.textContent = clockText(seconds);
    clock.toggleAttribute("data-over", over); clock.toggleAttribute("data-paused", paused);
  }
  function togglePause() {
    render(); paused = !paused; render();
    styleDeckButton(pause, paused ? "play" : "pause", true, paused ? t("decks.presenter.resumeTimer") : t("decks.presenter.pauseTimer"));
    pause.setAttribute("aria-label", paused ? t("decks.presenter.resumeTimer") : t("decks.presenter.pauseTimer"));
  }
  /** 計時を 0 からやり直す（リハーサルのあとの本番など）。止めているなら止めたまま 0 に戻す。 */
  function reset() { elapsed = 0; lastTick = performance.now(); render(); }
  const pause = styleDeckButton(button(t("decks.presenter.pauseTimer"), togglePause), "pause", true, t("decks.presenter.pauseTimer"));
  const resetTimer = styleDeckButton(button(t("deckStudio.presenter.resetTimer"), reset), "reset", true, t("deckStudio.presenter.resetTimer"));
  clock.append(clockLabel, clockTime, pause, resetTimer); timer.append(durationLabel, clock);
  return {
    element: timer,
    render,
    /** 持ち時間の欄が正しいか（開始の前に確かめる）。 */
    valid: () => duration.checkValidity() || (duration.reportValidity(), false),
    /** 発表を始めたら時計を出す（持ち時間の欄は残して、発表中にも直せる）。 */
    begin() { lastTick = performance.now(); clock.hidden = false; render(); },
    /** 発表が止まったら（観客用の窓を止めた）時計の操作を隠す。字は最後の値のまま残す。 */
    hideControls() { pause.hidden = true; resetTimer.hidden = true; },
  };
}
