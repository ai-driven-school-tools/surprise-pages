import { createWidgetLifetime } from "../shared/widget-lifetime";
import { t } from "../shared/i18n";
import {
  changeTouchesOutcome,
  isVisibleOutcome,
  versionMarksMatch
} from "../../lib/comments/outcome-rules";
import {
  type CommentAuthor,
  type CommentOutcome,
  type CommentPriority,
  type FixPriority,
  type PageComment,
  type PageVersion
} from "../../lib/comments/types";
import {
  confirmDraftMark,
  styleDraftMark,
  unwrapDraftMarks,
  verticalPosition
} from "./anchor";
import {
  createComment,
  deleteComment,
  loadOutcomes,
  patchComment,
  resolveComments,
  type ApiResult
} from "../shared/api";
import {
  DEFAULT_FILTER,
  DEFAULT_SORT,
  SORT_CHOICES,
  bulkAction,
  bulkLabel,
  matchesFilter as commentMatchesFilter,
  filterFor,
  filterRows,
  isListDefault,
  listSummary,
  listTail,
  sortComments,
  type FilterKey,
  type ListCounts
} from "./comment-list";
import type { Draft, SendRow, State, StoredEditReview, Submission, TextAreaKeys } from './types';
import {
  opensSheetAfterSend
} from "./dock";
import {
  type ToastState
} from "../shared/toast";
import { ICON_SIZE } from "../shared/tokens";
import {
  ICON_CHECK,
  ICON_CLOSE,
  ICON_COPY,
  ICON_EDIT,
  ICON_LINK,
  ICON_REOPEN,
  ICON_REPLY,
  ICON_SEND,
  ICON_THUMBS,
  ICON_TRASH,
  PRIORITY_LOOK,
  el,
  fullTime,
  icon,
  relativeTime
} from "../shared/util";

/** Owns list behavior; receives only its required page/editor connections. */
type Host = {
  draft: Draft | null;
  render: () => void;
  handleFailure: (result: { message: string; status: number; }) => void;
  showNotice: (message: string) => void;
  refresh: () => Promise<boolean>;
  loadedVersion: string | null;
  ensureVersions: () => Promise<PageVersion[] | null>;
  findVersion: (versions: readonly PageVersion[], sha: string) => PageVersion | null;
  pushToast: (text: string, toastState: ToastState, retry?: () => void) => string;
  setOpen: (open: boolean) => void;
  startCompare: (from: PageVersion, to: PageVersion, push: boolean) => Promise<void>;
  gotoChange: (index: number) => void;
  afterChange: <T>(result: ApiResult<T>) => boolean;
  avatarFor: (author: CommentAuthor) => Element;
  actionButton: (label: string, paths: readonly string[], onClick: () => void, variant?: string, spokenLabel?: string) => HTMLButtonElement;
  iconAction: (label: string, paths: readonly string[], onClick: () => void, variant?: string) => HTMLButtonElement;
  prioritySendRow: (onSend: (priority: CommentPriority) => void) => SendRow;
  canSend: (body: string) => boolean;
  priorityPicker: (current: CommentPriority, onPick: (next: FixPriority) => void) => HTMLElement;
  textArea: (value: string, placeholder: string, onInput: (next: string) => void, keys?: TextAreaKeys) => HTMLTextAreaElement;
  selectFromCard: (commentId: string) => void;
  priorityTag: (priority: CommentPriority) => HTMLElement;
  copyText: (text: string, done: string, failure?: string) => Promise<boolean>;
  pageUrl: () => string;
  showError: (message: string) => void;
  hidePopover: () => void;
  hideSelectionBar: () => void;
  closeComposeDock: () => void;
  updateToast: (id: string, toastState: ToastState, text: string, retry?: () => void) => void;
  closeHandlers: Map<string, () => void>;
  isNarrow: () => boolean;
  flashCard: (commentId: string) => void;
  focusCard: (commentId: string) => void;
  draftFocused: boolean;
  openComposeDock: () => void;
  LIST_MENU_MARK: string;
  listMenuOpen: boolean;
  listMenuButton: HTMLButtonElement | null;
  pickButton: HTMLButtonElement | null;
  exportTools: HTMLElement | null;
  listMenuBox: HTMLElement | null;
  listBox: HTMLElement | null;
  applyFocus: () => void;
  dockQuote: HTMLElement | null;
  discardDraft: () => void;
  updateScrollPadding: () => void;
  pickBar: HTMLElement | null;
  state: Pick<State, "viewer" | "busy" | "slug" | "currentVersion" | "compare" | "features" | "view" | "activeId" | "anchored" | "open">;
};

export function createCommentList(connections: Host) {
  const lifetime = createWidgetLifetime();
  const render: Host['render'] = (...args) => connections.render(...args);
  const handleFailure: Host['handleFailure'] = (...args) => connections.handleFailure(...args);
  const showNotice: Host['showNotice'] = (...args) => connections.showNotice(...args);
  const refresh: Host['refresh'] = (...args) => connections.refresh(...args);
  const ensureVersions: Host['ensureVersions'] = (...args) => connections.ensureVersions(...args);
  const findVersion: Host['findVersion'] = (...args) => connections.findVersion(...args);
  const pushToast: Host['pushToast'] = (...args) => connections.pushToast(...args);
  const setOpen: Host['setOpen'] = (...args) => connections.setOpen(...args);
  const startCompare: Host['startCompare'] = (...args) => connections.startCompare(...args);
  const gotoChange: Host['gotoChange'] = (...args) => connections.gotoChange(...args);
  const afterChange: Host['afterChange'] = (...args) => connections.afterChange(...args);
  const avatarFor: Host['avatarFor'] = (...args) => connections.avatarFor(...args);
  const actionButton: Host['actionButton'] = (...args) => connections.actionButton(...args);
  const iconAction: Host['iconAction'] = (...args) => connections.iconAction(...args);
  const prioritySendRow: Host['prioritySendRow'] = (...args) => connections.prioritySendRow(...args);
  const canSend: Host['canSend'] = (...args) => connections.canSend(...args);
  const priorityPicker: Host['priorityPicker'] = (...args) => connections.priorityPicker(...args);
  const textArea: Host['textArea'] = (...args) => connections.textArea(...args);
  const selectFromCard: Host['selectFromCard'] = (...args) => connections.selectFromCard(...args);
  const priorityTag: Host['priorityTag'] = (...args) => connections.priorityTag(...args);
  const copyText: Host['copyText'] = (...args) => connections.copyText(...args);
  const pageUrl: Host['pageUrl'] = (...args) => connections.pageUrl(...args);
  const showError: Host['showError'] = (...args) => connections.showError(...args);
  const hidePopover: Host['hidePopover'] = (...args) => connections.hidePopover(...args);
  const hideSelectionBar: Host['hideSelectionBar'] = (...args) => connections.hideSelectionBar(...args);
  const closeComposeDock: Host['closeComposeDock'] = (...args) => connections.closeComposeDock(...args);
  const updateToast: Host['updateToast'] = (...args) => connections.updateToast(...args);
  const isNarrow: Host['isNarrow'] = (...args) => connections.isNarrow(...args);
  const flashCard: Host['flashCard'] = (...args) => connections.flashCard(...args);
  const focusCard: Host['focusCard'] = (...args) => connections.focusCard(...args);
  const openComposeDock: Host['openComposeDock'] = (...args) => connections.openComposeDock(...args);
  const applyFocus: Host['applyFocus'] = (...args) => connections.applyFocus(...args);
  const discardDraft: Host['discardDraft'] = (...args) => connections.discardDraft(...args);
  const updateScrollPadding: Host['updateScrollPadding'] = (...args) => connections.updateScrollPadding(...args);
  const state: Pick<State, "filter" | "sort" | "picked" | "editor" | "confirmDeleteId" | "review" | "outcomes" | "outcomesFor" | "comments" | "expanded" | "viewer" | "busy" | "slug" | "currentVersion" | "compare" | "features" | "view" | "activeId" | "anchored" | "open"> = {
    filter: DEFAULT_FILTER,
    sort: DEFAULT_SORT,
    picked: null,
    editor: null,
    confirmDeleteId: null,
    review: null,
    outcomes: new Map(),
    outcomesFor: null,
    comments: [],
    expanded: new Set<string>(),
    get viewer() { return connections.state.viewer; }, set viewer(value: State["viewer"]) { connections.state.viewer = value; },
    get busy() { return connections.state.busy; }, set busy(value: State["busy"]) { connections.state.busy = value; },
    get slug() { return connections.state.slug; }, set slug(value: State["slug"]) { connections.state.slug = value; },
    get currentVersion() { return connections.state.currentVersion; }, set currentVersion(value: State["currentVersion"]) { connections.state.currentVersion = value; },
    get compare() { return connections.state.compare; }, set compare(value: State["compare"]) { connections.state.compare = value; },
    get features() { return connections.state.features; }, set features(value: State["features"]) { connections.state.features = value; },
    get view() { return connections.state.view; }, set view(value: State["view"]) { connections.state.view = value; },
    get activeId() { return connections.state.activeId; }, set activeId(value: State["activeId"]) { connections.state.activeId = value; },
    get anchored() { return connections.state.anchored; }, set anchored(value: State["anchored"]) { connections.state.anchored = value; },
    get open() { return connections.state.open; }, set open(value: State["open"]) { connections.state.open = value; }
  };
  const STORAGE_EDIT_REVIEW = "surprise-pages:comments:edit-review";
  const EDIT_REVIEW_TTL_MS = 10 * 60 * 1000;


  // ---------------------------------------------------------------------------
  // 数え方・並べ方
  // ---------------------------------------------------------------------------

  function topLevel(): PageComment[] {
    return state.comments.filter((comment) => comment.parentId === null);
  }


  function repliesOf(parentId: string): PageComment[] {
    return state.comments
      .filter((comment) => comment.parentId === parentId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }


  /**
   * 引用の場所の文が、あとの版で変わった／無くなったコメントの目印。
   *
   * 版と版を突き合わせた結果（state.outcomes）から作る。まだ届いていなければ空で、
   * そのときは「本文が変わった」で絞れる状態にもしない（changedKnown）。
   */
  function changedIds(): Set<string> {
    const ids = new Set<string>();
    for (const [id, outcome] of state.outcomes) {
      if (isVisibleOutcome(outcome.state)) ids.add(id);
    }
    return ids;
  }


  /** 突き合わせが済んでいるか。件数を出してよいかの判断に使う。 */
  function changedKnown(): boolean {
    return state.outcomesFor !== null;
  }


  function matchesFilter(comment: PageComment): boolean {
    return commentMatchesFilter(comment, state.filter, changedIds());
  }


  /** 絞り込みごとの件数（親コメントだけ）。メニューの数字と末尾の扉が同じものを読む。 */
  function listCounts(): ListCounts {
    const tops = topLevel();
    const changed = changedIds();
    return {
      all: tops.length,
      open: tops.filter((comment) => comment.resolvedAt === null).length,
      changed: tops.filter((comment) => commentMatchesFilter(comment, "changed", changed)).length,
      resolved: tops.filter((comment) => comment.resolvedAt !== null).length,
    };
  }


  /**
   * いま一覧に出る親コメント。**順序は問わない。**
   *
   * 並び（下の sortedForList）と分けてあるのは、**本文の印を張る相手がここだから**。
   * 並びは印の縦位置を読むので、張る相手を並びから決めると鶏と卵になる。
   * 出る／出ないは位置と関係なく決まるので、その判定だけをここに置く。
   *
   * 「本文が変わった」の材料（changedIds）は 1 回だけ作って全件に使い回す。
   * 1 件ごとに作り直すと、件数が増えるほど二乗で重くなる。
   */
  function inList(): PageComment[] {
    const changed = changedIds();
    return topLevel().filter((comment) => commentMatchesFilter(comment, state.filter, changed));
  }


  /**
   * 一覧に出るものを、選んでいる並べ方で並べる。
   *
   * 本文の縦の位置はここで測って渡す（並びの決まりそのものは comment-list.ts）。
   * 測れるのは印が立っているものだけで、印が立っているのは一覧に出るものだけ
   * ——だから位置を測る相手と並べる相手が、ここで必ず一致する。
   */
  function visibleForList(): PageComment[] {
    const positions = new Map<string, number>();
    const shown = inList();
    for (const comment of shown) {
      const top = verticalPosition(comment.id);
      positions.set(comment.id, top === null ? Number.MAX_SAFE_INTEGER : top);
    }
    return sortComments(shown, state.sort, positions);
  }


  /**
   * 自分が書いたものか。
   *
   * 判定はサーバーがやって真偽値だけ送ってくる。ブラウザ側で見分けようとすると、
   * そのための材料（メールアドレスなど）を全員に配ることになってしまう。
   */
  function isMine(comment: PageComment): boolean {
    return comment.mine;
  }


  /**
   * 名乗っている人だけができること（返信・解決）を出してよいか。
   *
   * 書き込めない名乗り（入場券で読むアプリの中のブラウザ。`features.write` が偽）にも出さない。
   */
  function canAct(): boolean {
    return state.viewer !== null && state.features.write;
  }


  /** 自分のコメントを直す・消す操作を出してよいか。自分のもので、書き込める画面のときだけ。 */
  function canChangeOwn(comment: PageComment): boolean {
    return isMine(comment) && canAct();
  }


  // ---------------------------------------------------------------------------
  // まとめて選ぶ
  // ---------------------------------------------------------------------------

  function picking(): boolean {
    return state.picked !== null;
  }


  /**
   * 口を出してよいか。
   *
   * 解決を触れる人で、いま見えているものが 2 件以上あるときだけ。
   * 1 件しか無いところに「まとめて」を出す意味は無く、押しても 1 件ずつの
   * 操作と同じことしか起きない（押せないボタンを置かない）。
   *
   * 書きかけがあるときも出さない。書いている途中に一覧が選ぶための姿へ変わると、
   * 打った字の行き先が見えなくなる（書き終わってからでも遅くない）。
   */
  function canPick(): boolean {
    return canAct() && connections.draft === null && visibleForList().length >= 2;
  }


  /**
   * 選択モードに入る。**いま見えている全件を選んだ状態で開く。**
   *
   * 絞り込みが「候補づくり」、ここが「最終確認と間引き」。だから絞ってから入れば
   * そのまま押すだけで済み、一部だけ外したい人は外してから押せる。
   * 書きかけ・編集中は畳む（同じカードに 2 つの操作を並べない）。
   */
  function startPicking(): void {
    if (!canPick()) return;
    state.editor = null;
    state.confirmDeleteId = null;
    state.picked = new Set(visibleForList().map((comment) => comment.id));
    render();
  }


  function stopPicking(): void {
    if (!picking()) return;
    state.picked = null;
    render();
  }


  /**
   * 絞り込みを変える。
   *
   * 絞り込みは**選ぶ前に決めるもの**。候補が入れ替わったのに選んだ印が残ると、
   * 見えていないものまで動かすことになる。だから変えたら選ぶのをやめる。
   */
  function setFilter(key: FilterKey): void {
    state.filter = key;
    state.picked = null;
    render();
  }


  function togglePicked(id: string): void {
    const picked = state.picked;
    if (picked === null) return;
    if (picked.has(id)) picked.delete(id);
    else picked.add(id);
    render();
  }


  /** 選ばれているコメント（いま見えているものだけ）。 */
  function pickedComments(): PageComment[] {
    const picked = state.picked;
    if (picked === null) return [];
    return visibleForList().filter((comment) => picked.has(comment.id));
  }


  /**
   * まとめて動かす。1 回の書き込みで済ませる。
   *
   * 1 件ずつの口を何度も叩く形にしないのは、途中で失敗したときに
   * 半分だけ閉じた状態で止まるから。動いた件数はサーバーが数えて返す
   * （すでにその状態のものは触らないので、選んだ数と一致しないことがある）。
   */
  async function applyPicked(): Promise<void> {
    const chosen = pickedComments();
    const action = bulkAction(chosen);
    if (action === null || !canAct()) return;

    state.busy = true;
    render();
    const result = await resolveComments(
      state.slug,
      chosen.map((comment) => comment.id),
      action === "resolve",
    );
    if (lifetime.disposed) return;
    state.busy = false;
    if (!result.ok) {
      handleFailure(result);
      return;
    }

    state.picked = null;
    // 解決にしたものは畳んだ姿にも出さない（開いて見せていた控えを残さない）
    if (action === "resolve") {
      for (const comment of chosen) state.expanded.delete(comment.id);
    }
    const moved = result.value;
    showNotice(
      moved === 0
        ? t("toolbox.list.bulk.nothingMoved")
        : action === "resolve"
          ? t("toolbox.list.bulk.resolved", { count: moved })
          : t("toolbox.list.bulk.reopened", { count: moved }),
    );
    await refresh();
    if (lifetime.disposed) return;
  }


  function outcomeOf(comment: PageComment): CommentOutcome | null {
    return state.outcomes.get(comment.id) ?? null;
  }


  function outcomeTargetVersion(): string | null {
    return connections.loadedVersion ?? state.currentVersion;
  }


  /** 原本確認の SHA はページの版ではないので、成り行きの照合に使わない。 */
  function outcomesToVersion(): string | null {
    const compare = state.compare;
    if (compare !== null && compare.kind !== "origin") return compare.to.sha;
    return outcomeTargetVersion();
  }


  function hasStaleQuotes(comments: readonly PageComment[], toVersion: string): boolean {
    return comments.some(
      (comment) =>
        comment.parentId === null &&
        comment.quote !== null &&
        comment.quote.length > 0 &&
        comment.pageVersion !== null &&
        !versionMarksMatch(comment.pageVersion, toVersion),
    );
  }


  function stashEditReview(fromVersion: string): void {
    try {
      const payload: StoredEditReview = {
        pageSlug: state.slug,
        fromVersion,
        at: Date.now(),
      };
      sessionStorage.setItem(STORAGE_EDIT_REVIEW, JSON.stringify(payload));
    } catch {
      // 控えが置けなくても、一覧の物語だけで当時といまは読める
    }
  }


  function readStoredReview(): StoredEditReview | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_EDIT_REVIEW);
      if (raw === null) return null;
      const value: unknown = JSON.parse(raw);
      if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
      const record: Record<string, unknown> = { ...value };
      const pageSlug = record["pageSlug"];
      const fromVersion = record["fromVersion"];
      const at = record["at"];
      if (typeof pageSlug !== "string" || typeof fromVersion !== "string" || typeof at !== "number") {
        return null;
      }
      if (pageSlug !== state.slug) return null;
      if (Date.now() - at > EDIT_REVIEW_TTL_MS) return null;
      return { pageSlug, fromVersion, at };
    } catch {
      return null;
    }
  }


  function clearStoredReview(): void {
    try {
      sessionStorage.removeItem(STORAGE_EDIT_REVIEW);
    } catch {
      // 消せなくても帯は state.review で畳める
    }
  }


  function applyReview(fromVersion: string): void {
    const ids: string[] = [];
    for (const comment of topLevel()) {
      if (comment.resolvedAt !== null) continue;
      if (!versionMarksMatch(comment.pageVersion, fromVersion)) continue;
      const outcome = outcomeOf(comment);
      if (outcome === null || !isVisibleOutcome(outcome.state)) continue;
      ids.push(comment.id);
      state.expanded.add(comment.id);
    }
    if (ids.length === 0) {
      state.review = null;
      return;
    }
    state.review = { fromVersion, commentIds: ids };
    // 解決済だけ見ていると、直した先の未解決が帯の下に出てこない
    if (state.filter === "resolved") state.filter = "open";
  }


  async function fillOutcomes(toVersion: string | null): Promise<void> {
    if (toVersion === null) return;
    const pending = readStoredReview();
    if (state.outcomesFor === toVersion) {
      if (pending !== null) {
        applyReview(pending.fromVersion);
        clearStoredReview();
        render();
      }
      return;
    }
    if (!hasStaleQuotes(state.comments, toVersion) && pending === null && state.review === null) {
      return;
    }

    const result = await loadOutcomes(state.slug, toVersion);
    if (lifetime.disposed) return;
    if (!result.ok) return;
    if (outcomeTargetVersion() !== toVersion && state.compare?.to.sha !== toVersion) return;

    const next = new Map<string, CommentOutcome>();
    for (const outcome of result.value) next.set(outcome.commentId, outcome);
    state.outcomes = next;
    state.outcomesFor = toVersion;

    const found = pending ?? readStoredReview();
    if (found !== null) {
      applyReview(found.fromVersion);
      clearStoredReview();
    } else if (state.review !== null) {
      applyReview(state.review.fromVersion);
    }

    render();
  }


  function quoteLine(quoteClass: string, text: string, story: boolean): HTMLElement {
    return el("p", story ? `${quoteClass} is-story` : quoteClass, text);
  }


  function commentWasEdited(comment: PageComment): boolean {
    const created = Date.parse(comment.createdAt);
    const updated = Date.parse(comment.updatedAt);
    if (Number.isNaN(created) || Number.isNaN(updated)) return false;
    return updated - created > 1000;
  }


  function storyLabel(parent: HTMLElement, beat: string, meta: string | null, title: string | null): void {
    const row = el("p", "outcome-label");
    row.appendChild(el("span", "outcome-beat", beat));
    if (meta !== null && meta.length > 0) {
      const who = el("span", "outcome-meta", meta);
      if (title !== null && title.length > 0) who.title = title;
      row.appendChild(who);
    }
    parent.appendChild(row);
  }


  function rewrittenPhrase(iso: string, postedWhen: string): string {
    const when = relativeTime(iso);
    if (when.length === 0 || when === postedWhen) return t("toolbox.story.edited");
    if (when === t("toolbox.time.justNow")) return t("toolbox.story.editedJustNow");
    return t("toolbox.story.editedAt", { when });
  }


  function commentStoryMeta(comment: PageComment): { text: string; title: string } {
    const name = comment.author.name;
    const when = relativeTime(comment.createdAt);
    if (!commentWasEdited(comment)) {
      return { text: `${name} ・ ${when}`, title: fullTime(comment.createdAt) };
    }
    return {
      text: `${name} ・ ${when} ・ ${rewrittenPhrase(comment.updatedAt, when)}`,
      title: t("toolbox.story.writtenThenEdited", { written: fullTime(comment.createdAt), edited: fullTime(comment.updatedAt) }),
    };
  }


  function changeStoryMeta(outcome: CommentOutcome): { text: string; title: string } | null {
    if (outcome.changedBy === null || outcome.changedAt === null) return null;
    return {
      text: `${outcome.changedBy} ・ ${relativeTime(outcome.changedAt)}`,
      title: fullTime(outcome.changedAt),
    };
  }


  function appendQuoteStory(
    parent: HTMLElement,
    comment: PageComment,
    quoteClass: string,
    bodyClass: string,
    withCompareLink = true,
  ): void {
    const outcome = outcomeOf(comment);
    const story = outcome !== null && isVisibleOutcome(outcome.state);

    if (story) {
      storyLabel(parent, t("toolbox.story.then"), null, null);
      parent.appendChild(quoteLine(quoteClass, outcome.thenText, true));
    } else if (comment.quote !== null && comment.quote.length > 0) {
      parent.appendChild(quoteLine(quoteClass, comment.quote, false));
    }

    if (story) {
      const meta = commentStoryMeta(comment);
      storyLabel(parent, t("toolbox.common.comment"), meta.text, meta.title);
    }
    if (comment.body.length > 0) {
      parent.appendChild(el("p", bodyClass, comment.body));
    }

    if (story) {
      const change = changeStoryMeta(outcome);
      storyLabel(parent, t("toolbox.story.now"), change?.text ?? null, change?.title ?? null);
      if (outcome.state === "gone") {
        parent.appendChild(el("p", "note is-story", t("toolbox.story.gone")));
      } else if (outcome.nowText !== null) {
        parent.appendChild(quoteLine(quoteClass, outcome.nowText, true));
      }
      if (withCompareLink && state.features.history && comment.pageVersion !== null) {
        const see = el("button", "story-link");
        see.type = "button";
        see.textContent = t("toolbox.story.seeChange");
        see.addEventListener("click", (event) => {
          event.stopPropagation();
          void openOutcomeCompare(comment);
        }, { signal: lifetime.signal });
        parent.appendChild(see);
      }
    }
  }


  function awaitingOutcome(comment: PageComment): boolean {
    if (comment.quote === null || comment.quote.length === 0) return false;
    if (comment.pageVersion === null) return false;
    const to = outcomeTargetVersion();
    if (to === null) return false;
    if (versionMarksMatch(comment.pageVersion, to)) return false;
    return state.outcomesFor === null;
  }


  function missingQuoteNote(comment: PageComment, anchored: boolean): string | null {
    if (anchored || comment.quote === null) return null;
    if (awaitingOutcome(comment)) return null;
    const outcome = outcomeOf(comment);
    if (outcome !== null && isVisibleOutcome(outcome.state)) return null;
    return t("toolbox.story.quoteLost");
  }


  async function openOutcomeCompare(comment: PageComment): Promise<void> {
    if (comment.pageVersion === null || !state.features.history) return;
    const versions = await ensureVersions();
    if (lifetime.disposed) return;
    if (versions === null) return;

    const from = findVersion(versions, comment.pageVersion);
    const toSha = state.outcomesFor ?? outcomeTargetVersion();
    if (from === null || toSha === null) {
      pushToast(t("toolbox.story.thenMissing"), "failure");
      return;
    }
    const to = findVersion(versions, toSha);
    if (to === null) {
      pushToast(t("toolbox.story.nowMissing"), "failure");
      return;
    }
    if (from.sha === to.sha) return;

    // 覗き見から来ても、物語のカードと本文の赤入れが同時に残るように板を開く
    state.view = "comments";
    state.activeId = comment.id;
    state.expanded.add(comment.id);
    setOpen(true);

    await startCompare(from, to, true);
    if (lifetime.disposed) return;
    const compare = state.compare;
    const outcome = outcomeOf(comment);
    if (compare === null || compare.diff === null || outcome === null) return;
    const hit = compare.diff.changes.find((change) => changeTouchesOutcome(change, outcome));
    if (hit !== undefined && compare.placed.has(hit.index)) gotoChange(hit.index);
  }


  /**
   * 帯から、直した箇所のコメントをまとめて解決にする。
   *
   * まとめての口を 1 回叩く（1 件ずつ何度も叩くと、途中で失敗したときに
   * 半分だけ閉じた状態で止まる）。すでに閉じているものはサーバーが触らない。
   */
  async function resolveReviewed(): Promise<void> {
    const review = state.review;
    if (review === null || !canAct()) return;
    state.busy = true;
    render();
    const result = await resolveComments(state.slug, review.commentIds, true);
    if (lifetime.disposed) return;
    state.busy = false;
    if (!afterChange(result)) return;
    state.review = null;
    await refresh();
    if (lifetime.disposed) return;
  }


  function reviewBanner(): HTMLElement {
    const box = el("div", "story-banner");
    const count = state.review === null ? 0 : state.review.commentIds.length;
    box.appendChild(
      el(
        "p",
        "story-banner-text",
        t("toolbox.story.reviewBanner", { count }),
      ),
    );
    const actions = el("div", "story-banner-actions");
    if (canAct()) {
      const resolve = el("button", "story-link");
      resolve.type = "button";
      // 何件動くかを字に出す。帯の下に並んでいるのがその中身
      resolve.textContent = t("toolbox.list.bulk.resolve", { count });
      resolve.disabled = state.busy;
      resolve.addEventListener("click", () => void resolveReviewed(), { signal: lifetime.signal });
      actions.appendChild(resolve);
    }
    const dismiss = el("button", "story-link");
    dismiss.type = "button";
    dismiss.textContent = t("toolbox.common.close");
    dismiss.addEventListener("click", () => {
      state.review = null;
      render();
    }, { signal: lifetime.signal });
    actions.appendChild(dismiss);
    box.appendChild(actions);
    return box;
  }


  // ---------------------------------------------------------------------------
  // カード
  // ---------------------------------------------------------------------------

  function replyCard(reply: PageComment): HTMLElement {
    const box = el("div");

    const head = el("div", "card-head");
    head.appendChild(avatarFor(reply.author));
    head.appendChild(el("span", "who-name", reply.author.name));
    const time = el("span", "who-time", relativeTime(reply.createdAt));
    time.title = fullTime(reply.createdAt);
    head.appendChild(time);
    head.appendChild(el("span", "spacer"));
    box.appendChild(head);

    box.appendChild(el("p", "body", reply.body));

    // 親と同じ扱い。まとめて選んでいる間は 1 件ずつの操作を出さない
    if (canChangeOwn(reply) && !picking()) {
      const actions = el("div", "card-actions");
      if (state.confirmDeleteId === reply.id) {
        actions.appendChild(el("span", "hint", t("toolbox.card.confirmDeleteReply")));
        actions.appendChild(
          actionButton(t("toolbox.common.remove"), ICON_TRASH, () => void removeComment(reply.id), "is-danger"),
        );
        actions.appendChild(
          actionButton(t("toolbox.common.cancel"), ICON_CLOSE, () => {
            state.confirmDeleteId = null;
            render();
          }),
        );
      } else {
        actions.appendChild(
          iconAction(t("toolbox.common.delete"), ICON_TRASH, () => {
            state.confirmDeleteId = reply.id;
            render();
          }, "is-danger"),
        );
      }
      box.appendChild(actions);
    }

    return box;
  }


  function editorBox(comment: PageComment): HTMLElement {
    const editor = state.editor;
    if (editor === null) return el("div");

    const box = el("div", "composer");
    const replying = editor.mode === "reply";

    // 返信は「強さのボタン＝送信」。編集は強さを選んでから保存する形のまま
    // （直すときは、強さだけ変えたい／本文だけ直したい、が別々に起きるため）
    let send: SendRow | null = null;
    if (replying) {
      send = prioritySendRow((priority) => {
        editor.priority = priority;
        void submitEditor(comment);
      });
      send.setEnabled(canSend(editor.body));
    } else {
      box.appendChild(
        priorityPicker(editor.priority, (next) => {
          editor.priority = next;
          render();
        }),
      );
    }

    const area = textArea(
      editor.body,
      replying ? t("toolbox.card.writeReply") : t("toolbox.card.editComment"),
      (next) => {
        editor.body = next;
        send?.setEnabled(canSend(next));
      },
      // 近道が使えるのは返信だけ。既にあるコメントを直すほうは、
      // 強さを選ぶ場所と保存ボタンが別にあるので、数字を押した先が 1 つに決まらない
      replying
        ? {
          onPriority: (priority) => {
            editor.priority = priority;
            void submitEditor(comment);
          },
        }
        : {},
    );
    box.appendChild(area);
    // 書いてから送る順に並べる（返信も同じ）
    if (send !== null) box.appendChild(send.row);

    const foot = el("div", "composer-foot");
    // 左側はボタンを右へ寄せるための余白。近道の案内は送信の行の絵記号が持つ
    foot.appendChild(el("span", "hint"));
    const cancel = el("button", "button");
    cancel.type = "button";
    cancel.textContent = t("toolbox.common.cancel");
    cancel.addEventListener("click", (event) => {
      event.stopPropagation();
      state.editor = null;
      render();
    }, { signal: lifetime.signal });
    foot.appendChild(cancel);

    // 保存ボタンが要るのは編集だけ（返信は強さのボタンが送信を兼ねる）
    if (!replying) {
      const save = el("button", "button is-primary");
      save.type = "button";
      save.appendChild(icon(ICON_SEND, ICON_SIZE.small));
      save.appendChild(el("span", undefined, t("toolbox.common.save")));
      save.addEventListener("click", (event) => {
        event.stopPropagation();
        void submitEditor(comment);
      }, { signal: lifetime.signal });
      foot.appendChild(save);
    }
    box.appendChild(foot);

    lifetime.timeout(() => area.focus({ preventScroll: true }), 0);
    return box;
  }


  /**
   * まとめて選ぶときの印。
   *
   * 四角そのものは既にある部品（check-input と check-mark）を使い回す。
   * 「いくつでも入り切りできるもの」の印はこの製品に 1 つだけで、
   * 送信欄のスイッチと同じ形にそろえる。
   *
   * 押す的はカード全体なので、ここは見た目と読み上げのために置く。
   * それでも本物のチェックボックスにしてあるのは、空白キーで動くことと
   * 「チェックボックス、オン」と読まれることが、書かずに付いてくるから。
   */
  function pickBox(comment: PageComment): HTMLElement {
    const holder = el("label", "pick-box");
    const input = el("input");
    input.type = "checkbox";
    input.className = "check-input";
    input.checked = state.picked !== null && state.picked.has(comment.id);
    input.setAttribute("aria-label", t("toolbox.card.pickComment", { name: comment.author.name }));

    const mark = el("span", "check-mark");
    mark.appendChild(icon(ICON_CHECK, ICON_SIZE.small));

    holder.appendChild(input);
    holder.appendChild(mark);
    input.addEventListener("change", () => togglePicked(comment.id), { signal: lifetime.signal });
    // 名札の中の押しは、カード側の同じ切り替えと二重に走らせない
    holder.addEventListener("click", (event) => event.stopPropagation(), { signal: lifetime.signal });
    return holder;
  }


  /**
   * 片付いたコメントを 1 行に畳んだ姿。
   *
   * 出るのは「すべて」で通読しているときだけ（既定の一覧に解決済は並ばない）。
   * 通読では片付いたものも順番に居てよいが、開いたまま並ぶとまだ手が要るものが
   * 下へ押し流される。何が片付いたかは分かるように、引用か本文の頭を 1 行だけ残す。
   */
  function collapsedCard(comment: PageComment): HTMLElement {
    const card = el("div", "card is-collapsed");
    card.dataset.cardId = comment.id;

    const row = el("div", "collapsed-row");
    if (picking()) {
      card.classList.add("is-pick");
      if (state.picked !== null && state.picked.has(comment.id)) card.classList.add("is-picked");
      row.appendChild(pickBox(comment));
    } else {
      // 中に押せる部品が無いときだけ、カードそのものをボタンにする（選ぶ四角があるときは入れ子になる）
      card.title = t("toolbox.card.expand");
      card.setAttribute("role", "button");
      card.setAttribute("aria-expanded", "false");
      card.tabIndex = 0;
      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        card.click();
      }, { signal: lifetime.signal });
    }
    if (comment.priority === "good") {
      row.appendChild(icon(ICON_THUMBS, ICON_SIZE.small));
    } else {
      row.appendChild(el("span", PRIORITY_LOOK[comment.priority].dotClass));
    }
    const summary = comment.quote !== null && comment.quote.length > 0 ? comment.quote : comment.body;
    row.appendChild(
      el("span", "collapsed-text", summary.length > 0 ? summary : comment.priority === "good" ? t("toolbox.compose.good") : t("toolbox.card.removeHere")),
    );
    row.appendChild(el("span", "collapsed-who", comment.author.name));
    card.appendChild(row);

    card.addEventListener("click", () => {
      if (picking()) {
        togglePicked(comment.id);
        return;
      }
      state.expanded.add(comment.id);
      render();
    }, { signal: lifetime.signal });
    return card;
  }


  function commentCard(comment: PageComment): HTMLElement {
    const resolved = comment.resolvedAt !== null;
    const anchored = state.anchored.has(comment.id);

    // 解決済みは畳んでおく。ただし「解決済」で絞り込んでいるときは、
    // 見に来た当人が読みたいものなので開いたまま出す
    const collapsible =
      resolved &&
      state.filter !== "resolved" &&
      !state.expanded.has(comment.id) &&
      comment.id !== state.activeId;
    if (collapsible) return collapsedCard(comment);

    const classes = ["card"];
    // まとめて選んでいる間は、いま選んでいる 1 件の強調を出さない
    // （選んだ／選んでいないの見分けと、2 通りの「濃い背景」がぶつかる）
    if (picking()) {
      classes.push("is-pick");
      if (state.picked !== null && state.picked.has(comment.id)) classes.push("is-picked");
    } else if (comment.id === state.activeId) {
      classes.push("is-active");
    }
    if (resolved) classes.push("is-resolved");

    const card = el("div", classes.join(" "));
    card.dataset.cardId = comment.id;
    card.addEventListener("click", () => {
      if (picking()) {
        togglePicked(comment.id);
        return;
      }
      selectFromCard(comment.id);
    }, { signal: lifetime.signal });

    const head = el("div", "card-head");
    if (picking()) head.appendChild(pickBox(comment));
    head.appendChild(avatarFor(comment.author));
    const who = el("div");
    who.appendChild(el("div", "who-name", comment.author.name));
    const time = el("div", "who-time", relativeTime(comment.createdAt));
    time.title = fullTime(comment.createdAt);
    who.appendChild(time);
    head.appendChild(who);
    head.appendChild(el("span", "spacer"));
    if (resolved) head.appendChild(el("span", "tag", t("toolbox.common.resolved")));
    head.appendChild(priorityTag(comment.priority));
    card.appendChild(head);

    appendQuoteStory(card, comment, "quote", "body");
    // カードを押すと本文の該当箇所へ移る。カードは中に押せる部品を持つのでボタンにできない——
    // 引用の行を、キーボードと部品の一覧から押せる口にする（見た目は変えない）
    const quote = anchored && !picking() ? card.querySelector<HTMLElement>(":scope > .quote") : null;
    if (quote !== null) {
      quote.setAttribute("role", "button");
      quote.setAttribute("aria-label", t("toolbox.card.jumpToQuote", { quote: quote.textContent ?? "" }));
      quote.tabIndex = 0;
      quote.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectFromCard(comment.id);
      }, { signal: lifetime.signal });
    }

    const missing = missingQuoteNote(comment, anchored);
    if (missing !== null) {
      card.appendChild(el("p", "note", missing));
    }
    if (resolved && comment.resolvedBy !== null) {
      card.appendChild(el("p", "note", t("toolbox.common.resolvedBy", { name: comment.resolvedBy })));
    }

    const editingThis = state.editor !== null && state.editor.targetId === comment.id;
    // まとめて選んでいる間は 1 件ずつの操作を出さない。同じカードの中に
    // 「選ぶ」と「返信・解決・削除」を並べると、押し間違いが取り返しの付かない側へ倒れる
    if (picking()) {
      // 操作行は置かない（選ぶことだけができる）
    } else if (editingThis && state.editor !== null) {
      card.appendChild(editorBox(comment));
    } else {
      const actions = el("div", "card-actions");

      if (state.confirmDeleteId === comment.id) {
        actions.appendChild(el("span", "hint", t("toolbox.common.confirmDeleteComment")));
        actions.appendChild(
          actionButton(t("toolbox.common.remove"), ICON_TRASH, () => void removeComment(comment.id), "is-danger"),
        );
        actions.appendChild(
          actionButton(t("toolbox.common.cancel"), ICON_CLOSE, () => {
            state.confirmDeleteId = null;
            render();
          }),
        );
      } else {
        // 名乗っていない人には出さない。押しても断られるボタンを並べない
        if (canAct()) {
          actions.appendChild(
            iconAction(t("toolbox.card.reply"), ICON_REPLY, () => {
              state.editor = {
                mode: "reply",
                targetId: comment.id,
                body: "",
                priority: comment.priority,
              };
              state.confirmDeleteId = null;
              render();
            }),
          );
          actions.appendChild(
            resolved
              ? iconAction(t("toolbox.card.reopen"), ICON_REOPEN, () => void setResolved(comment, false))
              : iconAction(t("toolbox.card.resolve"), ICON_CHECK, () => void setResolved(comment, true)),
          );
        }
        actions.appendChild(
          iconAction(t("toolbox.card.link"), ICON_LINK, () => {
            void copyText(`${pageUrl()}#c=${comment.id}`, t("toolbox.card.linkCopied"));
          }),
        );
        if (comment.body.length > 0) {
          actions.appendChild(
            iconAction(t("toolbox.card.copyText"), ICON_COPY, () => {
              void copyText(comment.body, t("toolbox.card.textCopied"), t("toolbox.card.copyFailed"));
            }),
          );
        }
        if (canChangeOwn(comment)) {
          actions.appendChild(
            iconAction(t("toolbox.common.edit"), ICON_EDIT, () => {
              state.editor = {
                mode: "edit",
                targetId: comment.id,
                body: comment.body,
                priority: comment.priority,
              };
              state.confirmDeleteId = null;
              render();
            }),
          );
          actions.appendChild(
            iconAction(t("toolbox.common.delete"), ICON_TRASH, () => {
              state.confirmDeleteId = comment.id;
              render();
            }, "is-danger"),
          );
        }
      }
      if (actions.childElementCount > 0) card.appendChild(actions);
    }

    const replies = repliesOf(comment.id);
    if (replies.length > 0) {
      const box = el("div", "replies");
      for (const reply of replies) box.appendChild(replyCard(reply));
      card.appendChild(box);
    }

    return card;
  }


  // ---------------------------------------------------------------------------
  // 送信まわり
  // ---------------------------------------------------------------------------

  async function submitEditor(comment: PageComment): Promise<void> {
    const editor = state.editor;
    if (editor === null) return;

    if (editor.mode === "edit") {
      const body = editor.body.trim();
      if (body.length === 0 && editor.priority !== "good") {
        showError(t("toolbox.card.bodyRequired"));
        return;
      }
      const result = await patchComment(comment.id, { body, priority: editor.priority });
      if (lifetime.disposed) return;
      if (!afterChange(result)) return;
    } else {
      const body = editor.body.trim();
      if (body.length === 0 && editor.priority !== "good") {
        showError(t("toolbox.card.replyRequired"));
        return;
      }
      const result = await createComment({
        pageSlug: state.slug,
        parentId: comment.id,
        quote: null,
        quoteContext: null,
        body,
        kind: "comment",
        priority: editor.priority,
      });
      if (lifetime.disposed) return;
      if (!afterChange(result)) return;
    }

    state.editor = null;
    await refresh();
    if (lifetime.disposed) return;
  }


  /**
   * 解決・戻すは押した瞬間に一覧へ映す（返事を待たせない・DESIGN.md 12 章）。
   * 既定の絞り込みは「未解決」なので、押した札はその場で一覧から外れる。失敗したら元の姿に戻して知らせる。
   * 誰がいつ閉じたかはサーバーだけが決めるので、ここでは時刻の仮置きだけで取り直しが本物に置き換える。
   */
  async function setResolved(comment: PageComment, resolved: boolean): Promise<void> {
    const before = { resolvedAt: comment.resolvedAt, resolvedBy: comment.resolvedBy };
    comment.resolvedAt = resolved ? new Date().toISOString() : null;
    comment.resolvedBy = resolved ? comment.resolvedBy : null;
    render();
    const result = await patchComment(comment.id, { resolved });
    if (lifetime.disposed) return;
    if (!afterChange(result)) {
      comment.resolvedAt = before.resolvedAt;
      comment.resolvedBy = before.resolvedBy;
      render();
      return;
    }
    await refresh();
    if (lifetime.disposed) return;
  }


  async function removeComment(id: string): Promise<void> {
    const result = await deleteComment(id);
    if (lifetime.disposed) return;
    if (!afterChange(result)) return;
    state.confirmDeleteId = null;
    if (state.activeId === id) state.activeId = null;
    await refresh();
    if (lifetime.disposed) return;
  }


  /**
   * 送信。押した瞬間に「済んだこと」として扱う。
   *
   * 返事を待たせない。閉じて、印を確定の見た目に変えて、次の文へ進んでよい状態にする。
   * 実際の成り行きは画面上端の知らせが追いかけて報告する。
   */
  async function submitDraft(): Promise<void> {
    if (connections.draft === null) return;
    const body = connections.draft.body.trim();
    if (body.length === 0 && connections.draft.priority !== "good") {
      showError(t("toolbox.card.commentRequired"));
      return;
    }

    // ここで自分の控えを作る。以降、共有の書きかけは一切見ない
    const job: Submission = {
      pageSlug: state.slug,
      quote: connections.draft.anchor.quote,
      quoteContext: connections.draft.anchor.context,
      body,
      kind: connections.draft.kind,
      priority: connections.draft.priority,
      marks: connections.draft.marks,
      toastId: "",
    };

    // 印の持ち主を控えへ移す。これをしないと、次の片付けで印ごと外れてしまう
    connections.draft.marks = [];

    // 押した瞬間に片付ける（キーボードも閉じる）
    hidePopover();
    hideSelectionBar();
    closeComposeDock();
    window.getSelection()?.removeAllRanges();

    // まだ返事は来ていないが、確定した見た目にしておく
    for (const mark of job.marks) confirmDraftMark(mark);
    job.toastId = pushToast(t("toolbox.card.posting"), "pending");

    await sendSubmission(job);
    if (lifetime.disposed) return;
  }


  /** 控えだけを見て送る。何度でも同じ控えでやり直せる。 */
  async function sendSubmission(job: Submission): Promise<void> {
    const result = await createComment({
      pageSlug: job.pageSlug,
      parentId: null,
      quote: job.quote,
      quoteContext: job.quoteContext,
      body: job.body,
      kind: job.kind,
      priority: job.priority,
    });
    if (lifetime.disposed) return;

    if (!result.ok) {
      for (const mark of job.marks) styleDraftMark(mark, true);
      updateToast(job.toastId, "failure", t("toolbox.card.postFailed"), () => retrySubmission(job));
      // ×で閉じたら、書いたものごと引き下げる
      connections.closeHandlers.set(job.toastId, () => unwrapDraftMarks(job.marks));
      return;
    }

    updateToast(job.toastId, "success", t("toolbox.card.posted"));
    // 確定した印はサーバー側の引用から引き直されるので、仮の印は外す
    unwrapDraftMarks(job.marks);
    // 開くのは保存が返ってきてから。押した瞬間に開くと、失敗したときに
    // 中身の無い板だけが残る（送れたかどうかは、その間「投稿中…」の知らせが持つ）
    const wasOpen = state.open;
    await refresh();
    if (lifetime.disposed) return;
    revealSent(result.value.id, wasOpen);
  }


  /**
   * 書いたものを見せる。
   *
   * 送ったのに画面が何も変わらないと、届いたのか分からない。
   * 板を開いて、書いた 1 件を光らせる（光らせる仕掛けは印から辿ったときと同じもの）。
   *
   * すでに開いている人には、開き直しも寄せ直しもしない。
   * 読んでいた場所を奪わないため、知らせるのは光りだけにする。
   *
   * 狭い画面で閉じているときは**開かずに帰る**。決まりと理由は dock.ts の
   * `opensSheetAfterSend`（続けて書く人の手数を増やさないため）。
   */
  function revealSent(id: string, wasOpen: boolean): void {
    const sent = state.comments.find((comment) => comment.id === id);
    if (sent === undefined) return;

    /*
     * 見るのは「いま閉じているか」。送る前ではなく、届いた中身を取り込んだあとの姿で見る
     * ——1 件目を書いたときは、届いた時点で板が開いていることがあり
     * （opensSheetOnLoad）、そのときは開いている板の中で寄せてよい。
     */
    if (!state.open && !opensSheetAfterSend(isNarrow())) return;

    state.view = "comments";
    // 絞り込みで隠れる側に落ちていたら外す（書いたのに見当たらない、を起こさない）。
    // 書いたばかりのものは必ず未解決なので、行き先は既定の一覧になる
    if (!matchesFilter(sent)) state.filter = filterFor(sent);
    if (!state.open) setOpen(true);
    else render();
    if (wasOpen) flashCard(id);
    else focusCard(id);
  }


  /** 同じ引用・強さ・本文でドックを開き直す。打ち直しは要らない。 */
  function retrySubmission(job: Submission): void {
    connections.closeHandlers.delete(job.toastId);
    for (const mark of job.marks) styleDraftMark(mark, false);

    connections.draft = {
      anchor: {
        quote: job.quote ?? "",
        context: job.quoteContext ?? { beforeText: "", afterText: "" },
      },
      kind: job.kind,
      priority: job.priority,
      body: job.body,
      marks: job.marks,
    };
    connections.draftFocused = false;
    state.view = "comments";
    openComposeDock();
  }


  function onListMenu(event: Event): boolean {
    return event
      .composedPath()
      .some((node) => node instanceof Element && node.classList.contains(connections.LIST_MENU_MARK));
  }


  function closeListMenu(): void {
    if (!connections.listMenuOpen) return;
    connections.listMenuOpen = false;
    render();
  }


  function pickRow(
    label: string,
    active: boolean,
    onPick: () => void,
    count?: number,
  ): HTMLButtonElement {
    const row = el("button", active ? "pick-row is-active" : "pick-row");
    row.type = "button";
    row.setAttribute("aria-pressed", active ? "true" : "false");
    row.appendChild(el("span", undefined, label));
    if (count !== undefined) row.appendChild(el("span", "pick-count", String(count)));
    row.addEventListener("click", (event) => {
      event.stopPropagation();
      onPick();
    }, { signal: lifetime.signal });
    return row;
  }


  function paintListMenuButton(): void {
    if (connections.listMenuButton === null) return;
    const engaged = connections.listMenuOpen || !isListDefault(state.filter, state.sort);
    connections.listMenuButton.classList.toggle("is-active", engaged);
    connections.listMenuButton.setAttribute("aria-expanded", connections.listMenuOpen ? "true" : "false");
  }


  /**
   * 「まとめて選ぶ」の口を出すか、引っ込めるか。
   *
   * 入っている間は、その口だけを残して隣（絞り込み・書き出し）を引っ込める。
   * モードに入ったら、そのモードの操作だけにする——絞り込みは選ぶ前に決めるものなので、
   * 選んでいる最中に触れると、候補と選んだ印が食い違う。
   */
  function paintPickButton(): void {
    const inList = state.view === "comments";
    const on = picking();
    if (connections.listMenuButton !== null) connections.listMenuButton.hidden = on;
    if (connections.pickButton !== null) {
      connections.pickButton.hidden = !inList || (!on && !canPick());
      connections.pickButton.classList.toggle("is-active", on);
      connections.pickButton.setAttribute("aria-pressed", on ? "true" : "false");
      connections.pickButton.title = on ? t("toolbox.list.stopPicking") : t("toolbox.list.pick");
      connections.pickButton.setAttribute("aria-label", connections.pickButton.title);
    }
    if (connections.exportTools !== null) connections.exportTools.hidden = on;
    if (on) connections.listMenuOpen = false;
  }


  /**
   * 絞り込みと並べ替え。
   *
   * 既定（すべて・本文の順）では何も出さない。いつも使うわけではない操作を、
   * 一覧の上に常時置かないため。外れているときだけ、静かな 1 行でいまの姿を残す。
   * 口そのものは板の頭の絵記号。
   */
  function renderListMenu(): void {
    if (connections.listMenuBox === null) return;
    paintListMenuButton();
    connections.listMenuBox.replaceChildren();

    if (state.view !== "comments") return;

    if (connections.listMenuOpen) {
      const counts = listCounts();

      const menu = el("div", "list-menu");

      const filters = el("div");
      filters.appendChild(el("p", "list-menu-label", t("toolbox.list.filterLabel")));
      for (const [key, label] of filterRows(state.filter, counts, changedKnown())) {
        filters.appendChild(
          pickRow(label, state.filter === key, () => {
            setFilter(key);
          }, counts[key]),
        );
      }
      menu.appendChild(filters);

      const sorts = el("div");
      sorts.appendChild(el("p", "list-menu-label", t("toolbox.list.sortLabel")));
      for (const [key, label] of SORT_CHOICES) {
        sorts.appendChild(
          pickRow(label, state.sort === key, () => {
            state.sort = key;
            render();
          }),
        );
      }
      menu.appendChild(sorts);

      connections.listMenuBox.appendChild(menu);
      connections.listMenuBox.hidden = false;
      return;
    }

    const summary = listSummary(state.filter, state.sort);
    if (summary.length === 0) {
      connections.listMenuBox.hidden = true;
      return;
    }

    const line = el("button", "list-summary");
    line.type = "button";
    line.textContent = summary;
    line.title = t("toolbox.list.changeMenu");
    line.addEventListener("click", (event) => {
      event.stopPropagation();
      connections.listMenuOpen = true;
      render();
    }, { signal: lifetime.signal });
    connections.listMenuBox.appendChild(line);
    connections.listMenuBox.hidden = false;
  }


  /**
   * 一覧を組み直す。
   *
   * 中身を作り直すと、読んでいた位置（scrollTop）も光りも一緒に捨てられる。
   * 組み直しは新しいコメントが届くたび・絞り込みを変えるたびに走るので、
   * **組み直しのたびに先頭へ戻る**という当たり前のようになっていた不具合になる。
   * ここで位置を控え、組み直してから戻す。光りも同じところで付け直す。
   */
  /**
   * 一覧の末尾に置く、いま外している側への 1 行。
   *
   * 既定で解決済を外すからこそ要る。**隠したことを黙って隠さない**ための告知で、
   * 押せば行ける近道も兼ねる。件数と行き先を決めるのは comment-list.ts。
   * まとめて選んでいる間は出さない（あのときの一覧は行き先を持たない）。
   */
  function listTailRow(): HTMLElement | null {
    if (picking()) return null;
    const tail = listTail(state.filter, listCounts());
    if (tail === null) return null;

    const line = el("button", "list-summary is-tail");
    line.type = "button";
    line.textContent = tail.label;
    line.addEventListener("click", (event) => {
      event.stopPropagation();
      setFilter(tail.to);
    }, { signal: lifetime.signal });
    return line;
  }


  /**
   * コメントが 1 件も出ないときの言葉。
   *
   * 3 通りある。1 件も無いページ、未解決だけが尽きたページ（＝全部片付いた）、
   * それ以外の絞り込み。既定が未解決なので、真ん中を「0 件です」で済ませると
   * 全部片付いた気持ちのよい状態が、絞り込みの失敗のように読める。
   */
  function emptyList(): HTMLElement {
    const counts = listCounts();
    const empty = el("div", "empty");
    const nothing = counts.all === 0;
    const allDone = !nothing && state.filter === "open";

    empty.appendChild(
      el(
        "div",
        "empty-title",
        nothing
          ? t("toolbox.list.empty.nothing")
          : allDone
            ? t("toolbox.list.empty.allDone")
            : t("toolbox.list.empty.filtered"),
      ),
    );
    if (nothing) {
      empty.appendChild(el("div", "empty-hint", t("toolbox.list.empty.hint")));
    }
    return empty;
  }


  function renderList(): void {
    if (connections.listBox === null) return;
    const keepTop = connections.listBox.scrollTop;
    connections.listBox.replaceChildren();

    const visible = visibleForList();
    if (state.review !== null) connections.listBox.appendChild(reviewBanner());

    if (visible.length === 0) {
      connections.listBox.appendChild(emptyList());
      // 片付いたものへの扉は、空のときこそ要る（何も無いのではなく、外してある）
      const tail = listTailRow();
      if (tail !== null) connections.listBox.appendChild(tail);
      connections.listBox.scrollTop = keepTop;
      return;
    }

    for (const comment of visible) connections.listBox.appendChild(commentCard(comment));
    const tail = listTailRow();
    if (tail !== null) connections.listBox.appendChild(tail);
    // 読んでいた位置へ戻す（中身が短くなっていれば、ブラウザが端で止めてくれる）
    connections.listBox.scrollTop = keepTop;
    applyFocus();
  }


  /**
   * 狭い画面で書くところ。板の中に、引用が見えた状態で開く。
   *
   * 小窓ではなくここに出すのは、画面の幅いっぱいを使いたいのと、
   * キーボードが出ても引用が隠れない位置に置きたいため。
   */
  function sheetComposer(current: Draft): HTMLElement {
    const box = el("div", "sheet-compose");

    // 見出しの行は置かない。何をする画面かは、引用と強さのボタンで分かる

    // 引用の行。やめるボタンはここの右端
    const quoteRow = el("div", "quote-row");
    // 付け先はあとから差し替わるので、この 1 行だけ持っておいて中身を入れ替える
    connections.dockQuote = el("p", "pop-quote", current.anchor.quote);
    quoteRow.appendChild(connections.dockQuote);

    const close = el("button", "icon-button");
    close.type = "button";
    close.title = t("toolbox.common.cancel");
    close.appendChild(icon(ICON_CLOSE, ICON_SIZE.small));
    close.addEventListener("click", () => discardDraft(), { signal: lifetime.signal });
    quoteRow.appendChild(close);
    box.appendChild(quoteRow);

    const body = el("div", "composer");

    // 強さのボタンがそのまま送信。押した強さで送る
    const send = prioritySendRow((priority) => {
      current.priority = priority;
      void submitDraft();
    });
    send.setEnabled(canSend(current.body));

    const area = textArea(
      current.body,
      t("toolbox.common.writeSomething"),
      (next) => {
        current.body = next;
        send.setEnabled(canSend(next));
        // 位置は下端に貼り付いているので、伸びても置き直す必要は無い。
        // 隠れる範囲だけは変わるので、避ける余白のほうを更新する
        updateScrollPadding();
      },
      {
        onPriority: (priority) => {
          current.priority = priority;
          void submitDraft();
        },
        quoteWhenEmpty: () => current.anchor.quote,
      },
    );
    body.appendChild(area);
    // 書いてから送る順に並べる（送信は入力欄の下）
    body.appendChild(send.row);
    box.appendChild(body);

    // 開いた直後だけ焦点を当てる（キーボードを出す）。打っている途中では奪い返さない。
    // 位置合わせはこちらの計算に任せるので、ブラウザ側の自動スクロールは断る
    // （両方が動くと、画面がひと跳ねしてから落ち着くことになる）
    if (!connections.draftFocused) {
      connections.draftFocused = true;
      lifetime.timeout(() => area.focus({ preventScroll: true }), 0);
    }
    return box;
  }


  /**
   * 足の帯。選んだ件数と、動かす向きだけを出す。
   *
   * ボタンを 2 つ並べない（向きは選んだ中身が決める。comment-list.ts の bulkAction）。
   * 1 件も選んでいないときは動かすボタンを出さず、やめる道だけを残す。
   */
  function renderPickBar(): void {
    if (connections.pickBar === null) return;
    if (!picking() || state.view !== "comments") {
      connections.pickBar.hidden = true;
      connections.pickBar.replaceChildren();
      return;
    }

    const chosen = pickedComments();
    const visible = visibleForList();
    const action = bulkAction(chosen);

    connections.pickBar.replaceChildren();

    // 全部選んでいるなら外す側、そうでなければ選ぶ側。同じ 1 つの口で往復する
    const everything = chosen.length === visible.length;
    const toggleAll = el("button", "list-summary is-pick-all");
    toggleAll.type = "button";
    toggleAll.textContent = everything ? t("toolbox.list.unpickAll") : t("toolbox.list.pickAll");
    toggleAll.addEventListener("click", (event) => {
      event.stopPropagation();
      state.picked = everything ? new Set() : new Set(visible.map((comment) => comment.id));
      render();
    }, { signal: lifetime.signal });
    connections.pickBar.appendChild(toggleAll);

    const cancel = el("button", "button");
    cancel.type = "button";
    cancel.textContent = t("toolbox.common.cancel");
    cancel.addEventListener("click", (event) => {
      event.stopPropagation();
      stopPicking();
    }, { signal: lifetime.signal });
    connections.pickBar.appendChild(cancel);

    if (action !== null) {
      const apply = el("button", "button is-primary");
      apply.type = "button";
      apply.appendChild(icon(action === "resolve" ? ICON_CHECK : ICON_REOPEN, ICON_SIZE.small));
      apply.appendChild(el("span", undefined, bulkLabel(action, chosen.length)));
      apply.disabled = state.busy;
      apply.addEventListener("click", (event) => {
        event.stopPropagation();
        void applyPicked();
      }, { signal: lifetime.signal });
      connections.pickBar.appendChild(apply);
    }

    connections.pickBar.hidden = false;
  }
  return {
    dispose() { lifetime.dispose(); },
    topLevel,
    repliesOf,
    matchesFilter,
    inList,
    visibleForList,
    isMine,
    canAct,
    picking,
    startPicking,
    stopPicking,
    outcomeOf,
    outcomeTargetVersion,
    outcomesToVersion,
    stashEditReview,
    fillOutcomes,
    appendQuoteStory,
    editorBox,
    submitDraft,
    onListMenu,
    closeListMenu,
    paintPickButton,
    renderListMenu,
    renderList,
    sheetComposer,
    renderPickBar,
    state
  };
}
