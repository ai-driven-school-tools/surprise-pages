import { deckEditSessionActive } from "../deck/edit/state";
import { defaultTranslate } from "../../lib/i18n/default";
import { t } from "../shared/i18n";
import { createWidgetLifetime } from "../shared/widget-lifetime";
import {
  versionMarksMatch
} from "../../lib/comments/outcome-rules";
import {
  COMMENT_PRIORITIES,
  type CommentAuthor,
  type CommentPriority,
  type FixPriority,
  type PageVisibility,
} from "../../lib/comments/types";
import { keepMermaidSource } from "../../lib/html/mermaid-source";
import { isAvatarPath } from "../../lib/identity/avatar-path";
import {
  VIEWED_OFF_KEY,
  VIEWED_STORAGE_KEY,
  parseViewed,
  recordViewed,
  serializeViewed,
  viewedMarkKey,
  viewedPaused,
} from "../../lib/revisions/viewed-pages";
import {
  clearHighlights,
  hoverMark,
  markAt,
  prepareDeckSupplements,
  styleMark
} from "./anchor";
import {
  loadComments,
  recordView,
  loadLatestVersion,
  loadSignOutToken,
  saveFavorite,
  type ApiResult,
  type LoadedComments
} from "../shared/api";
import {
  filterFor,
  sortComments
} from "./comment-list";
import { createCommentHistory } from './history';
import { createCommentList } from './widget-list';
import { createCommentOrigin } from './origin';
import { createCommentLive } from './live';
import { createCommentSelection } from './selection';
import { createCommentSharing } from './sharing';
import type { PanelView, SendRow, State, TextAreaKeys } from './types';
import { mountDeckStyles } from "../deck/deck";
import { duplicateDeck } from "../deck/duplicate";
import { mountDeckPresenterLauncher, openPresenterView } from "../deck/present/launch";
import { readDeckTools, watchDeckTools } from "../deck/edit/tools";
import {
  opensSheetOnLoad,
  toolbarVisible
} from "./dock";
import { editorActive, openPageEditor, warmEditor, type EditorHooks } from "../editor/loader";
import {
  bindExportSource,
  mountPageExport,
  setExportCommentsAvailable,
} from "../reading/page-export";
import {
  afterTap
} from "./peek";
import { insideWindowTitlebar, mountLocationBar, type LocationBar } from "../reading/location-bar";
import { mountReadingNavigation, type ReadingNavigation } from "../reading/nav";
import { releaseFirstPaintChrome } from "../reading/first-paint-chrome";
import {
  clearRedline,
  repaintRedline,
  setRedlineOffset
} from "./redline";
import { STYLES } from "../shared/styles";
import { topInset } from "../reading/top-inset";
import {
  addToast,
  autoDismissMs,
  dismissToast,
  findToast,
  settleToast,
  type Toast,
  type ToastState
} from "../shared/toast";
import { ICON_SIZE, POPOVER_PLACEMENT } from "../shared/tokens";
import {
  HOST_TAG,
  ICON_BRACES,
  ICON_MORE,
  ICON_CLOSE,
  ICON_COMMENT,
  ICON_EDIT,
  ICON_FILE_TEXT,
  ICON_HISTORY,
  ICON_LAYOUT_GRID,
  ICON_LINK,
  ICON_LIST_CHECKS,
  ICON_LIST_FILTER,
  ICON_NOTEBOOK_TEXT,
  ICON_ORIGIN,
  ICON_PLAY,
  ICON_PRESENTATION,
  ICON_THUMBS,
  ICON_USERS,
  ICON_COPY,
  PANEL_DEFAULT_WIDTH,
  PRIORITY_LOOK,
  PRIORITY_ORDER,
  download,
  el,
  fullTime,
  icon,
  initialAvatar,
  isCopyChord,
  isIosLike,
  paintCopyLinkButton,
  priorityShortcut,
  readSession,
  readStored,
  writeSession,
  writeStored
} from "../shared/util";

const lifetime = createWidgetLifetime();

/**
 * ページに自動で付くコメント機能。
 *
 * 出るのは**会社の人の画面だけ**。社内ページ（/i）はそこを開けている時点で会社の人なので
 * すぐ出す。公開ページ（/p）は社外の人も読むので、**誰として読んでいるかが分かるまで
 * 何も作らない**（記事だけを読む人の画面には、影も置かない）。
 *
 * ページ側の DOM に触るのは 2 か所だけ:
 *   1. 引用に印を付ける <mark>
 *   2. パネルを開いたときに本文を右に押し出す余白
 * 自分の見た目はすべて Shadow DOM の中に閉じてあるので、ページの CSS とは混ざらない。
 */

const STORAGE_WIDTH = "surprise-pages:comments:width";
const state: State = {
  personal: false,
  slug: "",
  visibility: "internal",
  viewer: null,
  get comments() { return listFeature.state.comments; }, set comments(value: State["comments"]) { listFeature.state.comments = value; },
  get anchored() { return selectionFeature.state.anchored; }, set anchored(value: State["anchored"]) { selectionFeature.state.anchored = value; },
  get expanded() { return listFeature.state.expanded; }, set expanded(value: State["expanded"]) { listFeature.state.expanded = value; },
  currentVersion: null,
  favorite: null,
  get outcomes() { return listFeature.state.outcomes; }, set outcomes(value: State["outcomes"]) { listFeature.state.outcomes = value; },
  get outcomesFor() { return listFeature.state.outcomesFor; }, set outcomesFor(value: State["outcomesFor"]) { listFeature.state.outcomesFor = value; },
  get review() { return listFeature.state.review; }, set review(value: State["review"]) { listFeature.state.review = value; },
  get filter() { return listFeature.state.filter; }, set filter(value: State["filter"]) { listFeature.state.filter = value; },
  get sort() { return listFeature.state.sort; }, set sort(value: State["sort"]) { listFeature.state.sort = value; },
  get picked() { return listFeature.state.picked; }, set picked(value: State["picked"]) { listFeature.state.picked = value; },
  open: false,
  width: PANEL_DEFAULT_WIDTH,
  get activeId() { return selectionFeature.state.activeId; }, set activeId(value: State["activeId"]) { selectionFeature.state.activeId = value; },
  get editor() { return listFeature.state.editor; }, set editor(value: State["editor"]) { listFeature.state.editor = value; },
  get confirmDeleteId() { return listFeature.state.confirmDeleteId; }, set confirmDeleteId(value: State["confirmDeleteId"]) { listFeature.state.confirmDeleteId = value; },
  features: {
    tools: false,
    history: false,
    sharing: false,
    edit: false,
    write: false,
  },
  view: "comments",
  get versions() { return historyFeature.state.versions; }, set versions(value: State["versions"]) { historyFeature.state.versions = value; },
  get moreVersions() { return historyFeature.state.moreVersions; }, set moreVersions(value: State["moreVersions"]) { historyFeature.state.moreVersions = value; },
  get compare() { return historyFeature.state.compare; }, set compare(value: State["compare"]) { historyFeature.state.compare = value; },
  get access() { return sharingFeature.state.access; }, set access(value: State["access"]) { sharingFeature.state.access = value; },
  get accessEmail() { return sharingFeature.state.accessEmail; }, set accessEmail(value: State["accessEmail"]) { sharingFeature.state.accessEmail = value; },
  get accessInvited() { return sharingFeature.state.accessInvited; }, set accessInvited(value: State["accessInvited"]) { sharingFeature.state.accessInvited = value; },
  get accessScopeTo() { return sharingFeature.state.accessScopeTo; }, set accessScopeTo(value: State["accessScopeTo"]) { sharingFeature.state.accessScopeTo = value; },
  get accessRevokeId() { return sharingFeature.state.accessRevokeId; }, set accessRevokeId(value: State["accessRevokeId"]) { sharingFeature.state.accessRevokeId = value; },
  get accessApproveId() { return sharingFeature.state.accessApproveId; }, set accessApproveId(value: State["accessApproveId"]) { sharingFeature.state.accessApproveId = value; },
  busy: false,
  get origin() { return originFeature.state.origin; }, set origin(value: State["origin"]) { originFeature.state.origin = value; },
  get originJob() { return originFeature.state.originJob; }, set originJob(value: State["originJob"]) { originFeature.state.originJob = value; },
};

let root: ShadowRoot | null = null;
let bar: HTMLElement | null = null;
let panel: HTMLElement | null = null;
let panelTitle: HTMLElement | null = null;
let exportButtons: HTMLElement | null = null;
let listMenuButton: HTMLButtonElement | null = null;
/** 「まとめて選ぶ」の口。出す・引っ込めるは canPick が決める */
let pickButton: HTMLButtonElement | null = null;
/** 書き出しの 2 つ（Markdown / JSON）。まとめて選んでいる間はそろって引っ込める */
let exportTools: HTMLElement | null = null;
let narrowLink: HTMLButtonElement | null = null;
/** 右下の道具箱の「リンクをコピー」。バーは作り直されるので、そのつど持ち替える */
let barLink: HTMLButtonElement | null = null;
let listMenuBox: HTMLElement | null = null;
let listBox: HTMLElement | null = null;
/** まとめて選んでいる間だけ、板の足に出る帯 */
let pickBar: HTMLElement | null = null;
let toastStack: HTMLElement | null = null;
/** いま出ている知らせ。新しいものが先頭 */
let toasts: Toast[] = [];
/** 失敗の知らせに添える「やり直す」処理。知らせが消えたら一緒に捨てる */
const retryHandlers = new Map<string, () => void>();
/** 知らせを×で閉じたときの後始末（印を外す等） */
const closeHandlers = new Map<string, () => void>();

/**
 * 道具箱の「その他」（⋯ から開く小窓）が開いているか。
 *
 * **バーは知らせが出るたびに中身ごと作り直される**ので、開いているかどうかを
 * ボタンの側（クラスや属性）に持たせると、作り直した瞬間に忘れる。ここで覚える。
 */
let moreMenuOpen = false;
/**
 * 絞り込みと並べ替えの口が開いているか。
 *
 * 板の頭のボタンは作り直さないので、開いているかどうかはここに持つ
 * （ボタンのクラスだけに持つと、描き直しで忘れないが、外を押して畳む処理が
 * ボタンを見に行けなくなる）。
 */
let listMenuOpen = false;
/**
 * いまバーに出ている ⋯ のボタン。
 * 作り直すたびに別物になるので、そのつど持ち替える（小窓の位置と、焦点を返す先）。
 */
let moreButton: HTMLButtonElement | null = null;
let originalPaddingRight: string | null = null;
let readingNavigation: ReadingNavigation | null = null;
const sharingFeature = createCommentSharing({
  get pushToast() { return pushToast; },
  get showError() { return showError; },
  get barLink() { return barLink; },
  get narrowLink() { return narrowLink; },
  get setOpen() { return selectionFeature.setOpen; },
  get handleFailure() { return handleFailure; },
  get render() { return render; },
  get renderPanelBody() { return renderPanelBody; },
  get actionButton() { return actionButton; },
  state: {
    get view() { return state.view; }, set view(value: State["view"]) { state.view = value; },
    get busy() { return state.busy; }, set busy(value: State["busy"]) { state.busy = value; },
    get slug() { return state.slug; }, set slug(value: State["slug"]) { state.slug = value; },
    get features() { return state.features; }, set features(value: State["features"]) { state.features = value; },
    get visibility() { return state.visibility; }, set visibility(value: State["visibility"]) { state.visibility = value; },
    get personal() { return state.personal; }, set personal(value: State["personal"]) { state.personal = value; }
  }
});

const originFeature = createCommentOrigin({
  get loadedVersion() { return historyFeature.loadedVersion; },
  get showError() { return showError; },
  get render() { return render; },
  get showNotice() { return sharingFeature.showNotice; },
  get clearCompare() { return historyFeature.clearCompare; },
  get copyText() { return sharingFeature.copyText; },
  get pageUrl() { return sharingFeature.pageUrl; },
  get isComparing() { return historyFeature.isComparing; },
  get exitCompare() { return historyFeature.exitCompare; },
  get setOpen() { return selectionFeature.setOpen; },
  get handleFailure() { return handleFailure; },
  get CHANGE_KINDS() { return historyFeature.CHANGE_KINDS; },
  get actionButton() { return actionButton; },
  get bar() { return bar; },
  get root() { return root; },
  get isNarrow() { return selectionFeature.isNarrow; },
  get tokenPx() { return selectionFeature.tokenPx; },
  state: {
    get features() { return state.features; }, set features(value: State["features"]) { state.features = value; },
    get visibility() { return state.visibility; }, set visibility(value: State["visibility"]) { state.visibility = value; },
    get slug() { return state.slug; }, set slug(value: State["slug"]) { state.slug = value; },
    get currentVersion() { return state.currentVersion; }, set currentVersion(value: State["currentVersion"]) { state.currentVersion = value; },
    get compare() { return state.compare; }, set compare(value: State["compare"]) { state.compare = value; },
    get view() { return state.view; }, set view(value: State["view"]) { state.view = value; },
    get busy() { return state.busy; }, set busy(value: State["busy"]) { state.busy = value; }
  }
});

const historyFeature = createCommentHistory({
  get handleFailure() { return handleFailure; },
  get render() { return render; },
  get setOpen() { return selectionFeature.setOpen; },
  get hidePopover() { return selectionFeature.hidePopover; },
  get hideSelectionBar() { return selectionFeature.hideSelectionBar; },
  get hideMarkPeek() { return selectionFeature.hideMarkPeek; },
  get pushToast() { return pushToast; },
  get fillOutcomes() { return listFeature.fillOutcomes; },
  get syncMarks() { return selectionFeature.syncMarks; },
  get outcomeTargetVersion() { return listFeature.outcomeTargetVersion; },
  get closeOriginCompare() { return originFeature.closeOriginCompare; },
  get renderPanelBody() { return renderPanelBody; },
  get root() { return root; },
  get isNarrow() { return selectionFeature.isNarrow; },
  get originDiffError() { return originFeature.originDiffError; },
  set originDiffError(value) { originFeature.originDiffError = value; },
  get outcomeOf() { return listFeature.outcomeOf; },
  get appendQuoteStory() { return listFeature.appendQuoteStory; },
  get topLevel() { return listFeature.topLevel; },
  state: {
    get slug() { return state.slug; }, set slug(value: State["slug"]) { state.slug = value; },
    get view() { return state.view; }, set view(value: State["view"]) { state.view = value; },
    get outcomesFor() { return state.outcomesFor; }, set outcomesFor(value: State["outcomesFor"]) { state.outcomesFor = value; },
    get outcomes() { return state.outcomes; }, set outcomes(value: State["outcomes"]) { state.outcomes = value; },
    get features() { return state.features; }, set features(value: State["features"]) { state.features = value; },
    get comments() { return state.comments; }, set comments(value: State["comments"]) { state.comments = value; }
  }
});

const listFeature = createCommentList({
  get draft() { return selectionFeature.draft; },
  set draft(value) { selectionFeature.draft = value; },
  get render() { return render; },
  get handleFailure() { return handleFailure; },
  get showNotice() { return sharingFeature.showNotice; },
  get refresh() { return refresh; },
  get loadedVersion() { return historyFeature.loadedVersion; },
  get ensureVersions() { return historyFeature.ensureVersions; },
  get findVersion() { return historyFeature.findVersion; },
  get pushToast() { return pushToast; },
  get setOpen() { return selectionFeature.setOpen; },
  get startCompare() { return historyFeature.startCompare; },
  get gotoChange() { return historyFeature.gotoChange; },
  get afterChange() { return afterChange; },
  get avatarFor() { return avatarFor; },
  get actionButton() { return actionButton; },
  get iconAction() { return iconAction; },
  get prioritySendRow() { return prioritySendRow; },
  get canSend() { return canSend; },
  get priorityPicker() { return priorityPicker; },
  get textArea() { return textArea; },
  get selectFromCard() { return selectionFeature.selectFromCard; },
  get priorityTag() { return priorityTag; },
  get copyText() { return sharingFeature.copyText; },
  get pageUrl() { return sharingFeature.pageUrl; },
  get showError() { return showError; },
  get hidePopover() { return selectionFeature.hidePopover; },
  get hideSelectionBar() { return selectionFeature.hideSelectionBar; },
  get closeComposeDock() { return selectionFeature.closeComposeDock; },
  get updateToast() { return updateToast; },
  get closeHandlers() { return closeHandlers; },
  get isNarrow() { return selectionFeature.isNarrow; },
  get flashCard() { return selectionFeature.flashCard; },
  get focusCard() { return selectionFeature.focusCard; },
  get draftFocused() { return selectionFeature.draftFocused; },
  set draftFocused(value) { selectionFeature.draftFocused = value; },
  get openComposeDock() { return selectionFeature.openComposeDock; },
  get LIST_MENU_MARK() { return LIST_MENU_MARK; },
  get listMenuOpen() { return listMenuOpen; },
  set listMenuOpen(value) { listMenuOpen = value; },
  get listMenuButton() { return listMenuButton; },
  get pickButton() { return pickButton; },
  get exportTools() { return exportTools; },
  get listMenuBox() { return listMenuBox; },
  get listBox() { return listBox; },
  get applyFocus() { return selectionFeature.applyFocus; },
  get dockQuote() { return selectionFeature.dockQuote; },
  set dockQuote(value) { selectionFeature.dockQuote = value; },
  get discardDraft() { return selectionFeature.discardDraft; },
  get updateScrollPadding() { return selectionFeature.updateScrollPadding; },
  get pickBar() { return pickBar; },
  state: {
    get viewer() { return state.viewer; }, set viewer(value: State["viewer"]) { state.viewer = value; },
    get busy() { return state.busy; }, set busy(value: State["busy"]) { state.busy = value; },
    get slug() { return state.slug; }, set slug(value: State["slug"]) { state.slug = value; },
    get currentVersion() { return state.currentVersion; }, set currentVersion(value: State["currentVersion"]) { state.currentVersion = value; },
    get compare() { return state.compare; }, set compare(value: State["compare"]) { state.compare = value; },
    get features() { return state.features; }, set features(value: State["features"]) { state.features = value; },
    get view() { return state.view; }, set view(value: State["view"]) { state.view = value; },
    get activeId() { return state.activeId; }, set activeId(value: State["activeId"]) { state.activeId = value; },
    get anchored() { return state.anchored; }, set anchored(value: State["anchored"]) { state.anchored = value; },
    get open() { return state.open; }, set open(value: State["open"]) { state.open = value; }
  }
});

const selectionFeature = createCommentSelection({
  get isComparing() { return historyFeature.isComparing; },
  get inList() { return listFeature.inList; },
  get listBox() { return listBox; },
  get picking() { return listFeature.picking; },
  get matchesFilter() { return listFeature.matchesFilter; },
  get render() { return render; },
  get avatarFor() { return avatarFor; },
  get visibleForList() { return listFeature.visibleForList; },
  get priorityTag() { return priorityTag; },
  get appendQuoteStory() { return listFeature.appendQuoteStory; },
  get editorBox() { return listFeature.editorBox; },
  get repliesOf() { return listFeature.repliesOf; },
  get isMine() { return listFeature.isMine; },
  get actionButton() { return actionButton; },
  get iconAction() { return iconAction; },
  get panel() { return panel; },
  get afterChange() { return afterChange; },
  get refresh() { return refresh; },
  get readingNavigation() { return readingNavigation; },
  get originalPaddingRight() { return originalPaddingRight; },
  set originalPaddingRight(value) { originalPaddingRight = value; },
  get root() { return root; },
  get STORAGE_WIDTH() { return STORAGE_WIDTH; },
  get watchChanges() { return historyFeature.watchChanges; },
  get moreMenuOpen() { return moreMenuOpen; },
  set moreMenuOpen(value) { moreMenuOpen = value; },
  get moreButton() { return moreButton; },
  get prioritySendRow() { return prioritySendRow; },
  get submitDraft() { return listFeature.submitDraft; },
  get canSend() { return canSend; },
  get textArea() { return textArea; },
  get canAct() { return listFeature.canAct; },
  get readOnly() { return () => state.viewer !== null && !state.features.write; },
  get copyText() { return sharingFeature.copyText; },
  get showError() { return showError; },
  get sheetComposer() { return listFeature.sheetComposer; },
  state: {
    get comments() { return state.comments; }, set comments(value: State["comments"]) { state.comments = value; },
    get filter() { return state.filter; }, set filter(value: State["filter"]) { state.filter = value; },
    get open() { return state.open; }, set open(value: State["open"]) { state.open = value; },
    get editor() { return state.editor; }, set editor(value: State["editor"]) { state.editor = value; },
    get confirmDeleteId() { return state.confirmDeleteId; }, set confirmDeleteId(value: State["confirmDeleteId"]) { state.confirmDeleteId = value; },
    get width() { return state.width; }, set width(value: State["width"]) { state.width = value; },
    get view() { return state.view; }, set view(value: State["view"]) { state.view = value; }
  }
});


// ---------------------------------------------------------------------------
// 見た目の部品
// ---------------------------------------------------------------------------

function avatarFor(author: CommentAuthor): Element {
  const drawn = initialAvatar(author.name);
  if (author.image === null || !(author.image.startsWith("https://") || isAvatarPath(author.image))) return drawn;

  const image = el("img", "avatar");
  image.src = author.image;
  image.alt = "";
  image.referrerPolicy = "no-referrer";
  image.addEventListener("error", () => image.replaceWith(drawn), { signal: lifetime.signal });
  return image;
}

/**
 * 色の丸と文字を 1 組で作る。
 *
 * 丸を文字の並びの中に置いてある（別々の箱として横に並べていない）。
 * 箱の中心どうしを合わせると、字体によっては文字が下がって見える。
 * 文字の並びの中に入れておけば、丸は文字の高さの真ん中にそろう。
 */
function dotLabel(priority: FixPriority): HTMLElement {
  const look = PRIORITY_LOOK[priority];
  const holder = el("span", "dot-label");
  holder.appendChild(el("span", look.dotClass));
  holder.appendChild(document.createTextNode(look.label));
  return holder;
}

/** 優先度の表示。色が付くのは 6px の丸だけで、文字はどの段階も同じ濃さ。いいねは手の絵。 */
function priorityTag(priority: CommentPriority): HTMLElement {
  if (priority === "good") {
    const tag = el("span", "tag");
    tag.title = t("toolbox.compose.good");
    tag.appendChild(icon(ICON_THUMBS, ICON_SIZE.small));
    return tag;
  }
  const look = PRIORITY_LOOK[priority];
  const tag = el("span", "tag");
  tag.title = look.description;
  tag.appendChild(dotLabel(priority));
  return tag;
}

function actionButton(
  label: string,
  paths: readonly string[],
  onClick: () => void,
  variant?: string,
  /**
   * 読み上げ用の名前。
   *
   * 同じ字のボタンが何行も並ぶところ（誰に見せたかの名簿など）で、相手の名を入れるために使う。
   * 渡さなければ見えている字がそのまま読まれる——見えている字と別のことを言わせない。
   */
  spokenLabel?: string,
): HTMLButtonElement {
  const button = el("button", variant === undefined ? "action" : `action ${variant}`);
  button.type = "button";
  if (spokenLabel !== undefined) button.setAttribute("aria-label", spokenLabel);
  button.appendChild(icon(paths, ICON_SIZE.small));
  button.appendChild(el("span", undefined, label));
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  }, { signal: lifetime.signal });
  return button;
}

/**
 * カードの操作。絵記号だけ。名前は触れたときの札と読み上げに載せる。
 *
 * 見える字を足すと、5 つ並んだ時点で本文より先に操作が目に入る。
 * 頭の道具（書き出し・閉じる）と同じ静かな口（icon-button）を使う。
 */
function iconAction(
  label: string,
  paths: readonly string[],
  onClick: () => void,
  variant?: string,
): HTMLButtonElement {
  const button = el("button", variant === undefined ? "icon-button" : `icon-button ${variant}`);
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.appendChild(icon(paths, ICON_SIZE.medium));
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  }, { signal: lifetime.signal });
  return button;
}

/** 強さを選ぶ列（編集のときだけ使う。選んでから保存する形）。 */
function priorityPicker(
  current: CommentPriority,
  onPick: (next: FixPriority) => void,
): HTMLElement {
  const picker = el("div", "picker");
  if (current === "good") {
    const mark = el("span", "tag");
    mark.title = t("toolbox.compose.good");
    mark.appendChild(icon(ICON_THUMBS, ICON_SIZE.small));
    picker.appendChild(mark);
  }
  for (const priority of PRIORITY_ORDER) {
    const look = PRIORITY_LOOK[priority];
    const pill = el("button", priority === current ? "pill is-active" : "pill");
    pill.type = "button";
    pill.title = look.description;
    pill.appendChild(dotLabel(priority));
    pill.addEventListener("click", (event) => {
      event.stopPropagation();
      onPick(priority);
    }, { signal: lifetime.signal });
    picker.appendChild(pill);
  }
  return picker;
}

/**
 * 強さの送信ボタン 3 つと、右端のいいね。
 *
 * 「強さを選んでから送信」をやめ、**押したボタンの強さでそのまま送る**。
 * 指の運びが 1 回減るうえ、「いま何が選ばれているか」という状態が消えるので、
 * 選択の見え方がずれる余地そのものが無くなる。
 *
 * いいねは直してほしさではないので、色の丸ボタンに並べない。
 * 鍵盤の絵を置いていた右端の席を、手の絵の送信に差し替える。
 */
function prioritySendRow(onSend: (priority: CommentPriority) => void): SendRow {
  const row = el("div", "send-row");
  const fixes = el("div", "send-fixes");
  const buttons: HTMLButtonElement[] = [];

  for (const priority of PRIORITY_ORDER) {
    const look = PRIORITY_LOOK[priority];
    const button = el("button", "send-pill");
    button.type = "button";
    button.title = t("toolbox.compose.sendAs", { priority: look.description });
    // 名前は見えている字（must など）を含めて言い切る。近道は名前に混ぜず、部品の属性で渡す
    button.setAttribute("aria-label", t("toolbox.compose.sendAsNamed", { label: look.label, priority: look.description }));
    button.appendChild(dotLabel(priority));
    const chord = shortcutHint(priority);
    if (chord !== null) {
      button.appendChild(el("span", "hint-bubble", chord));
      button.setAttribute("aria-keyshortcuts", priorityKeyShortcuts(priority));
    }
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (button.disabled) return;
      onSend(priority);
    }, { signal: lifetime.signal });
    fixes.appendChild(button);
    buttons.push(button);
  }
  row.appendChild(fixes);

  const good = el("button", "icon-button");
  good.type = "button";
  good.setAttribute("aria-label", t("toolbox.compose.sendGood"));
  good.appendChild(icon(ICON_THUMBS, ICON_SIZE.small));
  if (selectionFeature.hasFinePointer()) good.appendChild(el("span", "hint-bubble", t("toolbox.compose.sendGood")));
  good.addEventListener("click", (event) => {
    event.stopPropagation();
    onSend("good");
  }, { signal: lifetime.signal });
  row.appendChild(good);

  return {
    row,
    setEnabled(on: boolean): void {
      for (const button of buttons) button.disabled = !on;
    },
  };
}

/** 送れる中身になっているか。何も書いていないものは送らない。 */
function canSend(body: string): boolean {
  return body.trim().length > 0;
}

/**
 * 強さを指定して送る近道の文言。出せないところでは null。
 *
 * キーボードの無いところにキーの説明を出さない。押しようがないものを読ませても、
 * 「自分には関係のない話が書いてある」という印象しか残らない。
 * 押すキーは環境で違うので、その場に合うほうだけを出す。
 * 文字は強さの綴りの頭。近道の判定と同じ PRIORITY_ORDER から採るので食い違わない。
 */
/** 強さの近道を、読み上げと AI の操作に渡す形（`aria-keyshortcuts`）で。判定（priorityShortcut）と同じ組み合わせ。 */
function priorityKeyShortcuts(priority: FixPriority): string {
  const held = selectionFeature.appleKeys() ? "Control" : "Control+Alt";
  return `${held}+${priority[0].toUpperCase()}`;
}

function shortcutHint(priority: FixPriority): string | null {
  if (!selectionFeature.hasFinePointer()) return null;
  const held = selectionFeature.appleKeys() ? "control" : "Ctrl + Alt";
  return `${held} + ${priority[0].toUpperCase()}`;
}

/**
 * 入力欄。
 *
 * 送るのは強さのボタンだけ（役割に対して入り口は 1 つ）。
 * 同じことを ⌘/Ctrl + Enter でもできる二重の道は置かない。
 */
function textArea(
  value: string,
  placeholder: string,
  onInput: (next: string) => void,
  keys: TextAreaKeys = {},
): HTMLTextAreaElement {
  const area = el("textarea");
  area.value = value;
  area.placeholder = placeholder;
  area.addEventListener("input", () => onInput(area.value), { signal: lifetime.signal });
  area.addEventListener("keydown", (event) => {
    const chord = {
      code: event.code,
      key: event.key,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      isComposing: event.isComposing,
    };
    const apple = selectionFeature.appleKeys();

    if (keys.onPriority !== undefined) {
      const priority = priorityShortcut(chord, apple);
      if (priority !== null) {
        // 数字が本文に落ちないよう必ず止める。
        // 空で何も送らないときも同じ（押した結果として文字が増える、を起こさない）
        event.preventDefault();
        if (canSend(area.value)) keys.onPriority(priority);
        return;
      }
    }

    // 空の入力欄での ⌘C は、選んだ文章のコピーに充てる。
    // 焦点がここへ来た時点でページ側の選択は解けているので、
    // これが無いと「選んだ文章をコピーする」道そのものが塞がる。
    if (keys.quoteWhenEmpty === undefined) return;
    if (canSend(area.value)) return;
    if (!isCopyChord(chord, apple)) return;
    const quote = keys.quoteWhenEmpty();
    if (quote === null || quote.length === 0) return;
    event.preventDefault();
    void sharingFeature.copyQuote(quote);
  }, { signal: lifetime.signal });
  area.addEventListener("click", (event) => event.stopPropagation(), { signal: lifetime.signal });
  return area;
}

// ---------------------------------------------------------------------------
// 通信のあと始末
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 知らせ（画面上端に浮く。押したあとの成り行きはすべてここへ）
// ---------------------------------------------------------------------------

let toastSeq = 0;

function nextToastId(): string {
  toastSeq += 1;
  return `t${toastSeq}`;
}

/** 出しっぱなしにしない知らせは、決められた時間で自分から消える。 */
function scheduleToastDismiss(id: string, toastState: ToastState): void {
  const life = autoDismissMs(toastState);
  if (life === null) return;
  lifetime.timeout(() => {
    toasts = dismissToast(toasts, id);
    renderToasts();
  }, life);
}

function pushToast(text: string, toastState: ToastState, retry?: () => void): string {
  const id = nextToastId();
  toasts = addToast(toasts, { id, state: toastState, text });
  if (retry !== undefined) retryHandlers.set(id, retry);
  renderToasts();
  scheduleToastDismiss(id, toastState);
  return id;
}

/** 同じ 1 枚の中身を差し替える。カードは作り直さない。 */
function updateToast(id: string, toastState: ToastState, text: string, retry?: () => void): void {
  if (findToast(toasts, id) === null) return;
  toasts = settleToast(toasts, id, toastState, text);
  if (retry === undefined) retryHandlers.delete(id);
  else retryHandlers.set(id, retry);
  renderToasts();
  scheduleToastDismiss(id, toastState);
}

function showError(message: string): void {
  pushToast(message, "failure");
}

/**
 * 通信に失敗したときのあと始末。
 *
 * 401 は「名乗れていない」。道具箱が出ているのは会社の人の画面だけなので、
 * これはログインが切れたということ。読み込み直せば戻る（社内ページも公開ページも同じ）。
 *
 * どの道を通っても最後に必ず画面を描き直す。途中で return して一部だけ直すと、
 * 「名乗れている」前提のボタンと切れたことの知らせが同時に出て、
 * 画面の中に答えが 2 つある状態になる。
 */
function handleFailure(result: { message: string; status: number }): void {
  let message = result.message;
  if (result.status === 401) {
    state.viewer = null;
    // 名乗りが切れたので、現在地の行の顔も名乗っていない姿へ戻す
    showSelf();
    message = t("toolbox.common.sessionExpired");
  }
  showError(message);
  render();
}

/**
 * 届いた答えを画面へ移す。
 *
 * 立ち上げ（start）と、取りに行き直したとき（refresh）の**両方がここを通る**。
 * 立ち上げのときは公開ページで先に 1 回聞いてあるので、同じことを 2 度聞かない。
 */
function applyLoaded(value: LoadedComments): void {
  state.viewer = value.viewer;
  state.comments = value.comments;
  state.features = value.features;
  state.currentVersion = value.currentVersion;
  state.favorite = value.favorite;
  showCurrentVersion();
  showFavorite();
  showSelf();
  // 消えたコメントを選んだままにしない（別のタブで消された分・動かし終わった分）
  if (state.picked !== null) {
    const here = new Set(value.comments.map((comment) => comment.id));
    for (const id of state.picked) {
      if (!here.has(id)) state.picked.delete(id);
    }
  }
  const keepOutcomes =
    state.outcomesFor !== null &&
    value.currentVersion !== null &&
    versionMarksMatch(state.outcomesFor, value.currentVersion);
  if (!keepOutcomes) {
    state.outcomes = new Map();
    state.outcomesFor = null;
  }

  /*
   * 道具箱を出してよい相手でなくなった（別のタブでログアウトした等）。
   *
   * すでに載せてしまった道具箱をきれいに畳む道は用意しない——それをやるには
   * 組み立てた部品と本文に置いた印を全部たどって戻すことになり、畳み損ねが
   * そのまま「押しても何も返らないボタン」になる。中身は空になっているので、
   * 読み込み直してもらえば記事だけの画面に戻る。
   */
  if (!state.features.tools) {
    setExportCommentsAvailable(false);
    showError(t("toolbox.common.sessionExpired"));
    render();
    return;
  }

  setExportCommentsAvailable(true);

  // 本文の文字そのものが入れ替わっていることがあるので、相手が同じでも張り直す
  // （比べている間は syncMarks の側で見送る。外し直すのは比較を抜けるとき）
  selectionFeature.syncMarks(true);
  // 件数が分かったので、板を開くかをここで決める。数えるのは未解決の親コメントだけ
  // （右下の件数の印と同じ数え方）。0 件なら決めないまま持ち越すので、
  // 最初の 1 件を書いた直後にも出てくる
  const unresolvedCount = listFeature.topLevel().filter((comment) => comment.resolvedAt === null).length;
  if (opensSheetOnLoad(selectionFeature.sheetOpenPending, unresolvedCount, selectionFeature.isNarrow())) {
    selectionFeature.setOpen(true);
    void listFeature.fillOutcomes(listFeature.outcomesToVersion());
    void originFeature.probeOriginOnce();
    return;
  }
  render();
  void listFeature.fillOutcomes(listFeature.outcomesToVersion());
  void originFeature.probeOriginOnce();
}

/**
 * 一覧を読み直す。いつ呼ぶかを決めるのは live.ts（見ている間の定期・戻ったとき・編集を閉じたとき）。
 * quiet は定期の読み直しで、失敗しても断りを出さない（つながらない間に断りを連発しない）。
 */
async function refresh(options: { quiet: boolean } = { quiet: false }): Promise<boolean> {
  // Focus moves between the editor's iframe and its controls. Those moves are
  // not a return to the reader and must not start background reader requests.
  if (lifetime.disposed || deckEditSessionActive()) return true;
  const result = await loadComments(state.slug);
  if (lifetime.disposed || deckEditSessionActive()) return true;
  if (!result.ok) {
    if (!options.quiet || result.status === 401) handleFailure(result);
    return false;
  }
  applyLoaded(result.value);
  return true;
}

const liveFeature = createCommentLive({
  refresh,
  editing: () => deckEditSessionActive() || editorActive(),
  lifetime,
});


/**
 * `#c=<コメントの id>` 付きで開かれたら、その 1 件へ連れて行く。
 * リンクを受け取った人が、どのコメントの話か探さずに済むように。
 */
function openLinkedComment(): void {
  const found = /^#c=([0-9a-f-]{36})$/i.exec(window.location.hash);
  if (found === null) return;

  const id = found[1];
  if (!state.comments.some((comment) => comment.id === id)) return;

  state.view = "comments";
  // 既定は未解決なので、解決済のコメントへのリンクは絞り込みごと連れて行く。
  // 「すべて」へ逃がさないのは、一覧が入れ替わった理由を頭の 1 行に言わせるため
  const target = state.comments.find((comment) => comment.id === id);
  if (target !== undefined) state.filter = filterFor(target);
  if (!state.open) selectionFeature.setOpen(true);
  selectionFeature.selectFromCard(id);
  selectionFeature.focusCard(id);
}

function afterChange<T>(result: ApiResult<T>): boolean {
  if (!result.ok) {
    handleFailure(result);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// 書き出し
// ---------------------------------------------------------------------------

function toMarkdown(): string {
  const now = fullTime(new Date().toISOString());
  /*
   * 全件を、書かれた順に。**絞り込みにも本文の位置にも寄りかからない。**
   *
   * 書き出しは全件が正（記録は間引かない）ので、一覧の並びをそのまま借りられない。
   * 「本文の順」も借りない——あれは印の座標で測るもので、印は一覧に従って出入りする
   * ので、いま何で絞っていたかで書き出しの順が変わってしまう。
   * ここは章立て（強さ）で読ませる紙なので、章の中は書かれた順で足りる。
   */
  const tops = sortComments(listFeature.topLevel(), "oldest", new Map());
  const unresolved = tops.filter((comment) => comment.resolvedAt === null).length;

  const lines: string[] = [
    `# コメント一覧: ${state.slug}`, // i18n-keep: 書き出したファイルの見出し（src/lib/pages/markdown.ts と同じく文書の中身）
    "",
    `- ページ: ${window.location.origin}${window.location.pathname}`, // i18n-keep: 書き出したファイルの中身
    `- 書き出し: ${now}`, // i18n-keep: 書き出したファイルの中身
    `- 件数: 未解決 ${unresolved} 件 / 全 ${tops.length} 件`, // i18n-keep: 書き出したファイルの中身
  ];

  for (const priority of COMMENT_PRIORITIES) {
    const items = tops.filter((comment) => comment.priority === priority);
    if (items.length === 0) continue;

    const heading =
      priority === "good"
        ? `## いいね ${items.length} 件` // i18n-keep: 書き出したファイルの見出し
        : `## ${PRIORITY_LOOK[priority].label}（${defaultTranslate(`toolbox.priority.${priority}`)}） ${items.length} 件`; // i18n-keep: 書き出したファイルの見出し（言語で変えない）
    lines.push("", heading);
    items.forEach((comment, position) => {
      const status = comment.resolvedAt === null ? "未解決" : "解決済"; // i18n-keep: 書き出したファイルの中身
      const heading = comment.quote === null ? "（引用なし）" : `「${comment.quote}」`; // i18n-keep: 書き出したファイルの中身
      lines.push("", `### ${position + 1}. [${status}] ${heading}`);
      lines.push(
        `- ${comment.author.name} / ${fullTime(comment.createdAt)}` +
        "",
      );
      if (comment.body.length > 0) lines.push("", comment.body);
      for (const reply of listFeature.repliesOf(comment.id)) {
        lines.push("", `> **${reply.author.name}**: ${reply.body.replace(/\n/g, " ")}`);
      }
    });
  }

  return `${lines.join("\n")}\n`;
}

function exportMarkdown(): void {
  const name = state.slug.replace(/\//g, "-");
  download(`comments-${name}.md`, "text/markdown", toMarkdown());
}

function exportJson(): void {
  const name = state.slug.replace(/\//g, "-");
  const payload = {
    page: state.slug,
    exportedAt: new Date().toISOString(),
    comments: state.comments,
  };
  download(`comments-${name}.json`, "application/json", JSON.stringify(payload, null, 2));
}

// ---------------------------------------------------------------------------
// 描き直し
// ---------------------------------------------------------------------------

/** 知らせを並べ直す。新しいものが上。 */
function renderToasts(): void {
  if (toastStack === null) return;
  toastStack.replaceChildren();

  for (const item of toasts) {
    const card = el("div", `toast is-${item.state}`);
    card.appendChild(el("span", "toast-text", item.text));

    const retry = retryHandlers.get(item.id);
    if (item.state === "failure" && retry !== undefined) {
      const button = el("button", "toast-retry");
      button.type = "button";
      button.textContent = t("toolbox.common.retry");
      button.addEventListener("click", () => {
        toasts = dismissToast(toasts, item.id);
        retryHandlers.delete(item.id);
        renderToasts();
        retry();
      }, { signal: lifetime.signal });
      card.appendChild(button);
    }

    const close = el("button", "icon-button");
    close.type = "button";
    close.title = t("toolbox.common.close");
    close.appendChild(icon(ICON_CLOSE, ICON_SIZE.small));
    close.addEventListener("click", () => {
      const onClose = closeHandlers.get(item.id);
      toasts = dismissToast(toasts, item.id);
      retryHandlers.delete(item.id);
      closeHandlers.delete(item.id);
      renderToasts();
      if (onClose !== undefined) onClose();
    }, { signal: lifetime.signal });
    card.appendChild(close);

    toastStack.appendChild(card);
  }

  publishToastLane();
}

/**
 * 上端の知らせが占めている高さを、見た目の値として配る。
 *
 * これを配らないと、上げきった一覧が知らせの裏に潜り込み、
 * 「上には必ずページが見える」という約束が破れる。
 *
 * 測るのはここ 1 回だけ。知らせを描き直した直後で、形が確定している瞬間なので、
 * 指やキーボードの動きに振り回されることはない
 * （位置を毎回測り直していた頃のズレとは別種の話）。
 */
function publishToastLane(): void {
  if (root === null || toastStack === null) return;
  const host = root.host;
  if (!(host instanceof HTMLElement)) return;
  const height = toasts.length === 0 ? 0 : toastStack.offsetHeight;
  host.style.setProperty("--toast-lane", `${height}px`);
}

/**
 * 絞り込みと並べ替えの当たり判定用。
 *
 * 影の中の出来事は外から見ると入れ物にすり替わるので、外を押したかの判定は
 * 通り道（composedPath）の印で見る。道具箱の「その他」（MORE_MARK）と同じ理由。
 */
const LIST_MENU_MARK = "list-menu-hit";

/** 板の中身。コメント / 変更 / 版 / 共有範囲 を 1 枚で入れ替える。 */
function renderPanelBody(): void {
  if (listBox === null) return;

  if (state.view === "versions") {
    listBox.replaceChildren(historyFeature.versionsView());
    return;
  }
  if (state.view === "changes") {
    listBox.replaceChildren(historyFeature.changesView());
    return;
  }
  if (state.view === "access") {
    listBox.replaceChildren(sharingFeature.accessView());
    return;
  }
  if (state.view === "origin") {
    listBox.replaceChildren(originFeature.originView());
    return;
  }
  listFeature.renderList();
}

const PANEL_TITLES: Record<PanelView, string> = {
  comments: t("toolbox.panel.comments"),
  changes: t("toolbox.panel.changes"),
  versions: t("toolbox.panel.versions"),
  access: t("toolbox.panel.access"),
  origin: t("toolbox.panel.origin"),
};

function render(): void {
  if (lifetime.disposed) return;
  // 触ってよい人でなくなった（読み込み直して持ち主が変わった等）ら、開いたままにしない。
  // 板だけが残ると、押しても何も返らない画面を触らせることになる
  if (state.view === "access" && !sharingFeature.canManageAccess()) state.view = "comments";
  if (state.view === "origin" && (state.origin === null || !state.origin.stale || state.originJob !== null)) {
    state.view = "comments";
  }
  // 本文の印を、いま一覧に出ているものへそろえる。**組み立てるより前**に——
  // 一覧の並び（本文の順）は印の座標で測るので、張り替わっていないと前の並びで出る
  selectionFeature.syncMarks();
  const openCount = listFeature.topLevel().filter((comment) => comment.resolvedAt === null).length;
  renderBar(openCount);
  historyFeature.renderCompareBar();
  // 帯を組み立てたあとに測る（高さを決め打ちしない）
  historyFeature.applyCompareOffset();
  // 画面の下端を使えるのは 1 つだけ（「その他」の小窓 > ドック > 覗き見 > 選択の帯）。
  // 板が全面を覆っているときも道具箱はしまう
  const openAtBottom = {
    menu: moreMenuOpen,
    dock: selectionFeature.isDocked(),
    peek: selectionFeature.isPeeking(),
    selection: selectionFeature.selectionBar !== null && !selectionFeature.selectionBar.hidden,
  };
  if (bar !== null) bar.hidden = !toolbarVisible(openAtBottom, state.open && selectionFeature.isNarrow());
  originFeature.renderOriginHint();
  // バーは知らせが出るたびに中身ごと作り直される。⋯ のボタンも毎回別物になるので、
  // 開いている小窓を**いま出ているボタンに合わせ直す**。忘れると、消えた古いボタンの
  // 位置に小窓だけが取り残される。置き場所の決め方そのものは足さない（既定は下、
  // 入らなければ上。バーは画面の下端なので、ほぼ必ず上に返る）
  if (moreMenuOpen && moreButton !== null && bar !== null && selectionFeature.popover !== null) {
    const button = moreButton.getBoundingClientRect();
    const pill = bar.getBoundingClientRect();
    // 縦は器（丸い帯）から測る（ボタンから測ると、帯の上端と小窓の間が 2px になる）。
    // 横は ⋯ の右端にそろえる（顔のメニューと同じ寄せ方。真ん中に置くと帯の右端から 40px 飛び出す）
    selectionFeature.placePopover({ left: button.left, width: button.width, top: pill.top, bottom: pill.bottom });
    selectionFeature.popover.style.left = `${Math.max(POPOVER_PLACEMENT.edge, Math.round(button.right - selectionFeature.popover.offsetWidth))}px`;
  }

  if (panel !== null) {
    panel.hidden = !state.open;
    selectionFeature.applyPanelShape();
  }
  if (panelTitle !== null) panelTitle.textContent = PANEL_TITLES[state.view];
  if (state.view !== "comments") listMenuOpen = false;
  // まとめて選ぶのはコメントの一覧の上でだけ。別の板へ移ったら畳む
  if (state.view !== "comments" && listFeature.picking()) state.picked = null;
  // 書き出しと絞り込みはコメントを見ているときだけ意味がある
  if (exportButtons !== null) exportButtons.hidden = state.view !== "comments";
  listFeature.paintPickButton();
  listFeature.renderPickBar();
  // リンクのコピーは、道具箱に手が届かない狭い画面のときだけ
  if (narrowLink !== null) {
    narrowLink.hidden = !selectionFeature.isNarrow();
    paintCopyLinkButton(narrowLink, sharingFeature.linkCopied);
  }
  if (listMenuBox !== null && state.view !== "comments") listMenuBox.hidden = true;

  // 覗き見の中身も、他の状態と同じ描き直しで揃える。
  // ただし指で送っている最中は作り直さない（動きが飛ぶ）
  if (selectionFeature.peek.open && !selectionFeature.peekDragging && !selectionFeature.peekHandoff && !selectionFeature.peekSliding) selectionFeature.renderPeek();
  renderToasts();
  if (state.view === "comments") listFeature.renderListMenu();
  renderPanelBody();
}

// ---------------------------------------------------------------------------
// 組み立て
// ---------------------------------------------------------------------------

/**
 * 右下の道具箱。
 *
 * コメント・履歴・共有をそれぞれ浮かせると、画面の隅にボタンが増えていく。
 * 1 本にまとめ、名前は触れたときに出す。コメントだけ件数（未解決の数）を添える。
 */
function barButton(
  label: string,
  paths: readonly string[],
  onClick: () => void,
): HTMLButtonElement {
  const button = el("button", "bar-button");
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.appendChild(icon(paths, ICON_SIZE.medium));
  button.addEventListener("click", onClick, { signal: lifetime.signal });
  return button;
}

/**
 * ページを直す画面を開く。
 *
 * 開くのは 1 枚だけ。比べている最中なら先に抜ける（比べる帯と全面の画面が
 * 重なると、どちらの操作も届かなくなる）。板も畳んでから開く。
 */
async function startPageEdit(presenter?: EditorHooks["presenter"]): Promise<void> {
  if (root === null || editorActive()) return;
  readingNavigation?.close(false);
  if (historyFeature.isComparing()) historyFeature.exitCompare();
  selectionFeature.setOpen(false);
  await openPageEditor({
    pageSlug: state.slug,
    host: root,
    notify: (text) => sharingFeature.showNotice(text),
    fail: (text) => showError(text),
    restoreFocus: () => bar?.querySelector<HTMLButtonElement>("[data-editor-trigger]")?.focus({preventScroll:true}),
    onSaved: ({ baseVersionId }) => listFeature.stashEditReview(baseVersionId),
    onClosed: () => liveFeature.resume(),
    presenter,
  });
}

function renderBar(openCount: number): void {
  if (bar === null) return;
  bar.replaceChildren();

  const comments = barButton(t("toolbox.bar.comments"), ICON_COMMENT, () => {
    if (state.open && state.view === "comments") {
      selectionFeature.setOpen(false);
      return;
    }
    state.view = "comments";
    selectionFeature.setOpen(true);
  });
  if (state.open && state.view === "comments") comments.className = "bar-button is-open";
  // 件数は知らせであって飾りではない。0 のときは数字そのものを出さない
  // （無いことを「0」で知らせると、隣の絵柄だけのボタンより強く見える）
  if (openCount > 0) {
    comments.appendChild(el("span", "bar-count", String(openCount)));
    comments.setAttribute("aria-label", t("toolbox.bar.commentsCount", { count: openCount }));
  }
  bar.appendChild(comments);

  /*
   * スライドのプレゼン（スライドのページだけ）。保存済みの操作列（src/templates/deck.html の 1 段）は、道具箱のある画面では
   * 上端の現在地の行と重なって 2 段になるので出さず（src/widget/deck/deck.ts）、その釦をここから押す（src/widget/deck/edit/tools.ts）。
   * そのページでいちばん使う道具なので、文字起こしと同じく ⋯ にしまわず表に置く。
   * 出すのは向こうの釦が押せるときだけ（版の見比べ中・全部スキップのときは、向こうが出していない）。
   */
  const deckPresent = readDeckTools()?.present ?? null;
  if (deckPresent !== null) {
    bar.appendChild(barButton(t("toolbox.bar.present"), ICON_PLAY, () => deckPresent.click()));
  }

  // ここまでが「面を開く」道具、ここから先が「このページを変える・持ち出す」道具。群の境は区切り線 1 本
  bar.appendChild(el("span", "bar-divider"));

  /*
   * ページ本文をその場で直す入口。出すのはサーバーが「直してよい」と言った人
   * （features.edit。正本は src/lib/access/access.ts の canEditPage）だけで、ここで数え直さない。
   * 過去の版（?v=）を開いている間は出さない——直す土台は必ず最新の版なので、
   * 古い本文を見ながら押すと「見ているもの」と「直すもの」が食い違う。
   *
   * ⋯ の中にしまわず表に置く。本文を変えるただ 1 つの道具で、書ける人（作った人・管理者）には
   * コメントと並ぶ毎日の道具だから。読むだけの人の画面には元から出ない。
   */
  if (state.features.edit && historyFeature.loadedVersion === null) {
    const edit = barButton(t("toolbox.bar.edit"), ICON_EDIT, () => void startPageEdit());
    edit.setAttribute("data-editor-trigger", "");
    bar.appendChild(edit);
  }

  /*
   * 原本の取り込みの成り行き。取り込み中はボタンを消し、読み飛ばしてよい 1 行だけ残す。
   * 取り込む入口そのものは ⋯ の中（moreMenuSections）。
   */
  if (state.originJob !== null) {
    if (state.originJob.status === "running") {
      const line = el("a", "bar-status");
      line.href = state.originJob.url;
      line.target = "_blank";
      line.rel = "noopener noreferrer";
      line.textContent = t("toolbox.bar.importing");
      line.title = state.originJob.url;
      bar.appendChild(line);
    } else {
      bar.appendChild(el("span", "bar-status", t("toolbox.common.newVersion")));
      const reload = el("button", "bar-status is-action");
      reload.type = "button";
      reload.textContent = t("toolbox.bar.reload");
      reload.addEventListener("click", () => window.location.reload(), { signal: lifetime.signal });
      bar.appendChild(reload);
    }
  }

  barLink = barButton(t("toolbox.common.copyLink"), ICON_LINK, () => void sharingFeature.copyPageUrl());
  paintCopyLinkButton(barLink, sharingFeature.linkCopied);
  bar.appendChild(barLink);

  /*
   * 残りの道具は ⋯ に畳む（毎日使うのはコメントとリンクだけで、ほかは同じ重さで並べると 2 つが埋もれる）。
   * 畳むものが 1 つも無い人には ⋯ そのものを出さない（押しても何も出ないボタンを置かない）。
   */
  moreButton = moreMenuSections().length > 0 ? buildMoreButton() : null;
  if (moreButton !== null) bar.appendChild(moreButton);
  else if (moreMenuOpen) selectionFeature.hidePopover();
}

// ---------------------------------------------------------------------------
// 見たページを控える
// ---------------------------------------------------------------------------

/**
 * このページを見たことを控える。控え先は、いま誰として見ているかで変わる。
 *
 *   会社の人        … アカウントの側（/api/views へ投げっぱなし。端末をまたいで残る）
 *   それ以外の人    … ブラウザの中だけ。しかも公開ページに限る
 *
 * 呼ぶのは**名乗りが届いた直後の 1 か所だけ**（settleStart。道具箱を組み立てない
 * 社外の人のぶんも、答えが届いたその場で同じここを通す）。取りに行く処理そのもの
 * （refresh）には置かない——あれは版を見比べている最中にも、タブに戻ってくるたびにも
 * 走るので、「ページを見た」という出来事とは数が合わなくなる。
 *
 * ブラウザの中に書くのは 2 つとも当てはまるときだけ:
 *
 *   1. 公開ページであること
 *      社内ページの名前をブラウザに残さない。共用のパソコンで、ログアウトしたあとに
 *      この画面を開いた次の人へ、社内ページの題が並んでしまう。
 *   2. 会社の人として見ていないこと
 *      ログイン中はアカウントの側だけに寄せる（両方に書くと、共用のパソコンで
 *      前の人が見た公開ページが、次にログインした人の画面へ混ざる）。
 *
 * 「記録を残さない」が立っていたら、どちらへも書かない（**投げる前に止める**）。
 * このタブで控え済みの印があるときも何もしない。読み込み直しの連打や、アドレス欄の
 * 予測による先読み（本人はまだ見ていない）でも回数が膨らむのを防ぐ。
 */
function rememberView(): void {
  // 一覧で行に触れたときの先読み（Speculation Rules の prerender・docs/design/app-speed.md）で裏で開いている間は、
  // 本人はまだ見ていない。表に出た瞬間（prerenderingchange）に控える。表に出ないまま捨てられたら控えない
  // 型の辞書（lib.dom）にまだ無い性質なので、在るときだけ真偽で読む
  if (Reflect.get(document, "prerendering") === true) {
    document.addEventListener("prerenderingchange", () => rememberView(), { once: true });
    return;
  }
  if (viewedPaused(readStored(VIEWED_OFF_KEY))) return;

  const mark = viewedMarkKey(state.slug);
  if (readSession(mark) !== null) return;
  writeSession(mark, "1");

  /*
   * 会社の人の分はアカウントの側へ。投げっぱなしにしてあるので、届かなくても
   * 読む人の画面では何も起きない（見ることそのものを、控えの都合で止めない）。
   * 送るのは呼び名だけで、書いてよいかは受ける側が門を通して決める。
   */
  if (state.viewer !== null && state.viewer.kind === "member") {
    // 入場券で読んでいる（書き込めない）ときは送らない。見た記録も書き込みの口で、入場券を受けない
    if (state.features.write) void recordView(state.slug);
    return;
  }

  if (state.visibility !== "public") return;

  // 題が空のページもあるので、そのときは行き先をそのまま名前にする（無題の行を作らない）
  const title = document.title.trim();
  const href = window.location.pathname;
  const next = recordViewed(
    parseViewed(readStored(VIEWED_STORAGE_KEY)),
    { href, title: title.length > 0 ? title : href },
    new Date().toISOString(),
  );
  writeStored(VIEWED_STORAGE_KEY, serializeViewed(next));
}

// ---------------------------------------------------------------------------
// 道具箱の「その他」（バーの右端の ⋯）
// ---------------------------------------------------------------------------

/**
 * バーの右端の ⋯ に付ける印。
 *
 * 押された先が ⋯ かどうかの見分け（attachPageEvents）と、原本の知らせの置き場所（comment-widget-origin.ts）が
 * この 1 語を見る。
 */
const MORE_MARK = "bar-more";

/** ⋯ の小窓の 1 行。押すと小窓を畳んでから動く。 */
type MoreRow = {
  readonly label: string;
  readonly icon: readonly string[];
  readonly run: () => void;
};

/** ⋯ の小窓の 1 段。段の間は余白で分けるだけで、見出しは置かない（行が 3〜5 本しか無いのに見出しが行より強く見える）。 */
type MoreSection = {
  readonly id: "page" | "reading";
  readonly rows: readonly MoreRow[];
};

/**
 * ⋯ の中身。**行が 0 の段は出さず、段が 0 なら ⋯ そのものを出さない**（renderBar）。
 *
 * 出す・出さないの条件は、バーに並べていたときのものをそのまま持ってきている
 * （履歴は features.history、共有範囲は canManageAccess、Slack は features.slack、プロンプターはベータの旗）。
 * 条件をここで数え直さない。
 *
 *   このページ … 履歴（上端の「いつ・何版目」が出ていない画面だけ）・原本を取り込む・共有範囲
 *   読み方     … スライドの読み方（発表者画面・一覧・ノート）
 */
function moreMenuSections(): MoreSection[] {
  const page: MoreRow[] = [];
  const reading: MoreRow[] = [];

  /*
   * 履歴は上端の現在地の行の「いつ・何版目」を押しても開く。あちらが出ている画面では同じ入口を 2 つにしない。
   * 出ていない画面（iOS アプリの中・過去の版を開いているとき・版がまだ届いていないとき）だけ、ここに置く。
   */
  if (state.features.history && !(locationBar?.versionShowing() ?? false)) {
    page.push({ label: t("toolbox.bar.history"), icon: ICON_HISTORY, run: () => void historyFeature.openHistory() });
  }

  /*
   * 原本からの取り込み。出す条件は全部そろったときだけ（押せない行を出さない）。
   * GitHub で「もう取り込み済み」と分かったときは出さない。読めなかったときは出す
   * （取り込みは Cloud Agent が原本を clone する）。門なし公開の入口（/p）と過去の版では出さない。
   */
  if (
    originFeature.originEntryAllowed() &&
    state.origin !== null &&
    state.origin.stale &&
    state.originJob === null
  ) {
    page.push({
      label: document.body.hasAttribute("data-deck") ? t("toolbox.bar.deckOrigin") : t("toolbox.bar.origin"),
      icon: ICON_ORIGIN,
      run: () => originFeature.openOriginConfirm(),
    });
  }

  // 誰に見せるかの設定。持ち主と管理者にしか出さない（押せない行を見せない）
  if (sharingFeature.canManageAccess()) {
    page.push({ label: t("toolbox.bar.access"), icon: ICON_USERS, run: () => void sharingFeature.openAccess() });
  }

  // この資料を複製。スライドのいまの版を、直せる人（持ち主と管理者）が開いているときだけ（過去の版は写さない）
  const versionToCopy = state.currentVersion;
  if (sharingFeature.canManageAccess() && document.body.hasAttribute("data-deck") && historyFeature.loadedVersion === null && versionToCopy !== null) {
    page.push({ label: t("toolbox.bar.duplicateDeck"), icon: ICON_COPY, run: () => void duplicateDeck(state.slug, versionToCopy, showError) });
  }

  /*
   * スライドの読み方（スライドのページだけ）。保存済みの操作列の釦をここから押す（src/widget/deck/edit/tools.ts）。
   * 行の言い方は実行部が立てる属性から決める（一覧を開いていれば「閉じる」、ノートを隠していれば「表示」）。
   * 発表者画面は操作の列の入口と同じ処理（deck-present-launch.ts）で開き、閉じたら ⋯ へ焦点を返す。
   */
  const deckTools = readDeckTools();
  if (deckTools !== null) {
    if (deckTools.presenter !== null) {
      reading.push({
        label: t("decks.presentLaunch.presenter"),
        icon: ICON_PRESENTATION,
        run: () => openPresenterView(() => bar?.querySelector<HTMLButtonElement>(`.${MORE_MARK}`)?.focus({ preventScroll: true })),
      });
    }
    const overview = deckTools.overview;
    if (overview !== null) {
      reading.push({
        label: deckTools.overviewOpen ? t("toolbox.bar.overviewClose") : t("toolbox.bar.overview"),
        icon: ICON_LAYOUT_GRID,
        run: () => overview.click(),
      });
    }
    const notes = deckTools.notes;
    if (notes !== null) {
      reading.push({
        label: deckTools.notesHidden ? t("toolbox.bar.notesShow") : t("toolbox.bar.notesHide"),
        icon: ICON_NOTEBOOK_TEXT,
        run: () => notes.click(),
      });
    }
  }

  const sections: MoreSection[] = [];
  if (page.length > 0) sections.push({ id: "page", rows: page });
  if (reading.length > 0) sections.push({ id: "reading", rows: reading });
  return sections;
}

/**
 * バーの右端の ⋯。押すと「その他」の小窓が開く。
 * ほかのボタンと同じ土台（barButton）を通し、開くものがあること・いま開いているかを機械にも伝える。
 */
function buildMoreButton(): HTMLButtonElement {
  const button = barButton(t("toolbox.bar.more"), ICON_MORE, () => toggleMoreMenu());
  button.classList.add(MORE_MARK);
  if (moreMenuOpen) button.classList.add("is-open");
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", moreMenuOpen ? "true" : "false");
  return button;
}

/** 小窓に並べる中身。段は余白で分け、行は絵柄と名前の 1 行。 */
function moreMenuNodes(): HTMLElement[] {
  const nodes: HTMLElement[] = [];
  for (const section of moreMenuSections()) {
    const group = el("div", "menu-group");
    group.dataset.section = section.id;
    for (const row of section.rows) {
      const button = el("button", "button menu-row");
      button.type = "button";
      button.appendChild(icon(row.icon, ICON_SIZE.medium));
      button.appendChild(el("span", "menu-row-label", row.label));
      button.addEventListener("click", () => {
        // 先に畳む（畳む処理が焦点を ⋯ へ返す）。そのあとで道具を動かす——板が開くものは板へ焦点が移る
        selectionFeature.hidePopover();
        row.run();
      }, { signal: lifetime.signal });
      group.appendChild(button);
    }
    nodes.push(group);
  }
  return nodes;
}

/**
 * 「その他」の小窓を開く。
 *
 * **入れ物は文章を選んだときの小窓と同じものを使い回す。** 置き場所を決める処理・
 * 指の受け取り・畳む処理が既に 1 本に揃っているので、2 つ目の入れ物を作ると、
 * どれか 1 つが必ず取り残される。付けるのは見た目の印（is-menu）1 つだけで、
 * 幅は「詰めた姿」（is-compact）のものをそのまま借りる（狭い小窓は既にある）。
 */
function showMoreMenu(): void {
  if (selectionFeature.popover === null || moreButton === null) return;
  // 同じ入れ物なので、書きかけが開いていれば先に畳む。
  // 書きかけがあっても畳むのは、外を押したとき・Escape とちょうど同じ扱い
  selectionFeature.hidePopover();
  // 下端を使うのは 1 つだけ。選択の帯が出ていれば引っ込める
  selectionFeature.hideSelectionBar();

  moreMenuOpen = true;
  selectionFeature.popover.className = "popover is-compact is-menu";
  selectionFeature.nameSurface(selectionFeature.popover, t("toolbox.bar.more"));
  selectionFeature.popover.replaceChildren(...moreMenuNodes());
  // 置き場所を合わせるのは、バーを描き直して ⋯ のボタンが確定したあと（render の末尾）
  render();
}

/** ⋯ を押した。開いていれば畳み、閉じていれば開く。 */
function toggleMoreMenu(): void {
  if (moreMenuOpen) {
    selectionFeature.hidePopover();
    return;
  }
  showMoreMenu();
}

function buildPanel(): HTMLElement {
  const box = el("aside", "panel");
  // 板の名前は見出しから採る（部品の一覧で、名前の無い枠にしない）
  box.setAttribute("aria-labelledby", "panel-title");
  box.style.width = `${state.width}px`;

  const grip = el("div", "grip");
  grip.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    grip.setPointerCapture(event.pointerId);
    const move = (moved: PointerEvent): void => selectionFeature.setWidth(window.innerWidth - moved.clientX);
    const stop = (): void => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", stop);
    };
    grip.addEventListener("pointermove", move, { signal: lifetime.signal });
    grip.addEventListener("pointerup", stop, { signal: lifetime.signal });
  }, { signal: lifetime.signal });
  box.appendChild(grip);

  // 狭い画面での高さ変えのつまみ。覗き見カードのものと同じ見た目
  const grabArea = el("div", "sheet-grab-area");
  grabArea.appendChild(el("div", "peek-grab"));
  selectionFeature.attachSheetDrag(grabArea);
  box.appendChild(grabArea);

  const head = el("div", "panel-head");
  panelTitle = el("h2", "panel-title", t("toolbox.panel.comments"));
  panelTitle.id = "panel-title";
  head.appendChild(panelTitle);
  head.appendChild(el("span", "spacer"));

  exportButtons = el("span", "head-tools");

  listMenuButton = el("button", `icon-button ${LIST_MENU_MARK}`);
  listMenuButton.type = "button";
  listMenuButton.title = t("toolbox.list.menu");
  listMenuButton.setAttribute("aria-label", t("toolbox.list.menu"));
  listMenuButton.setAttribute("aria-haspopup", "menu");
  listMenuButton.setAttribute("aria-expanded", "false");
  listMenuButton.appendChild(icon(ICON_LIST_FILTER, ICON_SIZE.medium));
  listMenuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    listMenuOpen = !listMenuOpen;
    render();
  }, { signal: lifetime.signal });
  exportButtons.appendChild(listMenuButton);

  /*
   * まとめて選ぶ。漏斗（見え方を変える口）の隣に置く。
   *
   * 頭の並びは「見る → 操作する → 持ち出す」の順。押すと入り、もう一度押すと抜ける
   * （開け閉めの作りは隣の漏斗と同じ）。出す条件は canPick が決める。
   */
  pickButton = el("button", "icon-button");
  pickButton.type = "button";
  pickButton.title = t("toolbox.list.pick");
  pickButton.setAttribute("aria-label", t("toolbox.list.pick"));
  pickButton.setAttribute("aria-pressed", "false");
  pickButton.appendChild(icon(ICON_LIST_CHECKS, ICON_SIZE.medium));
  pickButton.addEventListener("click", (event) => {
    event.stopPropagation();
    if (listFeature.picking()) listFeature.stopPicking();
    else listFeature.startPicking();
  }, { signal: lifetime.signal });
  exportButtons.appendChild(pickButton);

  // 持ち出す 2 つは 1 かたまりで持つ（まとめて選んでいる間はそろって引っ込める）
  exportTools = el("span", "head-tools");

  const markdown = el("button", "icon-button");
  markdown.type = "button";
  markdown.title = t("toolbox.panel.exportMarkdown");
  markdown.appendChild(icon(ICON_FILE_TEXT, ICON_SIZE.medium));
  markdown.addEventListener("click", () => exportMarkdown(), { signal: lifetime.signal });
  exportTools.appendChild(markdown);

  const json = el("button", "icon-button");
  json.type = "button";
  json.title = t("toolbox.panel.exportJson");
  json.appendChild(icon(ICON_BRACES, ICON_SIZE.medium));
  json.addEventListener("click", () => exportJson(), { signal: lifetime.signal });
  exportTools.appendChild(json);
  exportButtons.appendChild(exportTools);
  head.appendChild(exportButtons);

  // 狭い画面では板が全面を覆い、右下の道具箱に手が届かない。
  // いちばん使うリンクのコピーだけ、ここにも置く
  narrowLink = el("button", "icon-button");
  narrowLink.type = "button";
  paintCopyLinkButton(narrowLink, sharingFeature.linkCopied);
  narrowLink.addEventListener("click", () => {
    void sharingFeature.copyPageUrl();
  }, { signal: lifetime.signal });
  head.appendChild(narrowLink);

  const close = el("button", "icon-button");
  close.type = "button";
  close.title = t("toolbox.common.close");
  close.appendChild(icon(ICON_CLOSE, ICON_SIZE.medium));
  close.addEventListener("click", () => selectionFeature.setOpen(false), { signal: lifetime.signal });
  head.appendChild(close);
  box.appendChild(head);

  listMenuBox = el("div", LIST_MENU_MARK);
  listMenuBox.hidden = true;
  box.appendChild(listMenuBox);

  listBox = el("div", "list");
  box.appendChild(listBox);

  /*
   * まとめて動かす操作の置き場。**板の中の足**にする。
   *
   * 画面の下端は「⋯ の小窓 > ドック > 覗き見 > 選択の帯」で既に取り合いに
   * なっているので、そこへ 5 つ目を足さない。板の中に入れておけば、狭い画面で
   * 板が下から出てくる動きにもそのまま付いてくる。
   */
  pickBar = el("div", "pick-bar");
  pickBar.hidden = true;
  box.appendChild(pickBar);

  return box;
}

function attachPageEvents(): void {
  // 押された先が自分の画面の中か。開け閉めの判定はどこでもこれ 1 つを使う
  const inOurUi = (target: EventTarget | null): boolean =>
    target instanceof Element && target.closest(HOST_TAG) !== null;

  /**
   * 押し終わりを見て、開けるものは開け、外を押されたものは畳む。
   *
   * **開いているものを畳む入り口はここ 1 か所だけ**にしてある。覗き見カードと小窓は
   * 同じ入れ物を使い回しているので、別々に見張ると片方が片方を消してしまう。
   */
  document.addEventListener("click", (event) => {
    const mark = markAt(event.target);
    if (mark !== null) {
      const id = mark.dataset.commentId;
      if (id === undefined) return;
      event.preventDefault();
      // この click そのものを「開いた操作」として覚えさせる
      selectionFeature.selectFromMark(id, event);
      return;
    }
    const insideOurUi = inOurUi(event.target);
    // 覗き見カードは「どの操作で開いたか」を覚えている。畳むかはそちらの決まりに任せる。
    // 先にここで振り分けないと、開いたのと同じ 1 回の操作で下の行が消してしまう
    if (selectionFeature.peek.open) {
      if (!afterTap(selectionFeature.peek, event, insideOurUi).open) selectionFeature.hideMarkPeek();
      return;
    }
    // 「その他」の小窓は、**⋯ そのもの以外**を押されたら畳む。外を押した場合・小窓の中の
    // 道具を押した場合・バーの隣のボタンを押した場合が、この 1 本で片付く。
    // 下の「自分の画面の中なら何もしない」より**前**に置くこと。後ろに置くと、
    // 板が開いた上に小窓が居残る。
    //
    // ⋯ かどうかは通り道（composedPath）を印で見る。理由は 2 つ。
    //   1. 影の中の出来事は、外から見ると押された先が入れ物にすり替わるので、
    //      event.target ではボタンまで辿れない
    //   2. **いま持っているボタンと同じものかでは見分けられない。** ⋯ を押すと、
    //      同じ 1 回の押しの途中でバーが作り直され、控えは新しいボタンに入れ替わる。
    //      通り道に残っているのは捨てられた古いほうなので、開いた直後に畳んでしまう
    const onMore = event
      .composedPath()
      .some((node) => node instanceof Element && node.classList.contains(MORE_MARK));
    if (moreMenuOpen && !onMore) {
      selectionFeature.hidePopover();
      return;
    }
    if (listMenuOpen && !listFeature.onListMenu(event)) {
      listMenuOpen = false;
      render();
    }
    if (insideOurUi) return;
    // 小窓の外を押したら畳む。書きかけがあっても畳む（Escape と揃える）。
    //
    // 押した瞬間（pointerdown）ではなく押し終わり（click）で見るのは 2 つの理由から。
    //   1. 小窓は「選び終わったかの見張り」が落ち着いてから出る。選び終えた操作の
    //      click はその前に済んでいるので、出た小窓を自分の操作で消してしまわない
    //   2. 選択のつまみを引きずる操作は click を起こさない。押した瞬間で見ると、
    //      つまみを掴んだだけで消える（下の pointerdown が印を立てる、あの操作）
    if (selectionFeature.popover !== null && !selectionFeature.popover.hidden) selectionFeature.hidePopover();
  }, { signal: lifetime.signal });

  // 印の上に指した / 離した。触れているものだけ半段濃くする
  document.addEventListener("mouseover", (event) => {
    const mark = markAt(event.target);
    if (mark !== null) hoverMark(mark);
  }, { signal: lifetime.signal });
  document.addEventListener("mouseout", (event) => {
    const mark = markAt(event.target);
    if (mark === null) return;
    const id = mark.dataset.commentId;
    const comment = state.comments.find((item) => item.id === id);
    if (comment !== undefined) styleMark(mark, comment, comment.id === state.activeId);
  }, { signal: lifetime.signal });

  /**
   * 文章を選び終わったかを見張る。
   *
   * マウスの上げ下げだけを見ていると、指の長押しで選んだときに何も起きない
   * （スマホでは mouseup が来ない）。そこで選択そのものの変化を見て、
   * しばらく落ち着いたら入り口を出す。つまみを動かしている最中は出さない。
   */
  document.addEventListener("selectionchange", () => {
    // 選択が解けた瞬間は待たずに引っ込める。
    // 消えた文章に対する入り口が居残ると、何に対する操作なのか分からなくなる
    const selection = window.getSelection();
    if (selection === null || selection.isCollapsed) selectionFeature.hideSelectionBar();
    selectionFeature.scheduleSelectionCheck();
  }, { signal: lifetime.signal });

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (inOurUi(event.target)) return;
      // つまみを掴んでいる間は出さない
      selectionFeature.adjustingSelection = true;
      lifetime.clearTimeout(selectionFeature.selectionTimer);
    },
    { capture: true, signal: lifetime.signal },
  );

  // 掴んでいる印は、どこで指を離しても必ず下ろす。
  // 自分の画面の上で離されたときに下ろし忘れると、以降ずっと入り口が出なくなる。
  const releaseSelection = (target: EventTarget | null): void => {
    selectionFeature.adjustingSelection = false;
    if (inOurUi(target)) return;
    selectionFeature.scheduleSelectionCheck();
  };

  document.addEventListener("pointerup", (event) => releaseSelection(event.target), { signal: lifetime.signal });
  document.addEventListener("pointercancel", () => releaseSelection(null), { signal: lifetime.signal });
  // マウス操作は今までどおりの速さで反応させる
  document.addEventListener("mouseup", (event) => releaseSelection(event.target), { signal: lifetime.signal });

  // 1 文字の近道は入れない（日本語を打っている最中に誤って発動するため）。
  // 比較を抜ける操作だけ、逃げ道として Escape に載せる
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (selectionFeature.isPeeking()) {
      selectionFeature.hideMarkPeek();
      return;
    }
    if (selectionFeature.draft !== null && selectionFeature.isNarrow()) {
      selectionFeature.discardDraft();
      return;
    }
    if (listMenuOpen) {
      listFeature.closeListMenu();
      listMenuButton?.focus();
      return;
    }
    // 「その他」の小窓もここで畳まれる（小窓と同じ入れ物なので、行を足す必要がない）。
    // 焦点を ⋯ へ返すのは畳む処理の持ちぶん
    const hadPopover = selectionFeature.popover !== null && !selectionFeature.popover.hidden;
    if (hadPopover) selectionFeature.hidePopover();
    selectionFeature.hideSelectionBar();
    if (!hadPopover && historyFeature.isComparing()) historyFeature.exitCompare();
  }, { signal: lifetime.signal });

  // ページを動かし始めたらキーボードを畳む（追いかけずに畳む、が方式）
  selectionFeature.attachKeyboardDismiss();

  // 読み直しの時機（戻ったとき・見ている間の定期）は live.ts ただ 1 つが決める
  liveFeature.start();
  window.addEventListener("resize", () => selectionFeature.handleResize(), { signal: lifetime.signal });
  // キーボードの出入りは resize、見えている範囲のずれは scroll で知らされる。
  // 両方を見ないと、出た瞬間だけ合っていて、そのあとずれたままになる
  // キーボードの出入りは resize、見えている範囲のずれは scroll で知らされる。
  // どちらも動いている途中で来ることがあるので、そのあと数コマ追い続ける
  const followViewport = (): void => {
    selectionFeature.applyViewportHeight();
    selectionFeature.settleComposeDock();
  };
  window.visualViewport?.addEventListener("resize", followViewport, { signal: lifetime.signal });
  window.visualViewport?.addEventListener("scroll", followViewport, { signal: lifetime.signal });
  window.addEventListener("hashchange", () => openLinkedComment(), { signal: lifetime.signal });
  // 戻る・進むで、比べている状態が URL どおりに出入りする
  window.addEventListener("popstate", () => historyFeature.onPopState(), { signal: lifetime.signal });
  window.addEventListener("beforeunload", () => {
    // 離れる合図は「離れかけた」だけでも飛ぶ（mailto: や download 付きのリンクを
    // 押したときは、合図だけ飛んでページは残る）。だから本文の印を直接掃かない。
    // 書きかけは持ち主に畳ませ、確定した印だけを外す（dropDraft の注記）
    selectionFeature.dropDraft();
    clearHighlights();
    clearRedline();
  }, { signal: lifetime.signal });
  // 明暗が切り替わったら、ページ本体に直接書いた赤入れを塗り直す
  // （影の中の CSS と違い、こちらは自動では切り替わらない）
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const compare = state.compare;
    if (compare === null || compare.diff === null) return;
    repaintRedline(compare.diff.changes, compare.activeIndex);
  }, { signal: lifetime.signal });
}

/**
 * URL の頭で、社内の入口か公開の入口かが決まる（/internal/… と /public/…）。
 *
 * これは**入口の見分け**で、ページの呼び名ではない。道具箱をすぐ組み立ててよいか
 * （社内の入口なら本文が出ている時点で会社の人）の判断にだけ使う。
 * 呼び名は URL から作らない——下の `pageSlugFromTag` を見ること。
 */
function visibilityOf(path: string): PageVisibility | null {
  if (path.startsWith("/internal/") || /^\/history\/(internal|public)\//.test(path)) return "internal";
  if (path.startsWith("/public/")) return "public";
  return null;
}

/**
 * このページの呼び名。**配信側が読み込みの札に書き入れたものだけを信じる。**
 *
 * URL の頭から組み立てない。社内として投稿したページを公開に切り替えると、
 * 呼び名は `internal/…` のままで URL は `/public/…` になる（呼び名は素材の置き場所を
 * 兼ねているので動かせない）。URL から作ると、台帳に無い呼び名（`public/…`）へ
 * コメントを付けようとして、道具箱が丸ごと動かなくなる。
 *
 * 読むのは印つきの行き先を名乗っている札だけ。ページ本体が同じ形の札を書いていても
 * 拾わない（呼び名を書き換えられる道を残さない——サーバーは受け取った呼び名で
 * 門を通すので、他人のページの呼び名を書けば断られるだけだが、断られる筋合いの
 * ない往復を作らない）。
 */
function pageSlugFromTag(): string | null {
  const tag = document.querySelector('script[src^="/comments-widget.js"][data-page]');
  const named = tag === null ? null : tag.getAttribute("data-page");
  return named !== null && named.length > 0 ? named : null;
}

/**
 * 現在地の行（location-bar.ts）を出す。**出すのは会社の人の画面だけ**——戻る先（一覧）に入れるのが会社の人だけなので。
 *
 *   社内の入口（/i・/h）… 本文が出ている時点で会社の人。答えを待たずに出す（待つと、開いたあとで本文が 1 行ぶん下がる）
 *   それ以外            … 名乗りが届いて、会社の人だと分かってから
 *
 * 個人配布版は、招かれた人も社内の入口から
 * 読むので、名乗りを待つ。
 */
function showLocationBar(when: "at-once" | "identified"): void {
  const member = state.viewer !== null && state.viewer.kind === "member";
  const sure = when === "identified" ? member : (state.visibility === "internal" && !state.personal) || insideWindowTitlebar();
  if (sure) locationBar = mountLocationBar() ?? locationBar;
  showCurrentVersion();
  showFavorite();
  // 顔は名乗りが届いてから（届く前に輪郭を出すと、答えが来た瞬間に頭文字へ変わって見える）
  if (state.viewer !== null) showSelf();
}

/**
 * 現在地の行の右端の顔と、そこから開くメニュー（サイドバーを畳んだもの）。
 *
 * 描くのは**いま届いている名乗りだけ**から（`/api/comments` の答えに載っている viewer。名乗りを読む口を増やさない）。
 * 名乗りが届いたとき（applyLoaded）・切れたとき（401）に描き直す。届く前は顔そのものを出さない。
 * 行き先の名前は location-bar.ts が `src/lib/workspace/places.ts` から引く。
 */
function showSelf(): void {
  locationBar?.showSelf(state.viewer, () => void signOut());
}

/**
 * ログアウト。サイドバーの「ログアウト」と同じ Auth.js の口（`POST /api/auth/signout`）へ、合言葉を添えて form で送る。
 * 送り先はログインの画面（サイドバーと同じ `/signin`）。合言葉が取れなければ何もしない（断りは知らせで出す）。
 */
async function signOut(): Promise<void> {
  const result = await loadSignOutToken();
  if (lifetime.disposed) return;
  if (!result.ok) {
    handleFailure(result);
    return;
  }
  const form = el("form");
  form.method = "post";
  form.action = "/api/auth/signout";
  for (const [name, value] of [["csrfToken", result.value], ["callbackUrl", "/signin"]] as const) {
    const input = el("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  form.hidden = true;
  document.body.appendChild(form);
  form.submit();
}

/**
 * 現在地の行の星（このページを自分のお気に入りに入れているか）。
 *
 * 出すのはサーバーの答えに載っているときだけ（会社の人が自分で開いている社内のページ。入場券で読む人・
 * リポジトリの文書には載らない）。押すと一覧の行と同じ口で付け外しし、答えが来るまで星は動かさない
 * （一覧へ戻ったときの星と食い違わない）。
 */
function showFavorite(): void {
  locationBar?.showFavorite(state.favorite, () => void toggleFavorite());
}

let favoriteSaving = false;
async function toggleFavorite(): Promise<void> {
  if (favoriteSaving || state.favorite === null) return;
  favoriteSaving = true;
  const next = !state.favorite;
  const result = await saveFavorite(state.slug, next);
  favoriteSaving = false;
  if (lifetime.disposed) return;
  if (!result.ok) {
    handleFailure(result);
    return;
  }
  state.favorite = next;
  showFavorite();
}

let locationBar: LocationBar | null = null;
/** 現在地の行に「いつ・何版目」を出した（出しに行った）版の目印。同じ版を 2 度取りに行かない。 */
let versionShownFor: string | null = null;

/**
 * 現在地の行の右端に、いま出ている版が「いつの・何版目か」を出す。
 *
 * 出すのは履歴を見てよい人（`features.history`）の画面で、**いまの版を見ているときだけ**。
 * `?v=` で過去の版を開いているときは、上の版の帯がその版のことを言っているので、ここは黙る。
 * 本文を直して版が進んだら（読み込み直しで目印が変わったら）取りに行き直す。
 */
function showCurrentVersion(): void {
  const bar = locationBar;
  const version = state.currentVersion;
  if (bar === null) return;
  if (version === null || !state.features.history || historyFeature.loadedVersion !== null) {
    versionShownFor = null;
    bar.showVersion(null, () => undefined);
    return;
  }
  if (versionShownFor === version) return;
  versionShownFor = version;
  void loadLatestVersion(state.slug).then((result) => {
    if (lifetime.disposed || versionShownFor !== version) return;
    // 取りに行っている間に版が進んでいたら、出さない（次の読み込み直しで出し直す）
    if (!result.ok || result.value === null || result.value.sha !== version) {
      versionShownFor = null;
      return;
    }
    bar.showVersion(result.value, () => void historyFeature.openHistory());
    // 上端に履歴の入口が出たので、⋯ の中の「履歴」を引っ込める（同じ入口を 2 つにしない）
    render();
  });
}

/**
 * 立ち上げ。
 *
 * **道具箱を出すのは会社の人の画面だけ。** 出してよい相手かの見極め方は、
 * ページの見せ方で変わる:
 *
 *   社内ページ（/i） … その本文が出ている時点で門を通っている＝会社の人。すぐ組み立てる
 *   公開ページ（/p） … 社外の人も読む。**答えが来るまで何も作らない**
 *
 * 公開ページで先に組み立てないのは、記事だけを読む人の画面に道具箱が一瞬出てから
 * 消えるのを避けるため（消える前に押せてしまうし、そもそも見せる筋合いが無い）。
 * 配る紙は誰にでも同じものなので、出し分けはここでしかできない。
 */
function start(): void {
  const path = window.location.pathname;
  const visibility = visibilityOf(path);
  if (visibility === null) return;
  if (document.querySelector(HOST_TAG) !== null) return;

  // ページの呼び名には見せ方を含める（例: public/guide/intro）。
  // コメント 1 件を見ただけで、社内のものか公開のものかが分かるようにするため。
  // 呼び名は配信側が札に書いてくる。書かれていなければ何も組み立てない——
  // URL から組み直すと、公開に切り替えたページで別のページの呼び名になる。
  const named = pageSlugFromTag();
  if (named === null) return;
  const rest = decodeURIComponent(path.replace(/^\/(?:internal|public|history\/(?:internal|public))\//, "")).replace(/\/+$/, "");
  if (rest.length === 0) return;
  state.personal = document.querySelector('script[src^="/comments-widget.js"][data-edition="personal"]') !== null;
  state.visibility = visibility;
  state.slug = named;
  // いま出ている本文がどの版かは、開いたときの URL が決めている
  historyFeature.loadedVersion = historyFeature.asSha(historyFeature.urlParams().get("v"));

  // 図の元の文字を控える。**ここより後ろへ動かせない**——図の道具はページの
  // 読み込みが終わった合図で描き始め、そのときに元の文字を消してしまう。
  // 控えられるのは、その前に通るこの 1 か所だけ（書き出しがここを読む）
  keepMermaidSource(document);

  // スライドのページなら、プレゼン中に引っ込むための規則を先に置く（属性 1 つを見るだけ）
  mountDeckStyles();
  // スライドの公開の補足を本文に並べる部品は、スライドのページでだけ読む。読み終えたら印を組み直す
  void prepareDeckSupplements(() => { if (bar !== null) render(); });
  // 発表者画面の入口。社外の人が見る公開ページでも使えるよう、道具箱の答えを待たない
  mountDeckPresenterLauncher({
    // 本文を直せる人（src/lib/access/access.ts の canEditPage）は、ノートを直せる発表者画面を開く。
    // 答えが届く前・道具箱を持たない社外の人・過去の版を見ているときは、読むだけの発表者画面。
    editable: () => root !== null && state.features.edit && historyFeature.loadedVersion === null && !editorActive(),
    openEditable: (presenter) => startPageEdit(presenter),
  });

  // PDF ボタンの置き換え。道具箱より先にやる（公開ページでも、元からある口はすぐ使える）
  bindExportSource({ comments: () => state.comments });
  mountPageExport();
  // 配信のときに空けておいた場所を外し、同じ処理の中で本物を置く（間に描画が挟まらないので本文は動かない・src/lib/first-paint/chrome.ts）
  releaseFirstPaintChrome();
  // 現在地の行は、清書の目次より先に置く（目次は、上にある帯の高さを見て自分の置き場所を決める）
  showLocationBar("at-once");
  readingNavigation = mountReadingNavigation({ onDialogChange: hideToolsWhileReadingDialog });

  if (visibility === "internal") {
    build();
    void refresh().then(settleStart);
    return;
  }

  void loadComments(state.slug).then((result) => {
    if (lifetime.disposed) return;
    // 答えが読めないなら、記事だけの画面のまま黙って引く（断りを出す相手がいない）
    if (!result.ok) return;
    if (!result.value.features.tools) {
      // 社外の人。道具箱は組み立てず、「見たページ」の控えだけ残す
      state.viewer = result.value.viewer;
      rememberView();
      return;
    }
    build();
    // もう聞いてある答えをそのまま使う（同じことを 2 度聞かない）
    applyLoaded(result.value);
    settleStart();
  });
}

/** 目次を開いている間だけ、コメントの道具を隠す（書きかけは消さない）。 */
function hideToolsWhileReadingDialog(open: boolean): void {
  if (open) {
    selectionFeature.setOpen(false);
    selectionFeature.hideMarkPeek();
    selectionFeature.hideSelectionBar();
  }
  if (root?.host instanceof HTMLElement) root.host.style.visibility = open ? "hidden" : "";
}

/** 名乗りが届いたあとの後始末。控えるのはここ 1 か所だけ。 */
function settleStart(): void {
  // 誰として見ているかで控える先が変わる（アカウント / ブラウザの中）
  rememberView();
  // 直せる人だけ、直す画面の部品を空き時間に先に読んでおく（押した瞬間に開ける・直せない人には送らない）
  if (state.features.edit) warmEditor();
  showLocationBar("identified");
  if (historyFeature.urlParams().get("edit") === "1" && state.features.edit && historyFeature.loadedVersion === null) {
    const url = new URL(window.location.href); url.searchParams.delete("edit"); window.history.replaceState(null, "", url.href);
    void startPageEdit();
  }
  const deckPanel = historyFeature.urlParams().get("deck-panel");
  if (deckPanel === "history" || deckPanel === "sharing") { const url = new URL(window.location.href); url.searchParams.delete("deck-panel"); window.history.replaceState(null, "", url.href); if (deckPanel === "history" && state.features.history) void historyFeature.openHistory(); else if (deckPanel === "sharing" && sharingFeature.canManageAccess()) void sharingFeature.openAccess(); }
  openLinkedComment();
  // URL に比較の指定があれば、そのまま比べている状態で立ち上げる
  void historyFeature.syncFromUrl();
}

/** 道具箱を組み立てて、ページに載せる。ここへ来るのは会社の人だけ。 */
function build(): void {
  // 前に使っていた幅を戻すが、今の画面に入らない値なら詰める
  // （大きな画面で広げたまま、狭い画面で開き直した場合に本文が潰れるのを防ぐ）
  const storedWidth = Number(readStored(STORAGE_WIDTH));
  if (Number.isFinite(storedWidth) && storedWidth > 0) state.width = selectionFeature.clampWidth(storedWidth);
  // 板を開くかは、ここでは決めない。何件あるかがまだ分からず、
  // 開くと 1 件も無いページで空の板が本文を覆う。コメントが届いてから決める（applyLoaded）
  selectionFeature.sheetOpenPending = true;

  const host = document.createElement(HOST_TAG);
  // OS が下端に帯を浮かせる環境かどうかは変わらないので、最初に 1 度だけ見る
  if (isIosLike(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)) {
    host.classList.add("is-ios");
  }
  root = host.attachShadow({ mode: "open" });
  const style = el("style");
  style.textContent = STYLES;
  root.appendChild(style);

  bar = el("div", "bar");
  historyFeature.compareBar = el("div", "compare");
  historyFeature.compareBar.hidden = true;
  panel = buildPanel();
  selectionFeature.popover = el("div", "popover");
  selectionFeature.popover.hidden = true;
  selectionFeature.attachPeekGestures(selectionFeature.popover);
  // 本文と（直しているときの）入力欄は、指の縦の動きをこちらで流す
  selectionFeature.attachInnerScroll(selectionFeature.popover, ".peek-body, textarea");
  selectionFeature.selectionBar = el("div", "selbar");
  selectionFeature.selectionBar.hidden = true;
  selectionFeature.composeDock = el("div", "compose-dock");
  selectionFeature.composeDock.hidden = true;
  selectionFeature.attachDockSwipe(selectionFeature.composeDock);
  selectionFeature.attachInnerScroll(selectionFeature.composeDock, "textarea");
  // 入力欄に焦点が入ったら、置いた結果を測って直し続ける
  selectionFeature.composeDock.addEventListener("focusin", () => selectionFeature.trackComposeDock(), { signal: lifetime.signal });
  toastStack = el("div", "toast-stack");
  originFeature.originHint = originFeature.buildOriginHint();
  root.appendChild(bar);
  root.appendChild(originFeature.originHint);
  root.appendChild(historyFeature.compareBar);
  root.appendChild(panel);
  root.appendChild(selectionFeature.popover);
  root.appendChild(selectionFeature.selectionBar);
  root.appendChild(selectionFeature.composeDock);
  root.appendChild(toastStack);
  document.body.appendChild(host);
  // スライドの操作列は本文を読み終えたあとに組まれ、一覧・ノートの出入りで言い方が変わる。変わり目でバーと ⋯ を描き直す
  if (document.body.hasAttribute("data-deck")) {
    const stopWatching = watchDeckTools(() => { if (bar !== null) render(); });
    lifetime.signal.addEventListener("abort", stopWatching, { once: true });
  }

  selectionFeature.applyPush();
  // 上端の帯（現在地の行など）の高さを、板・比べる帯・知らせの置き場所と、赤入れへ飛ぶときの余白に配る
  const publishTopLane = (): void => {
    host.style.setProperty("--top-lane", `${topInset.above("compare")}px`);
    setRedlineOffset(topInset.total());
  };
  publishTopLane();
  const stopWatchingTop = topInset.watch(publishTopLane);
  lifetime.signal.addEventListener("abort", stopWatchingTop, { once: true });
  render();
  attachPageEvents();
}

window.addEventListener("pagehide", event => {
  if (event.persisted) return;
  lifetime.dispose();
  sharingFeature.dispose();
  originFeature.dispose();
  historyFeature.dispose();
  listFeature.dispose();
  selectionFeature.dispose();
}, { signal: lifetime.signal });

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { signal: lifetime.signal });
} else {
  start();
}
