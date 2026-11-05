import { createWidgetLifetime } from "../shared/widget-lifetime";
import { localizeStored } from "../../lib/i18n/errors";
import { t } from "../shared/i18n";
import {
  changeTouchesOutcome,
  commentsOnVersion,
  isVisibleOutcome
} from "../../lib/comments/outcome-rules";
import {
  type CommentOutcome,
  type PageComment,
  type PageVersion,
  type RedlineChange
} from "../../lib/comments/types";
import {
  clearHighlights
} from "./anchor";
import {
  loadRedline,
  loadVersions
} from "../shared/api";
import type { Compare, State } from './types';
import { topInset } from "../reading/top-inset";
import { carryPlace, keepInPlace, spotHere } from "../reading/position";
import {
  applyRedline,
  changeElements,
  clearRedline,
  drawChangeBars,
  markAddedImages,
  paintChange,
  repaintRedline,
  scrollToChange,
  setRedlineOffset,
  setVersionBannerHidden,
} from "./redline";
import {
  type ToastState
} from "../shared/toast";
import { ICON_SIZE } from "../shared/tokens";
import {
  ICON_CHEVRON_DOWN,
  ICON_CHEVRON_UP,
  dayTime,
  el,
  icon,
  monthDay,
  normalizeText
} from "../shared/util";

/** Owns history behavior; receives only its required page/editor connections. */
type Host = {
  handleFailure: (result: { message: string; status: number; }) => void;
  render: () => void;
  setOpen: (open: boolean) => void;
  hidePopover: () => void;
  hideSelectionBar: () => void;
  hideMarkPeek: () => void;
  pushToast: (text: string, toastState: ToastState, retry?: () => void) => string;
  fillOutcomes: (toVersion: string | null) => Promise<void>;
  syncMarks: (force?: boolean) => void;
  outcomeTargetVersion: () => string | null;
  closeOriginCompare: () => void;
  renderPanelBody: () => void;
  root: ShadowRoot | null;
  isNarrow: () => boolean;
  originDiffError: boolean;
  outcomeOf: (comment: PageComment) => CommentOutcome | null;
  appendQuoteStory: (parent: HTMLElement, comment: PageComment, quoteClass: string, bodyClass: string, withCompareLink?: boolean) => void;
  topLevel: () => PageComment[];
  state: Pick<State, "slug" | "view" | "outcomesFor" | "outcomes" | "features" | "comments">;
};

export function createCommentHistory(connections: Host) {
  const lifetime = createWidgetLifetime();
  const handleFailure: Host['handleFailure'] = (...args) => connections.handleFailure(...args);
  const render: Host['render'] = (...args) => connections.render(...args);
  const setOpen: Host['setOpen'] = (...args) => connections.setOpen(...args);
  const hidePopover: Host['hidePopover'] = (...args) => connections.hidePopover(...args);
  const hideSelectionBar: Host['hideSelectionBar'] = (...args) => connections.hideSelectionBar(...args);
  const hideMarkPeek: Host['hideMarkPeek'] = (...args) => connections.hideMarkPeek(...args);
  const pushToast: Host['pushToast'] = (...args) => connections.pushToast(...args);
  const fillOutcomes: Host['fillOutcomes'] = (...args) => connections.fillOutcomes(...args);
  const syncMarks: Host['syncMarks'] = (...args) => connections.syncMarks(...args);
  const outcomeTargetVersion: Host['outcomeTargetVersion'] = (...args) => connections.outcomeTargetVersion(...args);
  const closeOriginCompare: Host['closeOriginCompare'] = (...args) => connections.closeOriginCompare(...args);
  const renderPanelBody: Host['renderPanelBody'] = (...args) => connections.renderPanelBody(...args);
  const isNarrow: Host['isNarrow'] = (...args) => connections.isNarrow(...args);
  const outcomeOf: Host['outcomeOf'] = (...args) => connections.outcomeOf(...args);
  const appendQuoteStory: Host['appendQuoteStory'] = (...args) => connections.appendQuoteStory(...args);
  const topLevel: Host['topLevel'] = (...args) => connections.topLevel(...args);
  const state: Pick<State, "versions" | "moreVersions" | "compare" | "slug" | "view" | "outcomesFor" | "outcomes" | "features" | "comments"> = {
    versions: null,
    moreVersions: false,
    compare: null,
    get slug() { return connections.state.slug; }, set slug(value: State["slug"]) { connections.state.slug = value; },
    get view() { return connections.state.view; }, set view(value: State["view"]) { connections.state.view = value; },
    get outcomesFor() { return connections.state.outcomesFor; }, set outcomesFor(value: State["outcomesFor"]) { connections.state.outcomesFor = value; },
    get outcomes() { return connections.state.outcomes; }, set outcomes(value: State["outcomes"]) { connections.state.outcomes = value; },
    get features() { return connections.state.features; }, set features(value: State["features"]) { connections.state.features = value; },
    get comments() { return connections.state.comments; }, set comments(value: State["comments"]) { connections.state.comments = value; }
  };
  let compareBar: HTMLElement | null = null;
  let loadedVersion: string | null = null;


  // ---------------------------------------------------------------------------
  // 版の履歴と、ページの上への赤入れ
  // ---------------------------------------------------------------------------

  const SHA = /^[0-9a-f]{7,40}$/i;


  function asSha(value: string | null): string | null {
    return value !== null && SHA.test(value) ? value : null;
  }


  function urlParams(): URLSearchParams {
    return new URL(window.location.href).searchParams;
  }


  /**
   * 比べている状態を写した URL を作る。
   *
   * **URL が正本**で、画面はそれに従う。ここで作った URL をそのまま人に渡せば、
   * 受け取った人にも同じ 2 版が同じ形で開く。
   */
  function compareUrl(from: string | null, version: string | null): string {
    const params = urlParams();
    if (version === null) params.delete("v");
    else params.set("v", version);
    if (from === null) params.delete("from");
    else params.set("from", from);

    const query = params.toString();
    return `${window.location.pathname}${query.length > 0 ? `?${query}` : ""}${window.location.hash}`;
  }


  /**
   * 別の版の本文へ移る（読み込み直す）。読んでいた段落を控えて、移った先で同じ段落から見せる（src/widget/reading/position.ts）。
   * URL の印（見出しの #・コメントの #c=）は持っていかない——移った先でブラウザと道具箱がそこへ飛び、読んでいた所を失う。
   */
  function moveTo(from: string | null, version: string | null): void {
    carryPlace();
    const url = new URL(compareUrl(from, version), window.location.href);
    url.hash = "";
    window.location.href = url.href;
  }


  function isComparing(): boolean {
    return state.compare !== null;
  }


  /** 版の指定は前方一致でも受ける（短い sha を手で打たれても迷子にしない）。 */
  function findVersion(versions: readonly PageVersion[], sha: string): PageVersion | null {
    const lower = sha.toLowerCase();
    return (
      versions.find((version) => version.sha.toLowerCase() === lower) ??
      versions.find((version) => version.sha.toLowerCase().startsWith(lower)) ??
      null
    );
  }


  async function ensureVersions(): Promise<PageVersion[] | null> {
    if (state.versions !== null) return state.versions;
    const result = await loadVersions(state.slug);
    if (lifetime.disposed) return null;
    if (!result.ok) {
      handleFailure(result);
      return null;
    }
    state.versions = result.value.versions;
    state.moreVersions = result.value.more;
    render();
    return result.value.versions;
  }


  /** いま画面に出ている本文が、その版のものか。 */
  function bodyShows(version: PageVersion): boolean {
    if (loadedVersion !== null) return version.sha.startsWith(loadedVersion);
    const versions = state.versions;
    return versions !== null && versions.length > 0 && versions[0].sha === version.sha;
  }


  async function openHistory(): Promise<void> {
    state.view = "versions";
    setOpen(true);
    await ensureVersions();
    if (lifetime.disposed) return;
  }


  /**
   * 2 つの版を見比べ始める。
   *
   * 新しいほうが**いま出ている本文と同じ**なら、読み込み直さずに印だけ足す。
   * 違うなら ?v= へ行き先を渡して読み込み直す。本文と画像を当時の姿で出すのは
   * 既存の道（?v= と @v/<sha>/）の役目で、ここでは作り足さない。
   */
  async function startCompare(from: PageVersion, to: PageVersion, push: boolean): Promise<void> {
    if (!bodyShows(to)) {
      moveTo(from.sha, to.sha);
      return;
    }
    if (push) window.history.pushState(null, "", compareUrl(from.sha, loadedVersion));
    await applyCompare(from, to);
    if (lifetime.disposed) return;
  }


  async function applyCompare(from: PageVersion, to: PageVersion): Promise<void> {
    // 比べている間はコメントの印を出さない。同じ文字を 2 つの仕組みが奪い合うと
    // 位置がずれるうえ、いま見えているのは過去の版の文章で、引用の指す先とは別物
    // 印を外す・過去の版の帯をしまう・赤入れを差し込むたびに本文の高さが変わる。読んでいる段落は動かさない
    keepInPlace(spotHere(), () => {
      clearHighlights();
      setVersionBannerHidden(true);
    });
    hidePopover();
    hideSelectionBar();
    hideMarkPeek();

    state.compare = { kind: "history", from, to, diff: null, placed: new Set<number>(), activeIndex: 0 };
    // 帯は先に出す。A → B は分かっているので、数だけあとから埋める
    render();

    const requested = state.compare;
    const result = await loadRedline(state.slug, from.sha, to.sha);
    if (lifetime.disposed) return;
    const current = state.compare;
    if (current !== requested) return;
    if (current === null || current.from.sha !== from.sha || current.to.sha !== to.sha) return;

    if (!result.ok) {
      // 帯は畳んで比較を抜ける。本文はいま見えているものから動かさない
      abandonCompare();
      if (result.status === 401) {
        handleFailure(result);
        return;
      }
      pushToast(t("toolbox.history.diffFailed"), "failure", () => void startCompare(from, to, false));
      return;
    }

    current.diff = result.value;
    current.placed = keepInPlace(spotHere(), () => {
      const placed = applyRedline(result.value.changes);
      markAddedImages(result.value.images.added);
      return placed;
    });
    await fillOutcomes(to.sha);
    if (lifetime.disposed) return;
    if (state.compare !== current) return;
    // 置いたばかりの印にも、帯のぶんの余白を配る（飛び先が帯の下に隠れないように）
    setRedlineOffset(topInset.total());
    render();
    // 縦線は測って置くので、板の開け閉めで本文の幅が決まったあとに引く
    drawChangeBars();
    watchChanges();
  }


  /**
   * 赤入れを外して、コメントの印を戻す。URL には触らない。
   * URL をどうするかは呼ぶ側（終える／畳む／戻る）で違うので、そちらの役目にする。
   */
  function clearCompare(): void {
    state.compare = null;
    stopWatchingChanges();
    keepInPlace(spotHere(), () => {
      clearRedline();
      setVersionBannerHidden(false);
      // 外したので、コメントの印を戻す（本文が最新へ戻っているので必ず張り直す）
      syncMarks(true);
    });
    if (state.view === "changes") state.view = "versions";
    const latest = outcomeTargetVersion();
    if (state.outcomesFor !== latest) {
      state.outcomes = new Map();
      state.outcomesFor = null;
      void fillOutcomes(latest);
    }
  }


  /** 「終える」。比べるのをやめて、最新の見た目へ戻す。 */
  function exitCompare(): void {
    if (state.compare === null) return;
    if (state.compare.kind === "origin") {
      closeOriginCompare();
      if (state.view === "origin") {
        state.view = "comments";
        setOpen(false);
        return;
      }
      render();
      return;
    }
    clearCompare();
    // 過去の版を見ていたなら、本文ごと最新へ帰る（既存の道に任せる）
    if (loadedVersion !== null) {
      moveTo(null, null);
      return;
    }
    window.history.pushState(null, "", compareUrl(null, null));
    render();
  }


  /**
   * 比べられなかったときに帯を畳む。
   * 本文はいま見えているものから動かさず、URL からは比較の指定だけ落とす
   * （戻る先を 1 つ増やしても仕方がないので、履歴には積まない）。
   */
  function abandonCompare(): void {
    if (state.compare === null) return;
    clearCompare();
    window.history.replaceState(null, "", compareUrl(null, loadedVersion));
    render();
  }


  /**
   * URL を読んで、比べている状態をそこに合わせる。
   * 戻る・進むで呼ばれるので、画面の側が勝手に決めることはしない。
   */
  async function syncFromUrl(): Promise<void> {
    const from = asSha(urlParams().get("from"));
    if (from === null) {
      if (isComparing() && state.compare?.kind !== "origin") {
        clearCompare();
        render();
      }
      return;
    }
    // 履歴を引く鍵が置かれていなければ、URL の指定は無かったことにする
    if (!state.features.history) return;

    const versions = await ensureVersions();
    if (lifetime.disposed) return;
    if (versions === null || asSha(urlParams().get("from")) !== from) return;

    const before = findVersion(versions, from);
    const after =
      loadedVersion === null ? (versions[0] ?? null) : findVersion(versions, loadedVersion);
    if (before === null || after === null || before.sha === after.sha) {
      if (isComparing()) {
        clearCompare();
        render();
      }
      return;
    }

    const current = state.compare;
    if (current !== null && current.from.sha === before.sha && current.to.sha === after.sha) return;
    await applyCompare(before, after);
    if (lifetime.disposed) return;
  }


  function onPopState(): void {
    // 本文そのものが別の版になるなら、読み込み直すのが確実
    if (asSha(urlParams().get("v")) !== loadedVersion) {
      carryPlace();
      window.location.reload();
      return;
    }
    void syncFromUrl();
  }


  // --- 変更の間を移動 --------------------------------------------------------

  /** 飛んだ先を濃くしておく長さ。 */
  const CHANGE_FLASH_MS = 600;

  /** 自分で飛んだ直後は、見張りの結果で現在地を上書きしない。 */
  let jumpingUntil = 0;

  let changeWatcher: IntersectionObserver | null = null;


  /** 本文に置けた変更だけを、本文に出てくる順で。 */
  function placedChanges(compare: Compare): RedlineChange[] {
    const diff = compare.diff;
    if (diff === null) return [];
    return diff.changes.filter((change) => compare.placed.has(change.index));
  }


  function setActiveChange(index: number): void {
    const compare = state.compare;
    if (compare === null || compare.diff === null) return;
    compare.activeIndex = index;
    repaintRedline(compare.diff.changes, index);
    renderCompareBar();
    if (state.view === "changes") renderPanelBody();
  }


  /** その変更のところへ寄せる。飛び先が無いものへは飛ばさない。 */
  function gotoChange(index: number): void {
    const compare = state.compare;
    if (compare === null || !compare.placed.has(index)) return;

    setActiveChange(index);
    jumpingUntil = Date.now() + CHANGE_FLASH_MS;
    scrollToChange(index);

    lifetime.timeout(() => {
      const now = state.compare;
      if (now === null || now.diff === null || now.activeIndex !== index) return;
      const change = now.diff.changes.find((item) => item.index === index);
      // 光りは一呼吸で戻す。いまどこにいるかは、帯の数のほうが持っている
      if (change !== undefined) paintChange(change, false);
    }, CHANGE_FLASH_MS);
  }


  function stepChange(step: -1 | 1): void {
    const compare = state.compare;
    if (compare === null) return;
    const order = placedChanges(compare);
    if (order.length === 0) return;

    const at = order.findIndex((change) => change.index === compare.activeIndex);
    if (at < 0) {
      gotoChange(order[step > 0 ? 0 : order.length - 1].index);
      return;
    }
    const next = Math.min(order.length - 1, Math.max(0, at + step));
    gotoChange(order[next].index);
  }


  function stopWatchingChanges(): void {
    changeWatcher?.disconnect();
    changeWatcher = null;
  }


  /**
   * スクロールでも「2 / 5」が追いつくようにする。
   * 画面に入っている変更のうち、いちばん上のものを現在地とみなす。
   */
  function watchChanges(): void {
    stopWatchingChanges();
    const compare = state.compare;
    if (compare === null || compare.diff === null) return;

    const inView = new Set<HTMLElement>();
    const watcher = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!(entry.target instanceof HTMLElement)) continue;
          if (entry.isIntersecting) inView.add(entry.target);
          else inView.delete(entry.target);
        }
        if (Date.now() < jumpingUntil) return;

        let best: { index: number; top: number } | null = null;
        for (const node of inView) {
          const value = Number(node.dataset.surpriseRedline);
          if (!Number.isFinite(value)) continue;
          const top = node.getBoundingClientRect().top;
          if (best === null || top < best.top) best = { index: value, top };
        }
        if (best === null || best.index === compare.activeIndex) return;
        setActiveChange(best.index);
      },
      // 帯の裏に隠れているものは「見えている」に数えない
      { rootMargin: `-${Math.round(compareBarHeight())}px 0px 0px 0px` },
    );

    for (const change of placedChanges(compare)) {
      for (const node of changeElements(change.index)) watcher.observe(node);
    }
    changeWatcher = watcher;
  }


  // --- 帯 --------------------------------------------------------------------

  function compareBarHeight(): number {
    if (compareBar === null || compareBar.hidden) return 0;
    return compareBar.getBoundingClientRect().height;
  }


  /**
   * 帯のぶんだけ本文をよける。
   *
   * 高さは決め打ちしない（狭い画面では 2 段になるうえ、文字の大きさでも変わる）。
   * 組み立てたあとに測って届ける。本文の余白・飛び先の余白へ配るのは、上端の帯の持ち主（top-inset.ts）。
   */
  function applyCompareOffset(): void {
    const height = Math.round(compareBarHeight());
    if (connections.root !== null && connections.root.host instanceof HTMLElement) {
      connections.root.host.style.setProperty("--compare-bar", `${height}px`);
    }
    topInset.set("compare", height);
  }


  /**
   * 版を指す 1 つの押しどころ。日付と書き手を別々の字にして置く。
   *
   * 幅が足りなくなったとき、**先に削るのは日付のほう**。
   * 「8月7日 さ…」では誰の版か分からないが、「8月… さとう」なら誰の版かは残る。
   * どちらの版かは矢印の左右で分かるので、日付が縮んでも用は足りる。
   */
  function versionLabel(version: PageVersion): HTMLElement {
    const box = el("span", "compare-label");
    box.appendChild(el("span", "compare-when", monthDay(version.committedAt, isNarrow())));
    box.appendChild(el("span", "compare-who", localizeStored(version.authorName, t)));
    return box;
  }


  /** 帯に出す件数。数えている途中・体裁だけ・置けなかったぶん、まで 1 行で言う。 */
  function countLabel(compare: Compare): string {
    const diff = compare.diff;
    if (diff?.coarse) return t("toolbox.history.coarse");
    if (compare.kind === "origin") {
      if (connections.originDiffError) return t("toolbox.history.diffFailed");
      if (diff === null) return t("toolbox.history.counting");
      if (diff.identical) return t("toolbox.history.originSame");
      return t("toolbox.history.changes", { count: diff.changes.length });
    }
    if (diff === null) return t("toolbox.history.counting");
    if (diff.identical) {
      const images = diff.images.added.length + diff.images.removed.length;
      return images > 0
        ? t("toolbox.history.noTextChangeImages")
        : t("toolbox.history.noTextChange");
    }
    const total = diff.changes.length;
    // 「置く先がそもそも無いもの（ページの名前）」と「探したが見つからなかったもの」は
    // 別の話。まとめて「特定できませんでした」と言うと、直っているものまで壊れて見える
    const homeless = diff.changes.filter((change) => change.place === "none").length;
    const lost = total - compare.placed.size - homeless;

    if (lost > 0) return t("toolbox.history.changesLost", { count: total, lost });
    if (homeless > 0) return t("toolbox.history.changesHomeless", { count: total, homeless });
    return t("toolbox.history.changes", { count: total });
  }


  function positionLabel(compare: Compare): string {
    const total = placedChanges(compare).length;
    if (total === 0) return "–";
    const at = placedChanges(compare).findIndex((change) => change.index === compare.activeIndex);
    return `${at < 0 ? "–" : at + 1} / ${total}`;
  }


  function versionButton(version: PageVersion): HTMLButtonElement {
    const button = el("button", "compare-version");
    button.type = "button";
    button.appendChild(versionLabel(version));
    if (state.compare?.kind === "origin") {
      button.disabled = true;
      button.title = localizeStored(version.authorName, t);
      return button;
    }
    button.title = t("toolbox.history.versionButton", { when: dayTime(version.committedAt), sha: version.shortSha });
    button.addEventListener("click", () => {
      state.view = "versions";
      setOpen(true);
      void ensureVersions();
    }, { signal: lifetime.signal });
    return button;
  }


  function navButton(label: string, paths: readonly string[], onClick: () => void): HTMLButtonElement {
    const button = el("button", "icon-button");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.appendChild(icon(paths, ICON_SIZE.small));
    button.addEventListener("click", onClick, { signal: lifetime.signal });
    return button;
  }


  function renderCompareBar(): void {
    if (compareBar === null) return;
    const compare = state.compare;
    compareBar.hidden = compare === null;
    compareBar.replaceChildren();
    if (compare === null) return;

    const pair = el("div", "compare-pair");
    pair.appendChild(versionButton(compare.from));
    pair.appendChild(el("span", "compare-arrow", "→"));
    pair.appendChild(versionButton(compare.to));
    compareBar.appendChild(pair);

    // 凡例。形そのものを見せるので、説明の文は要らない
    // （下線の引かれた「足した」と、線で消された「消した」を並べるだけ）
    const legend = el("div", "compare-legend");
    legend.appendChild(el("span", "legend-add", t("toolbox.history.added")));
    legend.appendChild(el("span", "legend-del", t("toolbox.history.removed")));
    // 印が 1 つも出ていないなら、読み方の説明も要らない
    legend.hidden = compare.diff === null || compare.placed.size === 0;
    compareBar.appendChild(legend);

    const count = el("button", "compare-count");
    count.type = "button";
    count.textContent = countLabel(compare);
    count.disabled = compare.diff === null && !connections.originDiffError;
    count.addEventListener("click", () => {
      state.view = compare.kind === "origin" ? "origin" : "changes";
      setOpen(true);
    }, { signal: lifetime.signal });
    compareBar.appendChild(count);

    if (compare.kind !== "origin") {
      const total = placedChanges(compare).length;
      const nav = el("div", "compare-nav");
      const previous = navButton(t("toolbox.history.previousChange"), ICON_CHEVRON_UP, () => stepChange(-1));
      const next = navButton(t("toolbox.history.nextChange"), ICON_CHEVRON_DOWN, () => stepChange(1));
      previous.disabled = total === 0;
      next.disabled = total === 0;
      nav.appendChild(previous);
      nav.appendChild(el("span", "compare-position", positionLabel(compare)));
      nav.appendChild(next);
      compareBar.appendChild(nav);
    }

    const end = el("button", "compare-end");
    end.type = "button";
    end.textContent = t("toolbox.history.end");
    end.title = compare.kind === "origin" ? t("toolbox.history.endOrigin") : t("toolbox.history.endCompare");
    end.addEventListener("click", () => exitCompare(), { signal: lifetime.signal });
    compareBar.appendChild(end);
  }


  // --- 版の一覧 --------------------------------------------------------------

  /**
   * 版 1 つぶん。
   *
   * 主役は書き手・日時・変更の件数。コミットの説明文は出さない
   * （`feat:` のような書き分けが並ぶと、読む人の用事がそこに埋もれる）。
   */
  /**
   * 最下段の行に添える一言。
   *
   * 一覧に出す数には上限がある。上限に達しているときの最下段は「最初の版」ではなく
   * 「ここまでしか出していない版」なので、言い切らない。どちらの場合も
   * 比べる相手（1 つ前）を持っていないので押せないことは同じ。
   */
  function lastRowNote(): string {
    return state.moreVersions
      ? t("toolbox.history.moreVersions")
      : t("toolbox.history.firstVersion");
  }


  function versionRow(
    version: PageVersion,
    index: number,
    all: readonly PageVersion[],
  ): HTMLElement {
    const previous = all[index + 1];
    const last = previous === undefined;

    const row = el("button", index === 0 ? "version is-current" : "version");
    row.type = "button";
    row.disabled = last;
    if (!last) row.title = t("toolbox.history.compareWithPrevious");

    row.appendChild(el("div", "version-who", localizeStored(version.authorName, t)));
    row.appendChild(el("div", "version-when", dayTime(version.committedAt)));
    row.appendChild(
      el(
        "div",
        "version-count",
        last
          ? ""
          : version.changeCount === null
            ? t("toolbox.history.notCounted")
            : t("toolbox.history.changes", { count: version.changeCount }),
      ),
    );
    // 人に見せる呼び方は何版目か（現在地の行と同じ）。目印の 7 桁は指を乗せたときに出す
    if (version.number === null) row.appendChild(el("div", "version-sha", version.shortSha));
    else {
      const number = el("div", "version-number", t("toolbox.history.versionNumber", { number: version.number }));
      number.title = version.shortSha;
      row.appendChild(number);
    }
    if (last) row.appendChild(el("p", "note", lastRowNote()));

    if (previous !== undefined) {
      row.addEventListener("click", () => void startCompare(previous, version, true), { signal: lifetime.signal });
    }
    return row;
  }


  function versionsView(): HTMLElement {
    const box = el("div");
    const versions = state.versions;

    if (versions === null) {
      box.appendChild(el("div", "empty", t("toolbox.common.loading")));
      return box;
    }
    if (versions.length === 0) {
      const empty = el("div", "empty");
      empty.appendChild(el("div", "empty-title", t("toolbox.history.noVersions")));
      empty.appendChild(
        el("div", "empty-hint", t("toolbox.history.noVersionsHint")),
      );
      box.appendChild(empty);
      return box;
    }

    if (document.body.hasAttribute("data-deck")) { const review = el("button", "quiet", t("toolbox.history.reviewChanges")); review.onclick = () => { const root = connections.root; if (root) void import("../reading/page-agent-review").then((agent) => agent.openAgentReview(root, state.slug)); }; box.append(review); }
    versions.forEach((version, index) => box.appendChild(versionRow(version, index, versions)));
    return box;
  }


  // --- 変更の一覧 ------------------------------------------------------------

  const CHANGE_KINDS: Record<RedlineChange["kind"], string> = {
    add: t("toolbox.history.added"),
    del: t("toolbox.history.removed"),
    title: t("toolbox.history.pageTitle"),
  };


  function changeRow(change: RedlineChange, compare: Compare): HTMLElement {
    const placed = compare.placed.has(change.index);
    const row = el("button", change.index === compare.activeIndex ? "change is-active" : "change");
    row.type = "button";
    row.disabled = !placed;

    row.appendChild(el("span", "change-number", String(change.index)));
    row.appendChild(el("span", "change-kind", CHANGE_KINDS[change.kind]));

    const main = el("div", "change-main");
    const look =
      change.kind === "add" ? "change-text is-add" : change.kind === "del" ? "change-text is-del" : "change-text";
    main.appendChild(el("div", look, normalizeText(change.text)));
    if (!placed) {
      // 押しても何も起きないボタンを、黙って並べない
      main.appendChild(
        el(
          "p",
          "note",
          change.kind === "title"
            ? t("toolbox.history.titleNoTarget")
            : t("toolbox.history.notPlaced"),
        ),
      );
    }
    row.appendChild(main);

    if (placed) row.addEventListener("click", () => gotoChange(change.index), { signal: lifetime.signal });
    return row;
  }


  /**
   * 消えた画像の行。
   *
   * 新しい版に居場所が無いので、押しても飛ぶ先がない。飛べないことは行に書いておく
   * （押しても何も起きないボタンを、黙って並べない）。
   */
  function removedImageRow(path: string): HTMLElement {
    const row = el("button", "change");
    row.type = "button";
    row.disabled = true;
    row.appendChild(el("span", "change-kind", t("toolbox.history.removed")));

    const main = el("div", "change-main");
    main.appendChild(el("div", "change-text is-del", t("toolbox.history.imageRemoved", { path })));
    main.appendChild(el("p", "note", t("toolbox.history.imageNoTarget")));
    row.appendChild(main);
    return row;
  }


  function relatedCommentRow(comment: PageComment, compare: Compare): HTMLElement {
    const outcome = outcomeOf(comment);
    const hit =
      compare.diff === null || outcome === null
        ? undefined
        : compare.diff.changes.find(
          (change) => compare.placed.has(change.index) && changeTouchesOutcome(change, outcome),
        );

    const row = el("button", "related");
    row.type = "button";
    if (hit === undefined) {
      row.disabled = true;
    } else {
      row.title = t("toolbox.history.gotoComment");
      row.addEventListener("click", () => gotoChange(hit.index), { signal: lifetime.signal });
    }

    // 行そのものが赤入れへ飛ぶので、入れ子の「直しを見る」は出さない
    appendQuoteStory(row, comment, "related-quote", "related-body", false);
    const story = outcome !== null && isVisibleOutcome(outcome.state);
    if (!story) {
      row.appendChild(el("p", "note", comment.author.name));
    }
    return row;
  }


  function appendRelatedComments(box: HTMLElement, compare: Compare): void {
    const relatedIds = new Set(
      commentsOnVersion(state.comments, compare.from.sha).map((comment) => comment.id),
    );
    const related = topLevel().filter((comment) => relatedIds.has(comment.id));
    if (related.length === 0) return;

    const head = el("h3", "related-head", t("toolbox.history.relatedComments"));
    box.appendChild(head);
    for (const comment of related) box.appendChild(relatedCommentRow(comment, compare));
  }


  function changesView(): HTMLElement {
    const box = el("div");
    const compare = state.compare;

    if (compare === null) {
      box.appendChild(el("div", "empty", t("toolbox.history.pickVersion")));
      return box;
    }

    const head = el("div", "change-head");
    head.appendChild(el("div", "who-name", localizeStored(compare.to.message, t)));
    head.appendChild(
      el("div", "who-time", `${localizeStored(compare.to.authorName, t)} ・ ${dayTime(compare.to.committedAt)}`),
    );
    box.appendChild(head);

    const diff = compare.diff;
    if (diff === null) {
      box.appendChild(el("div", "empty", t("toolbox.common.loading")));
      return box;
    }

    if (diff.identical && diff.images.removed.length === 0) {
      box.appendChild(el("div", "empty", t("toolbox.history.noTextChange")));
      appendRelatedComments(box, compare);
      return box;
    }

    if (diff.coarse) {
      box.appendChild(el("p", "note", t("toolbox.history.coarseNote")));
    }
    for (const change of diff.changes) box.appendChild(changeRow(change, compare));
    for (const path of diff.images.removed) box.appendChild(removedImageRow(path));
    appendRelatedComments(box, compare);
    return box;
  }
  return {
    dispose() { lifetime.dispose(); stopWatchingChanges(); },
    asSha,
    urlParams,
    isComparing,
    findVersion,
    ensureVersions,
    openHistory,
    startCompare,
    clearCompare,
    exitCompare,
    syncFromUrl,
    onPopState,
    gotoChange,
    watchChanges,
    applyCompareOffset,
    renderCompareBar,
    versionsView,
    get CHANGE_KINDS() { return CHANGE_KINDS; },
    changesView,
    get compareBar() { return compareBar; },
    set compareBar(value: HTMLElement | null) { compareBar = value; },
    get loadedVersion() { return loadedVersion; },
    set loadedVersion(value: string | null) { loadedVersion = value; },
    state
  };
}
