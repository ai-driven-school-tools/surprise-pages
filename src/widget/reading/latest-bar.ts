import { EASE, MOTION } from "../../lib/settings/ui-motion";
import { TITLEBAR_HEIGHT } from "../../lib/workspace/window-titlebar";
import { WORKSPACE_FONT, WORKSPACE_INK, type WorkspaceInk } from "../../lib/workspace/ink";
import { paintPageTone } from "./page-ground";
import { topInset } from "./top-inset";
import { el } from "../shared/util";

/**
 * 開いている間に「新しい版ができた」ことを、上端に 1 行だけ知らせる帯（page-latest.ts が使う）。
 *
 *   読んでいる本文は動かさない … 帯は言うだけ。入れ替えるのは人がボタンを押したときだけ
 *   帯の高さ                    … 自分の高さを top-inset.ts に届けるだけ（本文の余白は書かない）
 *   明暗                        … 端末の明暗ではなくページの地で決める（現在地の行と同じ・page-ground.ts）
 *   読み上げ                    … 何が起きたか（`text`）だけを知らせの範囲に入れる。「○分前」が
 *                                  進むたびに読み上げられないよう、添えの字（`detail`）は範囲の外に置く
 *
 * 本文の DOM には何も足さない（帯は別の Shadow DOM）。
 */
export const LATEST_TAG = "surprise-latest";

export type LatestNotice = {
  /** 何が起きたか（例「新しい版があります」）。 */
  text: string;
  /** いつ・誰が（例「10:52 山田 が更新・3分前」）。無ければ出さない。 */
  detail: string | null;
  /** 指を置いたときに出す正確な時刻。無ければ出さない。 */
  title: string | null;
  /** ボタンの字（例「再読み込み」）。 */
  action: string;
  onAction: () => void;
};

function ink(tone: WorkspaceInk): string {
  return [
    `--ink: ${tone.text};`,
    `--ink-muted: ${tone.muted};`,
    `--ground: var(--page-ground, Canvas);`,
    `--line: color-mix(in srgb, ${tone.text} ${tone.lineMix}%, transparent);`,
    `--hover: color-mix(in srgb, ${tone.text} ${tone.hoverMix}%, transparent);`,
    `--press: color-mix(in srgb, ${tone.text} ${tone.pressMix}%, transparent);`,
  ].join(" ");
}

/*
 * 見た目は現在地の行（location-bar-styles.ts）と同じ墨・地・高さ・字・押す面。帯は言葉と押す部品 1 つだけで、
 * 色は使わない。いつ・誰がは添えの濃さ（muted）で、何が起きたかと字の濃さだけで分ける。
 * 本文がくぐっている間だけ下に線を 1 本（重なっていないときは余白と字で分かれる）。
 */
export const LATEST_STYLES = `
:host {
  all: initial;
  position: fixed;
  top: var(--latest-top, 0px);
  left: 0;
  right: 0;
  z-index: 2147482300;
  display: block;
  height: ${TITLEBAR_HEIGHT}px;
  --control: 32px;
  --radius: 6px;
  color-scheme: light;
  ${ink(WORKSPACE_INK.light)}
}
:host([data-tone="dark"]) { color-scheme: dark; ${ink(WORKSPACE_INK.dark)} }
*, *::before, *::after { box-sizing: border-box; }
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  padding: 0 12px 0 16px;
  background: color-mix(in srgb, var(--ground) 84%, transparent);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  backdrop-filter: saturate(180%) blur(20px);
  color: var(--ink);
  font: 400 14px/20px ${WORKSPACE_FONT};
  -webkit-font-smoothing: antialiased;
  white-space: nowrap;
  transition: box-shadow ${MOTION.quick}ms ${EASE};
}
:host([data-scrolled]) .bar { box-shadow: 0 1px 0 var(--line); }
/* 狭い画面では、いつ・誰がの添えから先に縮める。それでも入らなければ何が起きたかも縮める（押す部品は画面の外へ出さない） */
.text { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.detail { flex: 0 100 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--ink-muted); }
.detail[hidden] { display: none; }
button {
  display: inline-flex;
  flex: none;
  align-items: center;
  height: var(--control);
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: background-color ${MOTION.quick}ms ${EASE};
  -webkit-tap-highlight-color: transparent;
}
button:hover { background: var(--hover); }
button:active { background: var(--press); }
:focus-visible { outline: 2px solid var(--ink); outline-offset: -2px; }
@media (prefers-reduced-motion: reduce) { .bar, button { transition: none; } }
@media print { :host { display: none !important; } }
`;

type Mounted = {
  host: HTMLElement;
  text: HTMLElement;
  detail: HTMLElement;
  button: HTMLButtonElement;
  stop: () => void;
  onAction: () => void;
};

/** 帯の中身を組み立てる。字と動きは持たない。 */
export function latestBarNodes(): { bar: HTMLDivElement; text: HTMLSpanElement; detail: HTMLSpanElement; button: HTMLButtonElement } {
  const bar = el("div", "bar");
  const text = el("span", "text");
  text.setAttribute("role", "status");
  const detail = el("span", "detail");
  const button = el("button");
  button.type = "button";
  bar.append(text, detail, button);
  return { bar, text, detail, button };
}

export class LatestBar {
  private mounted: Mounted | null = null;

  /** 出す。出ていれば、字とボタンをその場で差し替える（帯を作り直さない＝焦点も位置も動かない）。 */
  show(notice: LatestNotice): void {
    const mounted = this.mounted ?? this.mount();
    if (mounted.text.textContent !== notice.text) mounted.text.textContent = notice.text;
    const detail = notice.detail ?? "";
    if (mounted.detail.textContent !== detail) mounted.detail.textContent = detail;
    mounted.detail.hidden = detail.length === 0;
    if (notice.title === null) mounted.detail.removeAttribute("title");
    else mounted.detail.title = notice.title;
    if (mounted.button.textContent !== notice.action) mounted.button.textContent = notice.action;
    mounted.onAction = notice.onAction;
  }

  /** しまう。帯のぶんの余白も返す。 */
  hide(): void {
    const mounted = this.mounted;
    if (mounted === null) return;
    this.mounted = null;
    mounted.stop();
    mounted.host.remove();
    topInset.set("latest", 0);
  }

  get visible(): boolean {
    return this.mounted !== null;
  }

  private mount(): Mounted {
    const host = document.createElement(LATEST_TAG);
    const shadow = host.attachShadow({ mode: "open" });
    const style = el("style");
    style.textContent = LATEST_STYLES;
    const { bar, text, detail, button } = latestBarNodes();
    shadow.append(style, bar);
    document.body.append(host);
    const arrange = (): void => { host.style.setProperty("--latest-top", `${topInset.above("latest")}px`); };
    arrange();
    const unwatch = topInset.watch(arrange);
    topInset.set("latest", TITLEBAR_HEIGHT);
    const paintScrolled = (): void => { host.toggleAttribute("data-scrolled", window.scrollY > 0); };
    paintScrolled();
    window.addEventListener("scroll", paintScrolled, { passive: true });
    // 明暗は現在地の行と同じく、ページの地から読む（端末の明暗が変わったときに読み直す）
    const paintTone = (): void => paintPageTone(host);
    paintTone();
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", paintTone);
    const stop = (): void => {
      unwatch();
      window.removeEventListener("scroll", paintScrolled);
      scheme.removeEventListener("change", paintTone);
    };
    const mounted: Mounted = { host, text, detail, button, stop, onAction: () => undefined };
    // 帯を外せばボタンごと捨てるので、押したときの受け口は外さなくてよい
    button.addEventListener("click", () => mounted.onAction());
    this.mounted = mounted;
    return mounted;
  }
}
