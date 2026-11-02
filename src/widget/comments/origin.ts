import { createWidgetLifetime } from "../shared/widget-lifetime";
import { t } from "../shared/i18n";
import {
  type PageVersion,
  type RedlineChange
} from "../../lib/comments/types";
import {
  loadComments,
  loadOriginDiff,
  loadOriginFreshness,
  loadOriginRefreshStatus,
  originShouldOffer,
  startOriginRefresh
} from "../shared/api";
import type { State, StoredOriginJob } from './types';
import { ICON_SIZE } from "../shared/tokens";
import {
  ICON_CLOSE,
  ICON_ORIGIN,
  el,
  icon,
  readSession,
  writeSession
} from "../shared/util";

/** Owns origin behavior; receives only its required page/editor connections. */
type Host = {
  loadedVersion: string | null;
  showError: (message: string) => void;
  render: () => void;
  showNotice: (message: string) => void;
  clearCompare: () => void;
  copyText: (text: string, done: string, failure?: string) => Promise<boolean>;
  pageUrl: () => string;
  isComparing: () => boolean;
  exitCompare: () => void;
  setOpen: (open: boolean) => void;
  handleFailure: (result: { message: string; status: number; }) => void;
  CHANGE_KINDS: Record<"del" | "title" | "add", string>;
  actionButton: (label: string, paths: readonly string[], onClick: () => void, variant?: string, spokenLabel?: string) => HTMLButtonElement;
  bar: HTMLElement | null;
  root: ShadowRoot | null;
  isNarrow: () => boolean;
  tokenPx: (name: string) => number;
  state: Pick<State, "features" | "visibility" | "slug" | "currentVersion" | "compare" | "view" | "busy">;
};

export function createCommentOrigin(connections: Host) {
  const lifetime = createWidgetLifetime();
  const showError: Host['showError'] = (...args) => connections.showError(...args);
  const render: Host['render'] = (...args) => connections.render(...args);
  const showNotice: Host['showNotice'] = (...args) => connections.showNotice(...args);
  const clearCompare: Host['clearCompare'] = (...args) => connections.clearCompare(...args);
  const copyText: Host['copyText'] = (...args) => connections.copyText(...args);
  const pageUrl: Host['pageUrl'] = (...args) => connections.pageUrl(...args);
  const isComparing: Host['isComparing'] = (...args) => connections.isComparing(...args);
  const exitCompare: Host['exitCompare'] = (...args) => connections.exitCompare(...args);
  const setOpen: Host['setOpen'] = (...args) => connections.setOpen(...args);
  const handleFailure: Host['handleFailure'] = (...args) => connections.handleFailure(...args);
  const actionButton: Host['actionButton'] = (...args) => connections.actionButton(...args);
  const isNarrow: Host['isNarrow'] = (...args) => connections.isNarrow(...args);
  const tokenPx: Host['tokenPx'] = (...args) => connections.tokenPx(...args);
  const state: Pick<State, "origin" | "originJob" | "features" | "visibility" | "slug" | "currentVersion" | "compare" | "view" | "busy"> = {
    origin: null,
    originJob: null,
    get features() { return connections.state.features; }, set features(value: State["features"]) { connections.state.features = value; },
    get visibility() { return connections.state.visibility; }, set visibility(value: State["visibility"]) { connections.state.visibility = value; },
    get slug() { return connections.state.slug; }, set slug(value: State["slug"]) { connections.state.slug = value; },
    get currentVersion() { return connections.state.currentVersion; }, set currentVersion(value: State["currentVersion"]) { connections.state.currentVersion = value; },
    get compare() { return connections.state.compare; }, set compare(value: State["compare"]) { connections.state.compare = value; },
    get view() { return connections.state.view; }, set view(value: State["view"]) { connections.state.view = value; },
    get busy() { return connections.state.busy; }, set busy(value: State["busy"]) { connections.state.busy = value; }
  };
  const STORAGE_ORIGIN_REFRESH = "surprise-pages:origin-refresh";
  const STORAGE_ORIGIN_HINT = "surprise-pages:origin-hint";
  let originHint: HTMLElement | null = null;
  let originPollTimer = 0;
  let originProbeStarted = false;
  let originDiffSeq = 0;
  let originDiffError = false;
  let originHintTimer = 0;
  const ORIGIN_HINT_LIFE_MS = 4500;


  /**
   * 配信が札に書いた git 出典。本文の末尾行は見ない（照合が外す印なので、
   * 画面がそこへ依存すると、印の付け方を変えた瞬間に取り込みが消える）。
   */
  function sourceFromTag(): { repo: string; path: string; commit: string } | null {
    const tag = document.querySelector('script[src^="/comments-widget.js"][data-page]');
    if (tag === null) return null;
    const repo = tag.getAttribute("data-source-repo");
    const path = tag.getAttribute("data-source-path");
    const commit = tag.getAttribute("data-source-commit");
    if (repo === null || path === null || commit === null) return null;
    if (repo.length === 0 || path.length === 0 || commit.length === 0) return null;
    return { repo, path, commit };
  }


  /**
   * 原本を取り込む入口を出してよいか。
   *
   * 門は既存の「このページを直す」と同じ（features.edit・最新の版）。
   * 加えて git 出典があり、門なし公開の入口（/p）では出さない。
   */
  function originEntryAllowed(): boolean {
    return (
      state.features.edit &&
      connections.loadedVersion === null &&
      state.visibility === "internal" &&
      sourceFromTag() !== null
    );
  }


  function readStoredOriginJob(): StoredOriginJob | null {
    const raw = readSession(STORAGE_ORIGIN_REFRESH);
    if (raw === null) return null;
    try {
      const value: unknown = JSON.parse(raw);
      if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
      const record: Record<string, unknown> = { ...value };
      const slug = typeof record["slug"] === "string" ? record["slug"] : null;
      const agentId = typeof record["agentId"] === "string" ? record["agentId"] : null;
      const url = typeof record["url"] === "string" ? record["url"] : null;
      if (slug === null || agentId === null || url === null) return null;
      const startedVersion = typeof record["startedVersion"] === "string" ? record["startedVersion"] : null;
      return { slug, agentId, url, startedVersion };
    } catch {
      return null;
    }
  }


  function writeStoredOriginJob(job: StoredOriginJob | null): void {
    if (job === null) {
      writeSession(STORAGE_ORIGIN_REFRESH, "");
      return;
    }
    writeSession(STORAGE_ORIGIN_REFRESH, JSON.stringify(job));
  }


  function stopOriginPoll(): void {
    if (originPollTimer !== 0) {
      lifetime.clearInterval(originPollTimer);
      originPollTimer = 0;
    }
  }


  function beginOriginJob(job: {
    agentId: string;
    url: string;
    startedVersion: string | null;
  }): void {
    state.originJob = { status: "running", ...job };
    writeStoredOriginJob({ slug: state.slug, ...job });
    startOriginPoll();
  }


  function finishOriginJob(): void {
    if (state.originJob === null) return;
    state.originJob = { ...state.originJob, status: "done" };
    writeStoredOriginJob(null);
    stopOriginPoll();
  }


  function abandonOriginJob(message: string): void {
    state.originJob = null;
    writeStoredOriginJob(null);
    stopOriginPoll();
    showError(message);
    render();
  }


  function startOriginPoll(): void {
    stopOriginPoll();
    originPollTimer = lifetime.interval(() => void pollOriginJob(), 5000);
    void pollOriginJob();
  }


  async function pollOriginJob(): Promise<void> {
    const job = state.originJob;
    if (job === null || job.status !== "running") {
      stopOriginPoll();
      return;
    }

    const comments = await loadComments(state.slug);
    if (lifetime.disposed || state.originJob !== job) return;
    if (comments.ok) {
      const next = comments.value.currentVersion;
      if (next !== null && job.startedVersion !== null && next !== job.startedVersion) {
        state.currentVersion = next;
        finishOriginJob();
        showNotice(t("toolbox.common.newVersion"));
        render();
        return;
      }
      if (next !== null && job.startedVersion === null) {
        state.currentVersion = next;
      }
    }

    const status = await loadOriginRefreshStatus(state.slug, job.agentId);
    if (lifetime.disposed || state.originJob !== job) return;
    if (!status.ok) return;
    if (status.value.status === "failed") {
      abandonOriginJob(t("toolbox.origin.failed"));
      return;
    }
    if (status.value.status === "finished") {
      const again = await loadComments(state.slug);
      if (lifetime.disposed || state.originJob !== job) return;
      if (again.ok && again.value.currentVersion !== null && again.value.currentVersion !== job.startedVersion) {
        state.currentVersion = again.value.currentVersion;
        finishOriginJob();
        showNotice(t("toolbox.common.newVersion"));
        render();
        return;
      }
      finishOriginJob();
      showNotice(t("toolbox.common.newVersion"));
      render();
    }
  }


  async function probeOriginOnce(): Promise<void> {
    if (originProbeStarted || state.origin !== null) return;
    if (!originEntryAllowed()) {
      state.origin = { stale: false };
      return;
    }
    originProbeStarted = true;

    const stored = readStoredOriginJob();
    if (stored !== null && stored.slug === state.slug) {
      beginOriginJob({
        agentId: stored.agentId,
        url: stored.url,
        startedVersion: stored.startedVersion,
      });
    }

    const result = await loadOriginFreshness(state.slug);
    if (lifetime.disposed) return;
    if (!result.ok) {
      state.origin = { stale: false };
      render();
      return;
    }
    if (originShouldOffer(result.value) && result.value.path !== null) {
      state.origin = {
        stale: true,
        path: result.value.path,
        headDate: result.value.headDate,
        checked: result.value.checked,
        edited: result.value.edited,
      };
    } else {
      state.origin = { stale: false };
      if (state.originJob?.status === "running") {
        finishOriginJob();
        showNotice(t("toolbox.common.newVersion"));
      }
    }
    render();
  }


  function originConfirmCopy(): string {
    const origin = state.origin;
    const path = origin !== null && origin.stale ? origin.path : t("toolbox.origin.sourceWord");
    const day = origin !== null && origin.stale ? origin.headDate : null;
    const main = day === null ? t("toolbox.origin.confirm", { path }) : t("toolbox.origin.confirmDated", { path, day });
    // 文と文の継ぎ目だけを足す（1 文の中で字を継がない）
    return document.head.querySelector("script[data-deck-design]") !== null
      ? `${main} ${t("toolbox.origin.keepAppearance")}` : main;
  }


  /**
   * 保存済みHTMLと原稿の食い違い。比較して採用する変更を選ぶ。
   * 現在の修正を残して更新するため、比べられたときだけ 1 行で告げる
   * （比べられるのは HTML そのものが原本の deck だけ。清書は null で何も言わない）。
   */
  const ORIGIN_EDITED_COPY = t("toolbox.origin.editedCopy");


  function originEditedCopy(): string | null {
    const origin = state.origin;
    if (origin === null || !origin.stale || origin.edited !== true) return null;
    return ORIGIN_EDITED_COPY;
  }


  function originVersion(label: string, sha: string, at: string | null): PageVersion {
    return {
      sha,
      shortSha: sha.length >= 7 ? sha.slice(0, 7) : sha,
      number: null,
      authorName: label,
      committedAt: at ?? "",
      message: "",
      changeCount: null,
    };
  }


  function closeOriginCompare(): void {
    originDiffSeq += 1;
    originDiffError = false;
    if (state.compare !== null && state.compare.kind === "origin") clearCompare();
  }


  function openOriginConfirm(): void {
    if (!originEntryAllowed()) return;
    if (document.body.hasAttribute("data-deck")) {
      void copyText(`${pageUrl()}\nこのスライドを原稿から更新したいです。保存済みの最新版を読み、原稿との差分を比較して、採用する箇所だけ反映してください。現在の本文を原稿で一括上書きしないでください。`, t("toolbox.origin.requestCopied")); return; // i18n-keep: AI へ貼る依頼文（知らせの字は辞書）
    }
    if (state.origin === null || !state.origin.stale) return;
    if (state.originJob !== null) return;
    if (isComparing() && state.compare?.kind !== "origin") exitCompare();
    originDiffSeq += 1;
    originDiffError = false;
    const headDate = state.origin.headDate;
    state.compare = {
      kind: "origin",
      from: originVersion(t("toolbox.origin.cited"), "cited", null),
      to: originVersion(t("toolbox.origin.latest"), "head", headDate),
      diff: null,
      placed: new Set<number>(),
      activeIndex: 0,
    };
    state.view = "origin";
    setOpen(true);
    void fillOriginDiff();
  }


  async function fillOriginDiff(): Promise<void> {
    if (state.compare === null || state.compare.kind !== "origin") return;
    const seq = originDiffSeq;
    const result = await loadOriginDiff(state.slug);
    if (lifetime.disposed) return;
    if (seq !== originDiffSeq) return;
    if (state.compare === null || state.compare.kind !== "origin") return;
    if (!result.ok) {
      if (result.status === 401) {
        handleFailure(result);
        return;
      }
      originDiffError = true;
      render();
      return;
    }
    state.compare.from = originVersion(t("toolbox.origin.cited"), result.value.cited.sha, result.value.cited.at);
    state.compare.to = originVersion(t("toolbox.origin.latest"), result.value.head.sha, result.value.head.at);
    state.compare.diff = result.value.diff;
    originDiffError = false;
    render();
  }


  async function confirmOriginRefresh(): Promise<void> {
    if (state.busy) return;
    state.busy = true;
    render();
    const result = await startOriginRefresh(state.slug);
    if (lifetime.disposed) return;
    state.busy = false;
    if (!result.ok) {
      if (result.status === 409) {
        closeOriginCompare();
        state.origin = { stale: false };
        state.view = "comments";
        setOpen(false);
        showNotice(t("toolbox.origin.alreadyImported"));
        render();
        return;
      }
      handleFailure(result);
      return;
    }
    closeOriginCompare();
    state.view = "comments";
    setOpen(false);
    beginOriginJob({
      agentId: result.value.agentId,
      url: result.value.url,
      startedVersion: state.currentVersion,
    });
    showNotice(t("toolbox.origin.started"));
    render();
  }


  function originChangeRow(change: RedlineChange): HTMLElement {
    const row = el("div", "change");
    row.appendChild(el("span", "change-kind", connections.CHANGE_KINDS[change.kind]));
    const look =
      change.kind === "add" ? "change-text is-add" : change.kind === "del" ? "change-text is-del" : "change-text";
    const main = el("div", "change-main");
    main.appendChild(el("div", look, change.text));
    row.appendChild(main);
    return row;
  }


  function originDiffBlock(): HTMLElement {
    const wrap = el("div", "origin-diff");
    if (originDiffError) {
      wrap.appendChild(el("p", "note", t("toolbox.origin.diffFailed")));
      return wrap;
    }
    const compare = state.compare;
    if (compare === null || compare.kind !== "origin") return wrap;
    if (compare.diff === null) {
      wrap.appendChild(el("p", "note", t("toolbox.origin.diffLoading")));
      return wrap;
    }
    if (compare.diff.identical) {
      wrap.appendChild(el("p", "note", t("toolbox.origin.same")));
      return wrap;
    }
    if (compare.diff.coarse) {
      wrap.appendChild(el("p", "note", t("toolbox.history.coarseNote")));
    }
    for (const change of compare.diff.changes) wrap.appendChild(originChangeRow(change));
    return wrap;
  }


  function originView(): HTMLElement {
    // 余白は共有範囲の器（.access）を借りる。.access-confirm だけでは横が 0 のまま。
    const box = el("div", "access");
    const confirm = el("div", "access-confirm");
    confirm.appendChild(el("p", "access-warning", originConfirmCopy()));
    const edited = originEditedCopy();
    if (edited !== null) confirm.appendChild(el("p", "access-warning", edited));
    confirm.appendChild(originDiffBlock());
    const row = el("div", "access-row");
    const take = actionButton(t("toolbox.origin.take"), ICON_ORIGIN, () => void confirmOriginRefresh(), "is-strong");
    if (state.busy) take.disabled = true;
    row.appendChild(take);
    row.appendChild(
      actionButton(t("toolbox.common.cancel"), ICON_CLOSE, () => {
        if (state.compare?.kind === "origin") {
          exitCompare();
          return;
        }
        state.view = "comments";
        setOpen(false);
      }),
    );
    confirm.appendChild(row);
    box.appendChild(confirm);
    return box;
  }


  function originHintKey(): string {
    return `${STORAGE_ORIGIN_HINT}:${state.slug}`;
  }


  function originHintTold(): boolean {
    return readSession(originHintKey()) === "1";
  }


  function rememberOriginHintTold(): void {
    writeSession(originHintKey(), "1");
  }


  /**
   * バーが見えていて、GitHub で更新があると分かっているときだけ。判定不能は出さない。
   * 取り込む入口は ⋯ の中なので、見るのは「⋯ が出ているか」（入口の条件は moreMenuSections と同じ）。
   */
  function originHintCanShow(): boolean {
    if (originHint === null || connections.bar === null || connections.bar.hidden) return false;
    if (!originEntryAllowed()) return false;
    if (state.origin === null || !state.origin.stale || !state.origin.checked) return false;
    if (state.originJob !== null) return false;
    return connections.bar.querySelector(".bar-more") !== null;
  }


  function hideOriginHint(): void {
    if (originHintTimer !== 0) {
      lifetime.clearTimeout(originHintTimer);
      originHintTimer = 0;
    }
    if (originHint !== null) originHint.hidden = true;
  }


  /**
   * ⋯（取り込む入口が入っている小窓のボタン）の上に置く。
   *
   * 広い画面はボタンの右端に揃える。狭い画面はバー全体の右端に揃える
   * （絵柄が詰まっているので、1 つの真上に載せると隣へはみ出す）。
   */
  function placeOriginHint(): void {
    if (originHint === null || connections.bar === null || connections.root === null) return;
    const host = connections.root.host;
    if (!(host instanceof HTMLElement)) return;
    const hostRect = host.getBoundingClientRect();
    const barRect = connections.bar.getBoundingClientRect();
    const moreBtn = connections.bar.querySelector(".bar-more");
    const anchor =
      !isNarrow() && moreBtn instanceof HTMLElement ? moreBtn.getBoundingClientRect() : barRect;
    originHint.style.bottom = `${Math.round(hostRect.bottom - barRect.top + tokenPx("--space-2"))}px`;
    originHint.style.right = `${Math.round(hostRect.right - anchor.right)}px`;
  }


  function renderOriginHint(): void {
    if (originHint === null) return;
    if (!originHint.hidden) {
      if (!originHintCanShow()) {
        hideOriginHint();
        return;
      }
      placeOriginHint();
      return;
    }
    if (!originHintCanShow() || originHintTold()) return;
    originHint.hidden = false;
    rememberOriginHintTold();
    placeOriginHint();
    originHintTimer = lifetime.timeout(() => hideOriginHint(), ORIGIN_HINT_LIFE_MS);
  }


  function buildOriginHint(): HTMLElement {
    const card = el("div", "origin-hint");
    card.hidden = true;
    const open = el("button", "origin-hint-open");
    open.type = "button";
    open.appendChild(el("span", "origin-hint-text", t("toolbox.origin.hint")));
    open.addEventListener("click", () => {
      hideOriginHint();
      openOriginConfirm();
    }, { signal: lifetime.signal });
    const close = el("button", "icon-button");
    close.type = "button";
    close.title = t("toolbox.common.close");
    close.setAttribute("aria-label", t("toolbox.common.close"));
    close.appendChild(icon(ICON_CLOSE, ICON_SIZE.small));
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      hideOriginHint();
    }, { signal: lifetime.signal });
    card.appendChild(open);
    card.appendChild(close);
    return card;
  }
  return {
    dispose() { lifetime.dispose(); originDiffSeq += 1; },
    originEntryAllowed,
    probeOriginOnce,
    closeOriginCompare,
    openOriginConfirm,
    originView,
    renderOriginHint,
    buildOriginHint,
    get originHint() { return originHint; },
    set originHint(value: HTMLElement | null) { originHint = value; },
    get originDiffError() { return originDiffError; },
    set originDiffError(value: boolean) { originDiffError = value; },
    state
  };
}
