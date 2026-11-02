import { DECK_CURRENT, DECK_FRAME, DECK_HASH, DECK_SLIDE, DECK_TOOLBAR } from "../../../lib/deck/deck";
import { readerPresentationSource } from "./source";
import { DECK_WORKSPACE_STYLES } from "../workspace/styles";
import { isDeckPage } from "../deck";
import { hasSecondScreen, moveToOtherScreen } from "../../reading/screens";
import { STYLES } from "../../shared/styles";
import { ICON_PRESENTATION, el } from "../../shared/util";
import { PRESENTER_LAUNCHER, readDeckTools } from "../edit/tools";
import { t } from "../../shared/i18n";

/**
 * 読む画面から発表者画面へ入る口。
 *
 * - 「プレゼンを始める」は、プロジェクターなどの画面がつながっているとき（Chrome・Edge）だけ
 *   発表者画面へ振り分ける。手元は発表者画面、向こうの画面に観客用の窓を開いてそのまま始める。
 *   つながっていなければ、今までどおり画面いっぱいの発表になる。
 * - 操作の列に「発表者画面」を足す。画面が 1 つでも、始める前の確かめや練習に使える。
 *   道具箱のある画面では操作の列ごと隠れるので（src/widget/deck/deck.ts）、同じ入口を道具箱の ⋯ から
 *   `openPresenterView` で開く（src/widget/deck/edit/tools.ts が釦と状態を読む）。
 *
 * 発表者画面の中身は編集画面と同じ部品（deck-presenter）。本文を直せる人には、編集画面と
 * 同じ保存の仕組みの上に開いてノートを直せるようにする。直せない人・社外の人には読むだけで
 * 開き、保存の仕組みに触れない。そのときの材料はいま配信されている本文そのもの
 * （社外公開のページではサーバーがノートを取り除いたもの）で、見る人に見えていない物は増えない。
 */

const HOST = "surprise-presenter";
const LAUNCHER = PRESENTER_LAUNCHER;

let active = false;
/** 道具箱の ⋯ から開くときに使う、mount で受け取った口。deck でない・最新の版でないときは null のまま */
let mounted: Options | null = null;
type Options = {
  /** 本文を直せる人か（道具箱の答えから）。直せるなら、ノートを直せる発表者画面を開く。 */
  editable(): boolean;
  openEditable(presenter: { audienceWindow: Window | null; slide: string | null }): Promise<void>;
};

/** 保存済みの操作列の「プレゼンを始める」。押せない（全部スキップ）ときも入口は足すので、隠れていなければ返す。 */
function presentButton(): HTMLButtonElement | null {
  for (const toolbar of document.querySelectorAll(`[${DECK_TOOLBAR}]`)) {
    for (const button of toolbar.querySelectorAll("button")) {
      if (!button.hasAttribute(LAUNCHER) && (button.textContent ?? "").includes("プレゼンを始める")) return button; // i18n-keep: 保存済みページの実行部が描くボタンを字面で探す（実行部の文は本文の一部で訳さない）
    }
  }
  return null;
}

/** 過去の版・見比べの画面では出さない（版の帯などが枚に写り込み、いま出ている版とも食い違う）。 */
export function viewingLatest(): boolean {
  const params = new URLSearchParams(window.location.search);
  return !window.location.pathname.startsWith("/history/") && !params.has("v") && !params.has("from");
}

/** いま配信されている本文を取り寄せる（見る人に見えている物だけが材料になる）。 */
export async function presentationSource(): Promise<string> {
  const url = new URL(window.location.href); url.hash = "";
  const response = await fetch(url.href, { credentials: "same-origin", headers: { Accept: "text/html" } });
  if (!response.ok) throw new Error(t("decks.presentLaunch.loadFailed"));
  return readerPresentationSource(await response.text());
}

/** 読んでいた枚から始める。発表中・一覧は印の付いた枚、縦並びは画面のまん中にある枚。 */
function currentSlide(): string | null {
  const frames = [...document.querySelectorAll<HTMLElement>(`[${DECK_FRAME}]`)];
  const middle = window.innerHeight / 2;
  const hash = DECK_HASH.exec(window.location.hash);
  const frame = frames.find(item => item.hasAttribute(DECK_CURRENT))
    ?? frames.find(item => { const box = item.getBoundingClientRect(); return box.top <= middle && box.bottom >= middle; })
    ?? (hash ? frames[Number(hash[1]) - 1] : undefined);
  const slide = frame?.querySelector(`section[${DECK_SLIDE}]`);
  if (!slide) return null;
  return slide.getAttribute("data-deck-node") ?? `present-${[...document.querySelectorAll(`section[${DECK_SLIDE}]`)].indexOf(slide) + 1}`;
}

async function launch(start: boolean, restoreFocus: () => void, options: Options): Promise<void> {
  if (active) return;
  // 窓は押した瞬間にしか開けない。資料を取りに行く前に開いて、向こうの画面へ送る。
  const audience = start ? window.open("about:blank", "", "popup,width=1280,height=720") : null;
  if (audience) void moveToOtherScreen(audience);
  const selected = currentSlide();
  // 直せる人は、編集画面と同じ保存の仕組みの上に発表者画面を開く（ノートを直せる）。
  if (options.editable()) { await options.openEditable({ audienceWindow: audience, slide: selected }); return; }
  active = true;
  const host = document.createElement(HOST);
  const root = host.attachShadow({ mode: "open" });
  const style = el("style"); style.textContent = STYLES + DECK_WORKSPACE_STYLES;
  const screen = el("div", "edit-screen deck-studio");
  root.append(style, screen);
  const overflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = "hidden";
  document.body.append(host);
  const finish = () => { host.remove(); document.documentElement.style.overflow = overflow; active = false; restoreFocus(); };
  let html: string;
  let presenter: typeof import("./presenter");
  // 発表者画面の部品（スライド編集と共有の部品を含めて 3MB 超）は、ここで初めて読む。本文の取り寄せと同時に読むので、
  // 待ちは増えない（読むだけの人には送らない・docs/design/app-speed.md の「道具箱の部品を分ける」）
  try { [html, presenter] = await Promise.all([presentationSource(), import("./presenter")]); }
  catch (error) {
    audience?.close(); finish();
    window.alert(error instanceof Error ? error.message : t("decks.presentLaunch.openFailed"));
    return;
  }
  const saved = { html, versionId: "reader", versionNumber: 0 };
  presenter.openDeckPresenter({
    host: screen, readOnly: true, audienceWindow: audience,
    saved: () => saved, preview: () => html, source: () => html, status: () => "",
    commit: () => false, current: () => selected, closed: finish,
  });
}

function addLauncher(present: HTMLButtonElement, options: Options): void {
  if (present.parentElement?.querySelector(`[${LAUNCHER}]`)) return;
  const launcher = present.cloneNode(false);
  if (!(launcher instanceof HTMLButtonElement)) return;
  launcher.setAttribute(LAUNCHER, "");
  launcher.removeAttribute("title");
  launcher.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON_PRESENTATION.map((d) => `<path d="${d}"/>`).join("") + "</svg>";
  launcher.append(el("span", undefined, t("decks.presentLaunch.presenter")));
  const sync = () => { launcher.hidden = present.hidden; launcher.disabled = present.disabled; };
  sync();
  new MutationObserver(sync).observe(present, { attributes: true, attributeFilter: ["hidden", "disabled"] });
  launcher.addEventListener("click", () => { if (!launcher.disabled) void launch(false, () => launcher.focus(), options); });
  present.after(launcher);
  // 実行部の釦より先に受ける（同じ要素に後から足した受け手では、実行部が先に発表を始めてしまう）。
  present.parentElement?.addEventListener("click", event => {
    if (!(event.target instanceof Element) || event.target.closest("button") !== present) return;
    if (present.disabled || !hasSecondScreen()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    void launch(true, () => present.focus(), options);
  }, true);
}

/**
 * 道具箱の ⋯ から発表者画面を開く。保存済みの操作列の入口と同じ処理を通る（入口が 2 つでも開き方は 1 つ）。
 * 開けるのは、入口を足してある画面（deck・最新の版）で、向こうの「プレゼンを始める」が押せるときだけ。
 */
export function openPresenterView(restoreFocus: () => void): void {
  const presenter = readDeckTools()?.presenter ?? null;
  if (mounted === null || presenter === null) return;
  void launch(false, restoreFocus, mounted);
}

export function mountDeckPresenterLauncher(options: Options): void {
  if (!isDeckPage() || !viewingLatest()) return;
  mounted = options;
  const found = presentButton();
  if (found) { addLauncher(found, options); return; }
  // 実行部が操作の列を組むのは本文を読み終えたあと。組まれたら 1 度だけ足す。
  const observer = new MutationObserver(() => {
    const present = presentButton();
    if (!present) return;
    observer.disconnect(); addLauncher(present, options);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 10_000);
}
