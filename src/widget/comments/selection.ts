import { EASE, MOTION } from "../../lib/settings/ui-motion";
import { createWidgetLifetime } from "../shared/widget-lifetime";
import { t } from "../shared/i18n";
import {
  type CommentAuthor,
  type CommentPriority,
  type PageComment
} from "../../lib/comments/types";
import {
  applyHighlights,
  captureSelection,
  marksFor,
  stashSelection,
  styleMark,
  unwrapDraftMarks,
  wrapRangeAsDraft,
  type Anchor
} from "./anchor";
import {
  deleteComment,
  type ApiResult
} from "../shared/api";
import {
  filterFor
} from "./comment-list";
import type { Draft, SendRow, State, TextAreaKeys } from './types';
import {
  afterCloseDock,
  afterOpenDock,
  afterSheetToggle,
  correctedShift,
  detentTops,
  dismissesKeyboard,
  exitDrop,
  isWithinGap,
  keyboardInset,
  nearestDetent,
  needsCorrection,
  toggledDetent,
  visibleBottomFor,
  type ComposeFlow,
  type DetentTops,
  type SheetDetent
} from "./dock";
import {
  PEEK_CLOSED,
  afterDismiss,
  afterSelectionLost,
  openedBy,
  showing,
  type PeekView
} from "./peek";
import { type ReadingNavigation } from "../reading/nav";
import {
  drawChangeBars
} from "./redline";
import { ICON_SIZE, POPOVER_PLACEMENT, SWIPE_MS } from "../shared/tokens";
import {
  HOST_TAG,
  ICON_CLOSE,
  ICON_COMMENT,
  ICON_COPY,
  ICON_VOLUME,
  ICON_EDIT,
  ICON_TRASH,
  el,
  fitPanelWidth,
  fullTime,
  icon,
  instantCompose,
  isApplePlatform,
  isDownwardSwipe,
  isNarrowViewport,
  lockAxis,
  relativeTime,
  rubberBand,
  selectionEntry,
  settleDelay,
  swipeDuration,
  swipeTarget,
  verticalIntent,
  writeStored,
  type SelectionEntry,
  type SwipeAxis
} from "../shared/util";

/** Owns selection behavior; receives only its required page/editor connections. */
type Host = {
  isComparing: () => boolean;
  inList: () => PageComment[];
  listBox: HTMLElement | null;
  picking: () => boolean;
  matchesFilter: (comment: PageComment) => boolean;
  render: () => void;
  avatarFor: (author: CommentAuthor) => Element;
  visibleForList: () => PageComment[];
  priorityTag: (priority: CommentPriority) => HTMLElement;
  appendQuoteStory: (parent: HTMLElement, comment: PageComment, quoteClass: string, bodyClass: string, withCompareLink?: boolean) => void;
  editorBox: (comment: PageComment) => HTMLElement;
  repliesOf: (parentId: string) => PageComment[];
  isMine: (comment: PageComment) => boolean;
  actionButton: (label: string, paths: readonly string[], onClick: () => void, variant?: string, spokenLabel?: string) => HTMLButtonElement;
  iconAction: (label: string, paths: readonly string[], onClick: () => void, variant?: string) => HTMLButtonElement;
  panel: HTMLElement | null;
  afterChange: <T>(result: ApiResult<T>) => boolean;
  refresh: () => Promise<boolean>;
  readingNavigation: ReadingNavigation | null;
  originalPaddingRight: string | null;
  root: ShadowRoot | null;
  STORAGE_WIDTH: string;
  watchChanges: () => void;
  moreMenuOpen: boolean;
  moreButton: HTMLButtonElement | null;
  prioritySendRow: (onSend: (priority: CommentPriority) => void) => SendRow;
  submitDraft: () => Promise<void>;
  canSend: (body: string) => boolean;
  textArea: (value: string, placeholder: string, onInput: (next: string) => void, keys?: TextAreaKeys) => HTMLTextAreaElement;
  canAct: () => boolean;
  /** 名乗りはあるが書き込めない（入場券で読むアプリの中のブラウザ）。ログイン切れとは言わない */
  readOnly: () => boolean;
  showError: (message: string) => void;
  copyText: (text: string, done: string, failure?: string) => Promise<boolean>;
  sheetComposer: (current: Draft) => HTMLElement;
  /** 選んだ文から読み上げる（src/widget/reading/read-aloud.ts）。読めない画面なら false。 */
  readFrom: (point: Range) => boolean;
  /** 「ここから読み上げ」を出してよいか（声の仕組みがあり、記事と清書のとき）。 */
  canReadFrom: () => boolean;
  state: Pick<State, "comments" | "filter" | "open" | "editor" | "confirmDeleteId" | "width" | "view">;
};

export function createCommentSelection(connections: Host) {
  const lifetime = createWidgetLifetime();
  const isComparing: Host['isComparing'] = (...args) => connections.isComparing(...args);
  const inList: Host['inList'] = (...args) => connections.inList(...args);
  const picking: Host['picking'] = (...args) => connections.picking(...args);
  const matchesFilter: Host['matchesFilter'] = (...args) => connections.matchesFilter(...args);
  const render: Host['render'] = (...args) => connections.render(...args);
  const avatarFor: Host['avatarFor'] = (...args) => connections.avatarFor(...args);
  const visibleForList: Host['visibleForList'] = (...args) => connections.visibleForList(...args);
  const priorityTag: Host['priorityTag'] = (...args) => connections.priorityTag(...args);
  const appendQuoteStory: Host['appendQuoteStory'] = (...args) => connections.appendQuoteStory(...args);
  const editorBox: Host['editorBox'] = (...args) => connections.editorBox(...args);
  const repliesOf: Host['repliesOf'] = (...args) => connections.repliesOf(...args);
  const isMine: Host['isMine'] = (...args) => connections.isMine(...args);
  const actionButton: Host['actionButton'] = (...args) => connections.actionButton(...args);
  const iconAction: Host['iconAction'] = (...args) => connections.iconAction(...args);
  const afterChange: Host['afterChange'] = (...args) => connections.afterChange(...args);
  const refresh: Host['refresh'] = (...args) => connections.refresh(...args);
  const watchChanges: Host['watchChanges'] = (...args) => connections.watchChanges(...args);
  const prioritySendRow: Host['prioritySendRow'] = (...args) => connections.prioritySendRow(...args);
  const submitDraft: Host['submitDraft'] = (...args) => connections.submitDraft(...args);
  const canSend: Host['canSend'] = (...args) => connections.canSend(...args);
  const textArea: Host['textArea'] = (...args) => connections.textArea(...args);
  const canAct: Host['canAct'] = (...args) => connections.canAct(...args);
  const readOnly: Host['readOnly'] = (...args) => connections.readOnly(...args);
  const showError: Host['showError'] = (...args) => connections.showError(...args);
  const sheetComposer: Host['sheetComposer'] = (...args) => connections.sheetComposer(...args);
  const state: Pick<State, "anchored" | "activeId" | "comments" | "filter" | "open" | "editor" | "confirmDeleteId" | "width" | "view"> = {
    anchored: new Set<string>(),
    activeId: null,
    get comments() { return connections.state.comments; }, set comments(value: State["comments"]) { connections.state.comments = value; },
    get filter() { return connections.state.filter; }, set filter(value: State["filter"]) { connections.state.filter = value; },
    get open() { return connections.state.open; }, set open(value: State["open"]) { connections.state.open = value; },
    get editor() { return connections.state.editor; }, set editor(value: State["editor"]) { connections.state.editor = value; },
    get confirmDeleteId() { return connections.state.confirmDeleteId; }, set confirmDeleteId(value: State["confirmDeleteId"]) { connections.state.confirmDeleteId = value; },
    get width() { return connections.state.width; }, set width(value: State["width"]) { connections.state.width = value; },
    get view() { return connections.state.view; }, set view(value: State["view"]) { connections.state.view = value; }
  };
  let popover: HTMLElement | null = null;
  /**
   * 小窓の枠の名前。小窓は覗き見・選んだ直後・書く形・自分のメニューの入れ物を兼ねるので、開くたびに用途の名前を付け、
   * 畳むときに外す（部品の一覧で、名前の無い枠に中身が散らばって見えないようにする）。
   */
  function nameSurface(surface: HTMLElement, label: string | null): void {
    if (label === null) {
      surface.removeAttribute("role");
      surface.removeAttribute("aria-label");
      return;
    }
    surface.setAttribute("role", "group");
    surface.setAttribute("aria-label", label);
  }
  let selectionBar: HTMLElement | null = null;
  let composeDock: HTMLElement | null = null;
  let draft: Draft | null = null;
  let draftFocused = false;
  let peek: PeekView = PEEK_CLOSED;
  let peekTrack: HTMLElement | null = null;
  let peekDragging = false;
  let peekHandoff = false;
  let selectionTimer = 0;
  let adjustingSelection = false;
  let pendingAnchor: Anchor | null = null;
  let pendingRange: Range | null = null;
  let dockQuote: HTMLElement | null = null;
  let pendingScrollTarget: Element | null = null;
  let originalScrollPadding: string | null = null;
  let sheetOpenPending = false;


  // ---------------------------------------------------------------------------
  // 本文の印とカードの行き来
  // ---------------------------------------------------------------------------

  function restyleMarks(): void {
    for (const comment of state.comments) {
      for (const mark of marksFor(comment.id)) {
        styleMark(mark, comment, comment.id === state.activeId);
      }
    }
  }


  /**
   * いま張ってある印の相手。控えの鍵。
   *
   * 解決の有無まで入れるのは、「すべて」で 1 件解決にしたときに塗りを薄いほうへ
   * 替えるため（並びは同じままなので、id だけでは気づけない）。
   */
  let markedKey: string | null = null;


  /**
   * 本文の印を、一覧に出ているものへそろえる。
   *
   * **本文の印と一覧は、同じものを指す。** 全件に張ると、既定が未解決なのに
   * 本文だけが「すべて」を映すことになり、片付けたはずの箇所が本文で光り続ける。
   * 絞り込みが本文にも効くので、「本文が変わった」で絞れば直す先だけが光る。
   *
   * 呼ぶのは render の頭 1 か所だけ。絞り込みを動かす口は 5 つあるが、どれも
   * render を通るので**入口ごとに書き足さない**。順序も要る——リンクから開いた
   * ときは絞り込みを動かしたあとで印を探すので、探すより前に張り替わっている
   * 必要がある。
   *
   * 比べている間は張らない（いま見えているのは過去の版の文章で、引用の指す先とは
   * 別物になる）。相手が変わっていなければ張り直さない——張り直しは本文の文字ノードを
   * 割り直す操作なので、描き直しのたびに走らせない。ただし**本文そのものが
   * 入れ替わったときは、相手が同じでも張り直す**（force）。
   */
  function syncMarks(force = false): void {
    if (isComparing()) return;
    const shown = inList();
    const key = shown.map((one) => `${one.id}:${one.resolvedAt === null ? "0" : "1"}`).join(",");
    if (!force && key === markedKey) return;
    markedKey = key;
    state.anchored = applyHighlights(shown);
    restyleMarks();
  }


  /** 光らせている時間。 */
  const FLASH_MS = 1200;


  /**
   * いま光らせている相手と、いつまで光らせるか。
   *
   * 見た目（付けた class）だけに持たせると、一覧を組み直した瞬間に
   * 相手の要素ごと捨てられて光りが消える。誰をいつまで、を状態として持ち、
   * 組み直したあとに付け直す。
   */
  let focusing: { id: string; until: number } | null = null;


  /**
   * 光らせるだけ。位置には触らない。
   * すでに一覧を読んでいる人の場所を奪わずに「ここだよ」と知らせるとき用。
   */
  function flashCard(commentId: string): void {
    focusing = { id: commentId, until: Date.now() + FLASH_MS };
    applyFocus();
  }


  function focusCard(commentId: string): void {
    flashCard(commentId);
    if (connections.listBox === null) return;
    const card = connections.listBox.querySelector(`[data-card-id="${CSS.escape(commentId)}"]`);
    if (!(card instanceof HTMLElement)) return;
    // まん中へ寄せる。「見えていれば動かさない」寄せ方だと、半分の高さの一覧では
    // 下端ぎりぎりに掛かったまま止まり、目当てのカードが切れて見える
    card.scrollIntoView({ block: "center", behavior: "smooth" });
  }


  /**
   * 光りを付け直す。組み直しのあとに毎回呼ぶ。
   *
   * 残り時間ぶんだけ光らせる（毎回 1.2 秒に伸ばし直さない）。
   * やるのは光らせ直すことだけで、位置には触らない。
   * 寄せるのは、一覧へ渡した最初の 1 回（focusCard）だけでよい。
   */
  function applyFocus(): void {
    if (focusing === null || connections.listBox === null) return;
    const left = focusing.until - Date.now();
    if (left <= 0) {
      focusing = null;
      return;
    }
    const card = connections.listBox.querySelector(`[data-card-id="${CSS.escape(focusing.id)}"]`);
    if (!(card instanceof HTMLElement)) return;

    card.classList.add("is-flash");
    lifetime.timeout(() => card.classList.remove("is-flash"), left);
    // 位置は動かさない。読んでいた位置は組み直しの側で保たれているので、
    // ここで動かすと「光っている 1.2 秒の間に自分で動かした人」だけが引き戻される
  }


  /** 本文の印をクリックされたとき。パネルを開いて、その場所のカードへ寄せる。 */
  function selectFromMark(commentId: string, gesture: Event | null): void {
    // まとめて選んでいる間は連れて行かない。あの状態で一覧が別の絞り込みへ
    // 飛ぶと、選んだ印だけが残って何を動かすのか分からなくなる
    if (picking()) return;
    state.activeId = commentId;
    const target = state.comments.find((comment) => comment.id === commentId);
    if (target !== undefined && !matchesFilter(target)) state.filter = filterFor(target);

    // 狭い画面では、板を丸ごと開かずに 1 件だけそっと見せる。
    // 読んでいる途中に全画面へ飛ばされると、どこを読んでいたか分からなくなる。
    if (isNarrow()) {
      restyleMarks();
      render();
      // 書いている最中は下端をドックが使っている。覗き見は割り込ませない
      if (!isDocked()) showMarkPeek(commentId, gesture);
      return;
    }

    if (!state.open) setOpen(true);
    restyleMarks();
    render();
    focusCard(commentId);
  }


  /** 覗き見をやめる。 */
  function hideMarkPeek(): void {
    if (!peek.open) return;
    peek = afterDismiss();
    peekTrack = null;
    peekDragging = false;
    // 送っている途中で閉じたら、その送りは無かったことにする
    lifetime.clearTimeout(peekSlideTimer);
    peekSliding = false;
    peekPendingId = null;
    setCardDrop(0, false);
    if (popover !== null) {
      popover.hidden = true;
      popover.replaceChildren();
      nameSurface(popover, null);
      // 付けた見た目の印は丸ごと戻す（畳む処理はどちらも同じ形にそろえる）。
      // 1 つずつ外す形にすると、外し忘れた印が次に開く小窓へ混ざる
      popover.className = "popover";
    }
    render();
  }


  function isPeeking(): boolean {
    return peek.open;
  }


  /**
   * 印を押した 1 件を、画面の下からそっと見せる。
   *
   * 出るのは常に 1 枚だけ。別の印を押したら中身が入れ替わる。
   * 下へ払う・外を押す・Escape のどれでも閉じられる。
   */
  /** 覗き見カード 1 枚ぶんの中身。前・いま・次 の 3 枚を同じ形で作る。 */
  function buildPeekSlide(comment: PageComment): HTMLElement {
    const slide = el("div", "peek-slide");
    // つまみもカードの持ち物。カードごと動くので、外側には置かない
    slide.appendChild(el("div", "peek-grab"));
    const resolved = comment.resolvedAt !== null;
    const editing = state.editor !== null && state.editor.targetId === comment.id;
    const confirming = state.confirmDeleteId === comment.id;

    const head = el("div", "card-head");
    head.appendChild(avatarFor(comment.author));
    const who = el("div");
    who.appendChild(el("div", "who-name", comment.author.name));
    const time = el("div", "who-time", relativeTime(comment.createdAt));
    time.title = fullTime(comment.createdAt);
    who.appendChild(time);
    head.appendChild(who);
    head.appendChild(el("span", "spacer"));

    // 何件目かは文字だけで示す（丸を並べると、押せるものと紛れる）。
    // 数えるのは一覧に出ているぶんだけ——覗き見は本文の印から開くもので、
    // 印が立っているのは一覧に出ているものだけなので、送れる先と数が一致する
    const all = visibleForList();
    const at = all.findIndex((item) => item.id === comment.id);
    if (all.length > 1 && at >= 0) {
      head.appendChild(el("span", "who-time", `${at + 1} / ${all.length}`));
    }
    if (resolved) head.appendChild(el("span", "tag", t("toolbox.common.resolved")));
    head.appendChild(priorityTag(comment.priority));
    slide.appendChild(head);

    const body = el("div", "peek-body");
    appendQuoteStory(body, comment, "pop-quote", "peek-text");
    if (resolved && comment.resolvedBy !== null) {
      body.appendChild(el("p", "note", t("toolbox.common.resolvedBy", { name: comment.resolvedBy })));
    }
    slide.appendChild(body);

    // 直しているところ。一覧と同じ入力欄をそのまま出す
    if (editing) {
      slide.appendChild(editorBox(comment));
      return slide;
    }

    const foot = el("div", "peek-foot");
    const replies = repliesOf(comment.id).length;
    foot.appendChild(el("span", "hint", replies === 0 ? t("toolbox.peek.noReplies") : t("toolbox.peek.replies", { count: replies })));

    // 上へ払えば同じことができる。気づかない人のための控えめな道として残す
    const openAll = el("button", "peek-more");
    openAll.type = "button";
    openAll.textContent = t("toolbox.peek.showAll");
    openAll.addEventListener("click", () => openListFromPeek(), { signal: lifetime.signal });
    foot.appendChild(openAll);
    slide.appendChild(foot);

    // 自分が書いたものだけ、その場で直せる・消せる（書き込めない画面では出さない）
    if (isMine(comment) && canAct()) {
      const actions = el("div", "peek-actions");
      if (confirming) {
        actions.appendChild(el("span", "hint", t("toolbox.common.confirmDeleteComment")));
        actions.appendChild(
          actionButton(t("toolbox.common.remove"), ICON_TRASH, () => void removeFromPeek(comment.id), "is-danger"),
        );
        actions.appendChild(
          actionButton(t("toolbox.common.cancel"), ICON_CLOSE, () => {
            state.confirmDeleteId = null;
            render();
          }),
        );
      } else {
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
            state.editor = null;
            render();
          }, "is-danger"),
        );
      }
      slide.appendChild(actions);
    }

    return slide;
  }


  /** いま映しているコメントの、並びの中での位置。 */
  function peekIndex(): number {
    if (peek.commentId === null) return -1;
    return visibleForList().findIndex((item) => item.id === peek.commentId);
  }


  /** 覗き見の中身だけ描き直す（開き直さない）。 */
  function renderPeek(): void {
    if (popover === null || !peek.open || peek.commentId === null) return;
    const all = visibleForList();
    const at = all.findIndex((item) => item.id === peek.commentId);
    if (at < 0) {
      hideMarkPeek();
      return;
    }

    peekTrack = el("div", "peek-track");
    // 前・いま・次 を横に並べておき、track ごと動かす
    for (const step of [-1, 0, 1]) {
      const item = all[at + step];
      const slot = el("div", "peek-slot");
      if (item !== undefined) slot.appendChild(buildPeekSlide(item));
      peekTrack.appendChild(slot);
    }
    setTrackOffset(0, false);

    popover.replaceChildren();
    popover.appendChild(peekTrack);
    setCardDrop(0, false);
    restyleMarks();
  }


  /**
   * 触った場所の下にある「実際に溢れているスクロール先」。溢れていなければ null。
   *
   * 溢れているかは、触った瞬間に測る。あらかじめ印を付けておく作りだと、
   * 文字の大きさが変わったり中身が入れ替わったりしたときに、印と実物がずれる。
   */
  function scrollerAt(target: EventTarget | null, selector: string): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    const found = target.closest(selector);
    if (!(found instanceof HTMLElement)) return null;
    return found.scrollHeight > found.clientHeight ? found : null;
  }


  /**
   * 指の縦の動きを、中のスクロールへ**自分で流す**。
   *
   * 器（カード・ドック）は全面で指を受け取る。部品ごとに受け取り方を変えると、
   * 部品どうしの隙間や器の余白が素通しになり、そこから後ろのページが動く。
   * かといって全面で受け取ると、中の長い本文や入力欄がブラウザの力では動かせない。
   * そこで、動かす量（指の差分）はもともと取ってあるので、それを直接流し込む。
   * ブラウザごとの解釈に何も預けない形になる。
   *
   * 指以外（マウス）は今までどおりブラウザに任せる。
   * 縦になぞる操作は、マウスでは「文字を選ぶ」なので取り上げてはいけない。
   */
  function attachInnerScroll(container: HTMLElement, selector: string): void {
    let scroller: HTMLElement | null = null;
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let axis: SwipeAxis = "undetermined";

    container.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") return;
      scroller = scrollerAt(event.target, selector);
      startX = event.clientX;
      startY = event.clientY;
      lastY = event.clientY;
      axis = "undetermined";
    }, { signal: lifetime.signal });

    container.addEventListener(
      "pointermove",
      (event) => {
        if (scroller === null) return;
        if (axis === "undetermined") axis = lockAxis(event.clientX - startX, event.clientY - startY);
        // 横へなぞる・軽く触れるはブラウザのまま（文字の選び直し・カーソル移動）
        if (axis !== "vertical") return;
        event.preventDefault();
        scroller.scrollTop -= event.clientY - lastY;
        lastY = event.clientY;
      },
      { ...{ passive: false }, signal: lifetime.signal },
    );

    const stop = (): void => {
      scroller = null;
    };
    container.addEventListener("pointerup", stop, { signal: lifetime.signal });
    container.addEventListener("pointercancel", stop, { signal: lifetime.signal });
  }


  /**
   * 覗き見から一覧へ渡す。
   *
   * カードが上へ抜けるのと**同時に**、一覧が下から立ち上がる。
   * 順番に起きると「カードが消えてから一覧がパッと出る」間ができ、
   * 同じものを見続けている感じが切れてしまう。
   * 開いた先では、いま見ていたコメントをまん中に寄せて、そっと光らせる。
   * 自動でページを動かさない決まりに反しない（本人が上へ払った操作の続きなので）。
   */
  function openListFromPeek(): void {
    const id = peek.commentId;
    const height = peekCardHeight();

    peekHandoff = true;
    // カードは上へ抜けながら薄くなる（立ち上がる一覧と重ならないように）
    popover?.classList.add("is-handoff");
    if (height > 0) setCardDrop(-height, true);

    // 同じ拍で一覧を立ち上げる
    setOpen(true);
    connections.panel?.classList.add("is-rising");
    if (id !== null) {
      state.activeId = id;
      restyleMarks();
      render();
      // 一覧が組み上がった次のコマで寄せる（組む前に呼ぶと行き先がまだ無い）
      lifetime.frame(() => focusCard(id));
    }

    lifetime.timeout(() => {
      peekHandoff = false;
      popover?.classList.remove("is-handoff");
      connections.panel?.classList.remove("is-rising");
      hideMarkPeek();
    }, SWIPE_MS);
  }


  /** 覗き見カードの高さ（上へ送り出す距離に使う）。取れなければ 0。 */
  function peekCardHeight(): number {
    if (popover === null) return 0;
    return popover.getBoundingClientRect().height;
  }


  /** カードを下へ動かす量。外側ごと動かすので、切り取られずに落ちて見える。 */
  function setCardDrop(dy: number, animate: boolean): void {
    if (popover === null) return;
    popover.classList.toggle("is-dropping", animate);
    popover.style.transform = dy === 0 ? "" : `translateY(${Math.round(dy)}px)`;
  }


  /**
   * track の横位置。1 枚ぶんを 100% として指のぶんだけずらす。
   *
   * 掴んでいる間は動きを付けない（指に 1 対 1 で付いてくる）。
   * 離したあとだけ動きを付け、その長さは払った速さから決める
   * （速く払ったら短く、ゆっくり離したら長く。同じ長さを待ち時間にも使う）。
   */
  function setTrackOffset(dx: number, animate: boolean, ms = SWIPE_MS): void {
    if (peekTrack === null) return;
    peekTrack.classList.toggle("is-sliding", animate);
    peekTrack.style.transitionDuration = animate ? `${ms}ms` : "";
    peekTrack.style.transform = `translateX(calc(-100% / 3 + ${Math.round(dx)}px))`;
  }


  /**
   * 印を押した 1 件を、画面の下からそっと見せる。
   *
   * 出るのは常に 1 枚だけ。別の印を押したら中身が入れ替わる。
   * 下へ払う・外を押す・Escape のどれでも閉じられる。
   */
  function showMarkPeek(commentId: string, gesture: Event | null): void {
    if (popover === null) return;
    if (state.comments.find((item) => item.id === commentId) === undefined) return;

    // 一覧と同時に開かない。同じものを 2 か所で直せる状態を作らない
    if (state.open) setOpen(false);
    state.editor = null;
    state.confirmDeleteId = null;

    popover.className = "popover is-peek";
    nameSurface(popover, t("toolbox.common.comment"));
    // 小窓のときに入れた位置指定を消す（覗き見は下端に貼り付ける）
    popover.style.left = "";
    popover.style.top = "";

    // 下端で場所を取り合わないよう、選択の入り口は引っ込める
    hideSelectionBar();
    popover.hidden = false;
    // 開いた操作を覚えておく。同じ操作の続きでは閉じない
    peek = openedBy(gesture ?? popover, commentId);
    render();
  }


  /** 送っている最中（組み直しを止めておく）。 */
  let peekSliding = false;

  /** 送り終わったら中身にする相手と、その待ち。 */
  let peekPendingId: string | null = null;

  let peekSlideTimer = 0;


  /**
   * 横に送る。端では送らない（ループしない）。
   *
   * 指を離した位置から、**1 枚ぶん動かしきってから**中身を入れ替える。
   * 動かしきる前に入れ替えると、離した瞬間に次のカードが現れることになり、
   * 送った手応えが消える（「ぱっと変わる」）。
   *
   * 入れ替えは動きが終わってから、動きを切った状態で行う。
   * 見えている絵は動かしきった直後と同じなので、組み直しは目に見えない。
   */
  function slidePeek(step: -1 | 0 | 1, velocityPxMs: number, from: number): void {
    const all = visibleForList();
    const at = peekIndex();
    const next = all[at + step];
    const width = popover?.getBoundingClientRect().width ?? 0;

    if (step === 0 || at < 0 || next === undefined || width === 0) {
      // 送らない。離した位置から元へ吸い付かせる
      setTrackOffset(0, true, swipeDuration(Math.abs(from), velocityPxMs, SWIPE_MS));
      return;
    }

    // 次へ送るなら左へ 1 枠ぶん（step と向きは逆）
    const target = -step * width;
    const ms = swipeDuration(Math.abs(target - from), velocityPxMs, SWIPE_MS);
    peekSliding = true;
    peekPendingId = next.id;
    setTrackOffset(target, true, ms);
    peekSlideTimer = lifetime.timeout(() => commitSlide(next.id), ms);
  }


  /** 送り終わり。動きを止めたまま中身を入れ替える。 */
  function commitSlide(commentId: string): void {
    lifetime.clearTimeout(peekSlideTimer);
    peekSliding = false;
    peekPendingId = null;
    // 送っている間に閉じられていたら、何もしない
    if (!isPeeking()) return;
    state.activeId = commentId;
    peek = showing(peek, commentId);
    state.editor = null;
    state.confirmDeleteId = null;
    render();
  }


  /** 覗き見から消したときは、隣のコメントへ滑らせる。 */
  async function removeFromPeek(id: string): Promise<void> {
    const all = visibleForList();
    const at = all.findIndex((item) => item.id === id);
    const neighbour = all[at + 1] ?? all[at - 1] ?? null;

    const result = await deleteComment(id);
    if (lifetime.disposed) return;
    if (!afterChange(result)) return;

    state.confirmDeleteId = null;
    if (state.activeId === id) state.activeId = null;

    // 隣へ移すのは、読み込み直す**前**に。
    // 読み込み直すと途中で描き直しが走り、そこで「映しているコメントがもう無い」と
    // 判断されて先に閉じられてしまう。閉じたあとで隣を指しても、もう開かない。
    if (neighbour !== null) {
      state.activeId = neighbour.id;
      peek = showing(peek, neighbour.id);
    }

    await refresh();
    if (lifetime.disposed) return;
    if (neighbour === null) hideMarkPeek();
  }


  /**
   * 覗き見カードの指の操作。縦と横を 1 つの見張りでまとめて扱う。
   *
   * 見張りを 2 つ重ねると、同じ指の動きを両方が拾って取り合いになる。
   * 動き始めに縦か横かを決め、**その操作の間は決めた向きを変えない**。
   *
   * 直している最中・消すか聞いている最中は、どちらの操作も受け付けない
   * （書きかけを指の動きで飛ばさないため）。
   */
  function attachPeekGestures(target: HTMLElement): void {
    let startX = 0;
    let startY = 0;
    let startAt = 0;
    let axis: SwipeAxis = "undetermined";
    let tracking = false;
    let inScrollableBody = false;

    const busy = (): boolean =>
      peek.commentId !== null &&
      ((state.editor !== null && state.editor.targetId === peek.commentId) ||
        state.confirmDeleteId === peek.commentId);

    /** 指を置いたのが、中でスクロールできる本文の上か。 */
    const onScrollableBody = (target: EventTarget | null): boolean =>
      scrollerAt(target, ".peek-body") !== null;

    target.addEventListener("pointerdown", (event) => {
      if (!isPeeking() || busy()) return;
      // 送っている途中で触られたら、その送りは即座に終わらせる。
      // 動いている最中の位置から掴ませると、どの 1 枚を触っているのか分からなくなる
      if (peekSliding && peekPendingId !== null) commitSlide(peekPendingId);
      startX = event.clientX;
      startY = event.clientY;
      startAt = event.timeStamp;
      axis = "undetermined";
      tracking = true;
      inScrollableBody = onScrollableBody(event.target);
      peekDragging = true;
    }, { signal: lifetime.signal });

    target.addEventListener("pointermove", (event) => {
      if (!tracking) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (axis === "undetermined") axis = lockAxis(dx, dy);
      if (axis === "vertical") {
        // 長い本文の上から始めた縦の動きは、本文を読むための動き。
        // カードごと動かさず、本文のスクロールに回す（attachInnerScroll が受け持つ）
        if (inScrollableBody) {
          tracking = false;
          peekDragging = false;
          return;
        }
        // 上下どちらにもカードごと付いてくる（上＝一覧へ / 下＝閉じる）
        setCardDrop(dy, false);
        event.preventDefault();
        return;
      }
      if (axis !== "horizontal") return;
      event.preventDefault();

      // 端を越えたぶんは抵抗を掛けて、ここで終わりだと手で分かるようにする
      const all = visibleForList();
      const at = peekIndex();
      const atEdge = (dx > 0 && at <= 0) || (dx < 0 && at >= all.length - 1);
      setTrackOffset(atEdge ? rubberBand(dx) : dx, false);
    }, { ...{ passive: false }, signal: lifetime.signal });

    const finish = (event: PointerEvent): void => {
      if (!tracking) return;
      tracking = false;
      peekDragging = false;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;

      if (axis === "vertical") {
        const height = target.getBoundingClientRect().height;
        const intent = verticalIntent(dx, dy);

        if (intent === "none") {
          // 払いきらなかった。元の位置へ戻す
          setCardDrop(0, true);
          return;
        }
        if (intent === "down") {
          // カードを下へ送り出してから閉じる
          setCardDrop(height, true);
          lifetime.timeout(() => hideMarkPeek(), SWIPE_MS);
          return;
        }
        // 上へ払った。カードを上へ送り出しつつ、一覧を立ち上げる
        openListFromPeek();
        return;
      }
      if (axis !== "horizontal") return;

      const elapsed = Math.max(1, event.timeStamp - startAt);
      const width = target.getBoundingClientRect().width;
      const velocity = dx / elapsed;
      slidePeek(swipeTarget(dx, velocity, width), velocity, dx);
    };

    target.addEventListener("pointerup", finish, { signal: lifetime.signal });
    target.addEventListener("pointercancel", (event) => finish(event), { signal: lifetime.signal });
  }


  /** カードをクリックされたとき。本文の該当箇所へ寄せる。 */
  function selectFromCard(commentId: string): void {
    state.activeId = commentId;
    restyleMarks();
    render();
    const marks = marksFor(commentId);
    if (marks.length > 0) marks[0].scrollIntoView({ block: "center", behavior: "smooth" });
  }


  // ---------------------------------------------------------------------------
  // パネルの開け閉て・幅
  // ---------------------------------------------------------------------------

  /**
   * 画面が狭いかどうか。
   *
   * 広い画面では本文を左へ押し出して横に並べるが、狭い画面で同じことをすると
   * 本文の残り幅が 100px ほどになって読めなくなる。そこで狭いときは押し出しをやめ、
   * 本文の上に全幅で重ねる（読むか書くか、どちらかに集中してもらう）。
   *
   * 決まりそのものは util.ts にある（画面に出さずに確かめられるようにするため）。
   */
  function isNarrow(): boolean {
    return isNarrowViewport(window.innerWidth);
  }


  /**
   * 細かく指せる入力装置（マウス・トラックパッド）があるか。
   *
   * 「画面が広いか」とは別の話。指で触る大きな画面を PC と取り違えると、
   * 文章を選んだだけでキーボードがせり上がる。
   */
  function hasFinePointer(): boolean {
    return window.matchMedia("(pointer: fine)").matches;
  }


  /** Apple 系の配列か。環境は変わらないので一度だけ調べる。 */
  let appleKeysCache: boolean | null = null;


  function appleKeys(): boolean {
    appleKeysCache ??= isApplePlatform(navigator.platform, navigator.userAgent);
    return appleKeysCache;
  }


  function clampWidth(width: number): number {
    return fitPanelWidth(width, window.innerWidth);
  }


  /**
   * 本文を右へ押しのけるときの長さ（ミリ秒）。
   *
   * 見た目の移り変わりと、動きが収まってから測り直すまでの待ちは、必ず同じ長さでなければ
   * ならない。片方だけ変えると、まだ動いている途中の位置で縦線を引くことになる。
   */
  const PUSH_MS = MOTION.base;


  function applyPush(): void {
    if (connections.readingNavigation !== null) {
      connections.readingNavigation.setPanel(state.open && !isNarrow() ? state.width : 0);
      return;
    }
    const html = document.documentElement;
    if (connections.originalPaddingRight === null) connections.originalPaddingRight = html.style.paddingRight;
    html.style.transition = `padding-right ${PUSH_MS}ms ${EASE}`;
    // 重ねて出すときは本文を動かさない
    const pushing = state.open && !isNarrow();
    html.style.paddingRight = pushing ? `${state.width}px` : connections.originalPaddingRight;
  }


  /**
   * 板の見せ方（横に並べる / 上に重ねる）と幅を、いまの画面に合わせる。
   *
   * 狭いかどうかの印は入れ物そのものに立てる。見た目の指定を 1 つの目印から
   * ぶら下げておけば、「どこが狭い画面用か」を CSS だけで追える。
   */
  function applyPanelShape(): void {
    const narrow = isNarrow();
    if (connections.root !== null) {
      connections.root.host.classList.toggle("is-narrow", narrow);
      // 道具箱はコメント欄の裏ではなく、本文側の右端に置く。
      if (connections.root.host instanceof HTMLElement) {
        connections.root.host.style.setProperty("--tools-panel-offset", state.open && !narrow ? `${state.width}px` : "0px");
      }
    }
    if (connections.panel === null) return;
    connections.panel.style.width = narrow ? "" : `${state.width}px`;
    applySheetDetent();
    applyViewportHeight();
  }


  /** いま何段目にいるか（狭い画面のときだけ意味がある）。 */
  let sheetDetent: SheetDetent = "half";


  /** 一覧シートの高さを段に合わせる。指で引いている最中は inline の top が勝つ。 */
  function applySheetDetent(): void {
    if (connections.panel === null) return;
    connections.panel.classList.remove("is-half", "is-expanded");
    if (!isNarrow()) {
      connections.panel.style.top = "";
      return;
    }
    connections.panel.style.top = "";
    connections.panel.classList.add(sheetDetent === "expanded" ? "is-expanded" : "is-half");
  }


  function setSheetDetent(next: SheetDetent): void {
    if (next === "closed") {
      setOpen(false);
      return;
    }
    sheetDetent = next;
    applySheetDetent();
  }


  /**
   * つまみの操作。
   *
   * 押しただけなら 2 段を行き来し、引いたら離した場所に近い段へ収める。
   * 勢いは見ない（弾ませると狙った段に止まらない）。
   */
  function attachSheetDrag(grab: HTMLElement): void {
    let startY = 0;
    let startTop = 0;
    let moved = false;
    let dragging = false;

    const tops = (): DetentTops =>
      detentTops(layoutHeight(), safeAreaTop(), gapForExpanded());

    grab.addEventListener("pointerdown", (event) => {
      if (!isNarrow() || connections.panel === null) return;
      dragging = true;
      moved = false;
      startY = event.clientY;
      startTop = connections.panel.getBoundingClientRect().top;
      connections.panel.classList.add("is-dragging");
      grab.setPointerCapture(event.pointerId);
    }, { signal: lifetime.signal });

    grab.addEventListener("pointermove", (event) => {
      if (!dragging || connections.panel === null) return;
      const delta = event.clientY - startY;
      if (Math.abs(delta) > 4) moved = true;
      // 指に付いてくる。上端より上へは行かせない
      connections.panel.style.top = `${Math.max(0, startTop + delta)}px`;
    }, { signal: lifetime.signal });

    const finish = (event: PointerEvent): void => {
      if (!dragging || connections.panel === null) return;
      dragging = false;
      connections.panel.classList.remove("is-dragging");

      if (!moved) {
        // 押しただけ。2 段を行き来する
        connections.panel.style.top = "";
        setSheetDetent(toggledDetent(sheetDetent));
        return;
      }
      const landed = Math.max(0, startTop + (event.clientY - startY));
      connections.panel.style.top = "";
      setSheetDetent(nearestDetent(landed, tops()));
    };

    grab.addEventListener("pointerup", finish, { signal: lifetime.signal });
    grab.addEventListener("pointercancel", (event) => finish(event), { signal: lifetime.signal });
  }


  /**
   * 見た目の値を 1 か所（tokens.ts）から読む。
   * ここで数を書き足すと、CSS と JS がそれぞれ別の値を信じ始める。
   */
  function tokenPx(name: string): number {
    if (connections.root === null) return 0;
    const value = getComputedStyle(connections.root.host).getPropertyValue(name).trim();
    const px = Number.parseFloat(value);
    return Number.isFinite(px) ? px : 0;
  }


  /** 画面上端の安全域。 */
  function safeAreaTop(): number {
    return tokenPx("--safe-top");
  }


  /** 上げきったときに残す余白（ページが帯として見える量）と、上端が使っている高さ。 */
  function gapForExpanded(): number {
    return tokenPx("--space-7") + tokenPx("--toast-lane") + tokenPx("--compare-bar") + tokenPx("--top-lane");
  }


  /**
   * キーボードが出ている間の見えている高さに、板の高さを合わせる。
   *
   * スマホでキーボードが出ると、画面の下半分が隠れる。板の高さをそのままにすると
   * 送信ボタンが隠れた場所に居座る。visualViewport が無いブラウザでは何もしない。
   */
  function applyViewportHeight(): void {
    if (connections.panel === null) return;
    if (!isNarrow()) {
      connections.panel.style.bottom = "";
      return;
    }
    const seen = window.visualViewport;
    // 上端は段で決まっているので、キーボードのぶんは下から詰める。
    // 高さを直接置かないのはドックと同じ理由（測る瞬間に振り回されないため）
    const inset =
      seen === null || seen === undefined
        ? 0
        : keyboardInset(layoutHeight(), seen.height, seen.offsetTop);
    connections.panel.style.bottom = inset === 0 ? "" : `${inset}px`;
  }


  /**
   * 板（右の一覧）を開け閉てする。
   *
   * ここでやるのは見え方の始末だけで、書きかけには手を出さない。
   * 書くところはドックに移っており、書きかけの寿命はドックが持っている
   * （決まりは dock.ts の afterSheetToggle）。
   */
  function setOpen(open: boolean): void {
    if (open) connections.readingNavigation?.close(false);
    // ここを通った時点で、こちらから開け閉てを決める出番は終わり。
    // あとから勝手に開き直して、閉じた人の手を上書きしない
    sheetOpenPending = false;
    const flow = afterSheetToggle(currentFlow(), open);
    // 一覧を開く動作は、どこから来ても必ず半分の高さから
    if (open && !state.open) sheetDetent = "half";
    state.open = flow.sheetOpen;
    syncDraft(flow);
    applyPush();
    render();
    // 本文の幅が変わると折り返しが変わる。押しのけが収まってから縦線を引き直す
    if (isComparing()) lifetime.timeout(() => drawChangeBars(), PUSH_MS);
  }


  /** いまの「板・ドック・書きかけ」の状態。 */
  function currentFlow(): ComposeFlow {
    return { sheetOpen: state.open, dockOpen: isDocked(), hasDraft: draft !== null };
  }


  /** 決まりが「書きかけは終わり」と言ったときだけ、実際に捨てる。 */
  function syncDraft(flow: ComposeFlow): void {
    if (flow.hasDraft) return;
    // 捨てるなら、本文に置いた印も必ず外す。持っている配列ごと手を離すと、
    // 誰も外せない印がページに残り、選択を解いても塗りが消えなくなる
    // （送ったときは印の持ち主が控えへ移っているので、ここには残っていない）
    if (draft !== null) unwrapDraftMarks(draft.marks);
    draft = null;
    draftFocused = false;
  }


  function setWidth(width: number): void {
    // 狭い画面では全幅なので、つまみで幅を変えさせない
    if (isNarrow()) return;
    state.width = clampWidth(width);
    writeStored(connections.STORAGE_WIDTH, String(state.width));
    applyPanelShape();
    applyPush();
  }


  /** 画面の大きさが変わったら、並べるか重ねるかを判断し直す。 */
  function handleResize(): void {
    if (!isNarrow()) state.width = clampWidth(state.width);
    applyPanelShape();
    applyPush();
    render();
    // 帯は狭い画面で 2 段になる。高さが変われば、見張りの基準も引き直す。
    // 縦線は測って置いてあるので、本文の折り返しが変わったら引き直す
    if (isComparing()) {
      drawChangeBars();
      watchChanges();
    }
  }


  // ---------------------------------------------------------------------------
  // 選択したときの小窓
  // ---------------------------------------------------------------------------

  /** 小窓を寄せる相手の枠。選んだ文章の枠か、道具箱の器（⋯ の小窓は器から測る）。 */
  type PopoverAnchor = Pick<DOMRect, "left" | "top" | "width" | "bottom">;

  /**
   * 小窓を、**選んだ場所にかぶらない**ところへ置く。
   *
   * 既定は選んだ場所の下。入りきらなければ上へ返す。
   * どちらにも入りきらないときは、空いているほうの端へ寄せる。
   *
   * 端へ寄せる道を足したのは、前は入りきらないときに画面の上端（12px）へ
   * 引き戻していたため。選んだ場所が画面の上のほうにあると、小窓がその上に乗り、
   * 何に対して書いているのかが見えなくなっていた。**印を付けても隠れては意味が無い。**
   */
  function placePopover(rect: PopoverAnchor): void {
    if (popover === null) return;
    popover.hidden = false;
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    const { gap, edge } = POPOVER_PLACEMENT;

    const centered = rect.left + rect.width / 2 - width / 2;
    const left = Math.min(window.innerWidth - width - edge, Math.max(edge, centered));

    const roomBelow = window.innerHeight - edge - (rect.bottom + gap);
    const roomAbove = rect.top - gap - edge;

    let top = rect.bottom + gap;
    if (roomBelow < height) {
      if (roomAbove >= height) top = rect.top - gap - height;
      // どちらにも入らない。選んだ場所から遠いほうの端へ逃がす
      else if (roomBelow >= roomAbove) top = Math.max(edge, window.innerHeight - edge - height);
      else top = edge;
    }

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }


  /** 小窓を閉じる。広い画面ではここが書きかけの持ち主。 */
  function hidePopover(): void {
    // 書きかけをやめるなら、選んだ場所に置いた印も外す。
    // 送ったときは印の持ち主が控えへ移っているので、ここには残っていない
    if (draft !== null) unwrapDraftMarks(draft.marks);
    draft = null;
    draftFocused = false;
    // 小窓と覗き見カードは同じ入れ物を使う。片方を消したら、もう片方の状態も畳む
    const wasPeeking = peek.open;
    if (wasPeeking) peek = afterDismiss();
    const wasMenu = connections.moreMenuOpen;
    connections.moreMenuOpen = false;
    if (popover !== null) {
      popover.hidden = true;
      popover.replaceChildren();
      nameSurface(popover, null);
      // 付けた見た目の印は**丸ごと**戻す。1 つずつ外す形にすると、印が増えたときに
      // 外し忘れた分が次に開く小窓へ混ざる（⋯ の小窓の印が付いたまま文章を選ぶ、など）
      popover.className = "popover";
    }
    // 「その他」を畳んだときは、⋯ のボタンの「開いている」表示を戻すために描き直す
    if (wasPeeking || wasMenu) render();
    // 焦点を ⋯ へ返すのは**描き直したあと**。バーは描き直しのたびに作り直されるので、
    // 先に返すと、返した先のボタンごと画面から消える（キーボードだけの人が迷子になる）
    if (wasMenu) connections.moreButton?.focus({ preventScroll: true });
  }


  /**
   * 選んだ文章に対する書きかけをこしらえる（広い画面の小窓のぶん）。
   *
   * **引用は写し取り、選んだ場所には印を置いてから持つ。**
   * 入力欄に焦点が移った時点でページ側の選択は解けるので、あとから読み直す作りだと、
   * 書き始めた瞬間に「何に対する話か」を失う。
   *
   * 印を置くのは、小窓の中の引用だけでは**本文のどこだったか**が分からないため。
   * 狭い画面の流れ（下端の帯 → ドック）で使っているものと同じ下書きの印を使う。
   * 見た目を新しく作らない。
   *
   * 包むのは選択が生きているうち。文言で探し直す仕組みは通さない
   * （同じ文言が何度も出るページで取り違えないため）。
   */
  let selectedCopyText = "";

  function selectionCopyButton(text: string): HTMLButtonElement {
    return connections.iconAction(t("toolbox.selection.copy"), ICON_COPY, () => {
      void connections.copyText(text, t("toolbox.common.copied"), t("toolbox.selection.copyFailed"));
    }, "selection-aside");
  }

  /**
   * 「ここから読み上げ」。選んだ文に対してできること（コメント・コピー）と同じ列に並べる。
   * 押したら書きかけと選択を畳んでから読み始める（読みたいだけの人に、入力欄を残さない）。
   */
  function appendReadFromButton(parent: HTMLElement): void {
    if (!connections.canReadFrom()) return;
    parent.appendChild(connections.iconAction(t("toolbox.selection.readFrom"), ICON_VOLUME, () => readFromSelection(), "selection-aside"));
  }

  function readFromSelection(): void {
    // 位置は**畳む前に**取る。広い画面は選んだ所を印で包んであるので、その印の手前を指す
    // （印を外すと、手前を指した位置はそのまま選んだ文字の先頭へ移る）。狭い画面は控えた範囲の先頭
    const mark = draft?.marks.find((node) => node.isConnected) ?? null;
    const point = document.createRange();
    if (mark !== null) {
      point.setStartBefore(mark);
    } else {
      const live = pendingRange ?? currentRange();
      if (live === null) return;
      point.setStart(live.startContainer, live.startOffset);
    }
    point.collapse(true);
    hidePopover();
    hideSelectionBar();
    window.getSelection()?.removeAllRanges();
    connections.readFrom(point);
  }

  function beginPopoverDraft(anchor: Anchor): void {
    selectedCopyText = window.getSelection()?.toString() || anchor.quote;
    const previous = draft;
    // 同じところを選び直しただけなら、付いている印をそのまま使う。
    // いちいち外して付け直すと選択が揺れ、見張りがもう一度走って堂々巡りになる。
    //
    // 使い回してよいかは、**印が本文に繋がっているか**で見る（数だけでは見ない）。
    // 何かの理由で本文から外れた印を数だけで「まだ有る」と数えると、外れた要素を
    // 持ち回るだけになり、同じ文を選び直しても印が二度と描かれない
    // （引用はドックに出るのに、本文のどこの話か分からなくなる）
    const staying =
      previous !== null &&
      previous.anchor.quote === anchor.quote &&
      previous.marks.length > 0 &&
      previous.marks.every((mark) => mark.isConnected);

    let marks: HTMLElement[] = [];
    if (previous !== null && staying) {
      marks = previous.marks;
    } else {
      // 別のところを選び直した。先に前の印を外してから、新しい場所へ付け直す
      if (previous !== null) unwrapDraftMarks(previous.marks);
      const range = pageRange();
      if (range !== null) marks = wrapRangeSafely(range);
    }

    draft = { anchor: stashSelection(anchor), kind: "comment", priority: "want", body: "", marks };
  }


  /**
   * 選んだ瞬間から書き始める（マウスのある広い画面）。
   *
   * 出す場所（rect）は、選択が生きているうちに測った値をそのまま使う。
   * 焦点を当てたあとに測り直すと、選択が消えているので測れない。
   */
  function startComposing(anchor: Anchor, rect: DOMRect): void {
    if (popover === null) return;
    beginPopoverDraft(anchor);
    showComposer(rect);
  }


  /**
   * 選んだ文章に対する小窓を出す。**出し方を決めるのはここ 1 か所だけ。**
   *
   * 広い画面は入力装置を問わずそのまま書き始める（ボタンを 1 枚挟まない）。
   * 名乗ってから書く人も同じ道を通る（入り口が 2 通りに割れないようにする）。
   */
  function showSelectionPopover(anchor: Anchor, rect: DOMRect, entry: SelectionEntry): void {
    if (!instantCompose(entry)) return;
    startComposing(anchor, rect);
  }


  /** 本文を書く形に開き直す。 */
  function showComposer(rect: DOMRect): void {
    if (popover === null || draft === null) return;
    const current = draft;

    popover.className = "popover";
    nameSurface(popover, t("toolbox.selection.surface"));
    popover.replaceChildren();

    // 見出しの行は置かない。引用と強さのボタンで用件は分かる
    const quoteRow = el("div", "quote-row");
    quoteRow.appendChild(
      el("p", "pop-quote", current.anchor.quote),
    );
    quoteRow.appendChild(selectionCopyButton(selectedCopyText));
    appendReadFromButton(quoteRow);
    const close = el("button", "icon-button");
    close.type = "button";
    close.title = t("toolbox.common.close");
    close.appendChild(icon(ICON_CLOSE, ICON_SIZE.small));
    close.addEventListener("click", () => hidePopover(), { signal: lifetime.signal });
    quoteRow.appendChild(close);
    popover.appendChild(quoteRow);

    const box = el("div", "composer");

    // 強さのボタンがそのまま送信（狭い画面と同じ形）
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
      },
      {
        onPriority: (priority) => {
          current.priority = priority;
          void submitDraft();
        },
        quoteWhenEmpty: () => current.anchor.quote,
      },
    );
    box.appendChild(area);
    box.appendChild(send.row);

    popover.appendChild(box);
    placePopover(rect);
    // 焦点は最後。引用を写し取り、出す場所も決め終わってから当てる
    // （当てた時点でページ側の選択は解ける）
    lifetime.timeout(() => area.focus({ preventScroll: true }), 0);
  }


  /**
   * 何か書いている最中か。
   *
   * 入れ物は 1 つを使い回しているので、**中身が何かは見た目の印で見分ける**。
   * 印が付いているものは、どれも「書いている最中」ではない:
   *   is-compact … ボタンだけの小窓（⋯ の小窓と同じく、書く欄を持たない）
   *   is-peek    … 覗き見カード（読むだけ）
   *   is-menu    … 道具箱の「その他」（道具の行が並ぶだけ）
   * ここに ⋯ を数え忘れると、その小窓を開いている間じゅう「書いている最中」と誤読され、
   * 文章を選んでも入り口が出なくなる。
   */
  const NOT_COMPOSING_MARKS = ["is-compact", "is-peek", "is-menu"] as const;


  function isComposing(): boolean {
    if (popover === null || popover.hidden) return false;
    const marks = popover.classList;
    return !NOT_COMPOSING_MARKS.some((mark) => marks.contains(mark));
  }


  /** 入力欄は開いているが、まだ 1 文字も書いていない状態か。 */
  function isBlankDraft(): boolean {
    return draft !== null && !canSend(draft.body);
  }


  // ---------------------------------------------------------------------------
  // 選び終わったかの見張り
  // ---------------------------------------------------------------------------

  /** 選択が落ち着いたら呼ぶ。出す入り口は画面の広さで変わる。 */
  function onSelectionSettled(): void {
    // 比べている間は、文章を選んでもコメントの入り口を出さない。
    // 見えているのは過去の版の文章なので、そこに付けた引用は今の本文を指さない
    if (isComparing()) {
      hideSelectionBar();
      return;
    }
    // 何か書いている最中に横から出さない。
    // ただし、選んだだけでまだ 1 文字も書いていないなら、選び直したほうへ付け替える。
    // 選んだ瞬間に小窓が開く作りでは、ここで止めると「別の場所を選び直せない」ことになる
    if (isComposing() && !isBlankDraft()) return;
    // ドックを出している間に別の文が選ばれたら、付け先をそちらへ移す
    if (isDocked()) {
      retargetDraft();
      return;
    }
    if (draft !== null && isNarrow()) return;

    const anchor = captureSelection();
    const entry = selectionEntry(window.innerWidth, anchor !== null);

    if (entry === "none" || anchor === null) {
      // 選択が消えて困るのは、選択に紐づく入り口だけ。
      // 覗き見カードは印を押して読むためのもので、選択とは関係がない。
      // ここで一緒に閉じると、押した指を離した瞬間に開いて消える
      // （押すと選択が解けるため、開いた直後にこの経路が走る）。
      peek = afterSelectionLost(peek);
      hideSelectionBar();
      if (popover !== null && !popover.hidden && !isComposing() && !isPeeking()) hidePopover();
      return;
    }

    if (entry === "bar") {
      // 名乗れない相手に入り口だけ出しても、押した先で断られるだけ
      if (!canAct()) {
        hideSelectionBar();
        // 読むだけの画面（入場券）では入り口を出さないだけ。ログイン切れではない
        if (!readOnly()) showError(t("toolbox.common.sessionExpired"));
        return;
      }
      // 狭い画面。選んだ場所の真上は OS のメニューが占めるので、下端に寄せる
      showSelectionBar(anchor);
      return;
    }

    const selection = window.getSelection();
    const rect =
      selection !== null && selection.rangeCount > 0
        ? selection.getRangeAt(0).getBoundingClientRect()
        : null;
    if (rect === null || rect.width + rect.height === 0) {
      hidePopover();
      return;
    }

    if (canAct()) {
      showSelectionPopover(anchor, rect, entry);
      return;
    }
    // 名乗れていないのはログイン切れ（道具箱が出ているのは会社の人の画面だけ）。
    // 読むだけの画面（入場券）では入り口を出さないだけ
    hidePopover();
    if (!readOnly()) showError(t("toolbox.common.sessionExpired"));
  }


  function scheduleSelectionCheck(): void {
    lifetime.clearTimeout(selectionTimer);
    if (adjustingSelection) return;
    selectionTimer = lifetime.timeout(() => {
      if (adjustingSelection) return;
      onSelectionSettled();
    }, settleDelay(window.innerWidth));
  }


  // ---------------------------------------------------------------------------
  // 画面下の入り口（狭い画面）
  // ---------------------------------------------------------------------------

  function hideSelectionBar(): void {
    pendingAnchor = null;
    pendingRange = null;
    if (selectionBar === null || selectionBar.hidden) return;
    selectionBar.classList.remove("is-shown");
    selectionBar.hidden = true;
    selectionBar.replaceChildren();
    // 下の入り口が消えたら、道具箱を出し直す
    render();
  }


  /**
   * 選んだ文章に対する入り口を、画面の下端に出す。
   *
   * 引用は出した時点で写し取っておく。押した瞬間に選択が解けても、
   * 何に対するコメントかを失わないようにするため。
   */
  function showSelectionBar(anchor: Anchor): void {
    if (selectionBar === null) return;
    // 下端で場所を取り合わないよう、覗き見は引っ込める
    hideMarkPeek();
    pendingAnchor = stashSelection(anchor);
    // 範囲そのものも控える。押されたときには選択が消えていることが多いため
    pendingRange = currentRange()?.cloneRange() ?? null;

    selectionBar.replaceChildren();
    // 「選択した部分に」と言うより、選んだ文言そのものを見せたほうが早い。
    // 写し取った値をそのまま出す（選択をもう一度読み直さない）。
    // 中身は文字として置くので、記号が並んでいてもそのまま文字として出る。
    const quote = el("span", "selbar-quote", pendingAnchor.quote);
    quote.title = pendingAnchor.quote;
    selectionBar.appendChild(quote);

    const comment = el("button", "selbar-action");
    comment.type = "button";
    comment.appendChild(icon(ICON_COMMENT, ICON_SIZE.small));
    comment.appendChild(el("span", undefined, t("toolbox.common.comment")));
    comment.addEventListener("click", () => beginDraftFromBar(), { signal: lifetime.signal });

    selectionBar.appendChild(selectionCopyButton(window.getSelection()?.toString() || anchor.quote));
    appendReadFromButton(selectionBar);
    selectionBar.appendChild(comment);

    selectionBar.hidden = false;
    // 出るときだけ薄く浮かせる（動きは最小限に）
    lifetime.frame(() => selectionBar?.classList.add("is-shown"));
    render();
  }


  /**
   * 下の入り口が押された。
   *
   * 引用はここで確定させる。板を開くと選択が解けるので、開いてから読み直すと間に合わない。
   */
  function beginDraftFromBar(): void {
    const fresh = captureSelection();
    const anchor = fresh !== null ? stashSelection(fresh) : pendingAnchor;
    if (anchor === null) {
      hideSelectionBar();
      return;
    }

    // 選択を解く前に、どこを選んでいたかを覚えておく（あとでそこへ寄せる）
    pendingScrollTarget = selectionElement();

    // 選択はこのあと解けるので、生きているうちにその場で印を付ける。
    // 文言で探し直す仕組みは通さない（同じ文言が何度も出るページで取り違えないため）
    const marks = wrapLiveSelection();

    draft = { anchor, kind: "comment", priority: "want", body: "", marks };
    draftFocused = false;
    hideSelectionBar();
    window.getSelection()?.removeAllRanges();

    state.view = "comments";
    openComposeDock();
  }


  /** いま選ばれているところに、下書き中の印を付ける。付けられなければ空。 */
  /** いま生きている選択の範囲。無ければ null。 */
  function currentRange(): Range | null {
    const selection = window.getSelection();
    if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return null;
    return selection.getRangeAt(0);
  }


  /**
   * 選んだところに下書き中の印を付ける。
   *
   * 押した時点では、指で出した選択がもう消えていることが多い
   * （ボタンに触れた時点で OS が選択を解く）。引用の文言と同じように、
   * **帯を出したときに控えておいた範囲**へ落とす。
   * ここを生きている選択だけに頼ると、印が付かない場面のほうが多くなる。
   */
  function wrapLiveSelection(): HTMLElement[] {
    const range = currentRange() ?? pendingRange;
    return range === null ? [] : wrapRangeSafely(range);
  }


  /** 包めない形でも、書くこと自体は続けられるようにする。 */
  function wrapRangeSafely(range: Range): HTMLElement[] {
    try {
      return wrapRangeAsDraft(range);
    } catch {
      return [];
    }
  }


  /** ページ本文の中で生きている選択だけを返す。自分の画面の中で選んだものは対象外。 */
  function pageRange(): Range | null {
    const range = currentRange();
    if (range === null) return null;
    const node = range.commonAncestorContainer;
    const element = node instanceof Element ? node : node.parentElement;
    if (element === null || element.closest(HOST_TAG) !== null) return null;
    return range;
  }


  /**
   * 書いている途中に別の文を選んだら、コメントの付け先をそちらへ移す。
   *
   * 移すのは引用・前後の文脈・下書きの印だけ。**書いた本文と強さはそのまま**。
   * 「書いてから、やっぱりここに付けたい」と思い直せるようにするため。
   *
   * 送信済みのものには関係しない（送った時点で自分の控えへ移してある）。
   */
  function retargetDraft(): void {
    if (draft === null) return;

    // 自分の画面の中で選んだとき・解除されただけのときは、付け先を動かさない
    const range = pageRange();
    if (range === null) return;

    const fresh = captureSelection();
    if (fresh === null) return;
    if (fresh.quote === draft.anchor.quote) return;

    unwrapDraftMarks(draft.marks);
    draft.anchor = stashSelection(fresh);
    draft.marks = wrapRangeSafely(range);
    window.getSelection()?.removeAllRanges();

    showRetargetedQuote(draft.anchor.quote);
  }


  /** 引用の表示を差し替え、変わったことがそっと分かるようにする。 */
  function showRetargetedQuote(quote: string): void {
    if (dockQuote === null) return;
    dockQuote.textContent = quote;
    dockQuote.classList.add("is-swapped");
    lifetime.timeout(() => dockQuote?.classList.remove("is-swapped"), 400);
  }


  /** いま選んでいるところの入れ物。選択を解いたあとで寄せ直すのに使う。 */
  function selectionElement(): Element | null {
    const selection = window.getSelection();
    if (selection === null || selection.rangeCount === 0) return null;
    const node = selection.getRangeAt(0).startContainer;
    const element = node instanceof Element ? node : node.parentElement;
    if (element === null || element.closest(HOST_TAG) !== null) return null;
    return element;
  }


  /** 書くのをやめる。引用の写しを捨てるのはドックを閉じる処理の役目。 */
  function discardDraft(): void {
    closeComposeDock();
  }


  /**
   * 書きかけを、持ち主ごと畳ませる。
   *
   * **本文の印だけを掃く道を作らない。** 確定した印はコメントを読み直すたびに
   * サーバーの引用から引き直されるので、消えてもすぐ治る。書きかけの印には
   * その引き直しが無いので、記憶（書きかけが持つ配列）を残したまま本文から消すと、
   * 誰も描き直せない引用がドックに残る。持ち主に手を離させれば、記憶と本文が
   * ずれない（持ち主は狭い画面ならドック、広い画面なら小窓）。
   */
  function dropDraft(): void {
    if (draft === null) return;
    if (isDocked()) discardDraft();
    else hidePopover();
  }


  // ---------------------------------------------------------------------------
  // 書き込みドック（狭い画面で、新しいコメントを書くところ）
  // ---------------------------------------------------------------------------

  /**
   * ドックの上端を、いま見えている高さに合わせて置き直す。
   *
   * 画面の下に貼り付けるだけでは、iOS でキーボードが出たときに
   * ドックがキーボードの裏へ隠れる。見えている高さを測って自分で置く。
   */
  /** いま掛けている持ち上げ量（上が負）。 */
  let dockShift = 0;

  /** 指で下へ動かしている量（払って閉じる操作のあいだだけ）。 */
  let dockDrag = 0;

  /** 指で動かしている / 送り出している最中は、位置合わせを止める。 */
  let dockGesture = false;


  function applyDockShift(): void {
    if (composeDock === null) return;
    const y = dockShift + dockDrag;
    composeDock.style.transform = y === 0 ? "" : `translateY(${y}px)`;
    // 持ち上がっている＝キーボードが出ている。そのあいだは詰めた姿にする
    composeDock.classList.toggle("is-compact", dockShift < 0);
  }


  /** 指の動きぶんだけ下げる。`animate` を立てると、覗き見カードと同じ減速で滑る。 */
  function setDockDrag(dy: number, animate: boolean): void {
    if (composeDock === null) return;
    composeDock.classList.toggle("is-dropping", animate);
    dockDrag = dy;
    applyDockShift();
  }



  /**
   * 紙全体の高さ。
   *
   * `window.innerHeight` は使わない。iOS ではキーボードが出ると
   * **見えている高さのほうに縮んでしまう**ので、これを紙の高さとして引き算すると
   * 差がほぼ 0 になり、「キーボードは出ていない」と誤って判断する。
   * 画面いっぱいに貼り付けた要素の基準は、縮まないこちら。
   */
  function layoutHeight(): number {
    const paper = document.documentElement.clientHeight;
    return paper > 0 ? paper : window.innerHeight;
  }


  /** 計算して置く（初動を速くするため）。ここで合わなくても、あとで測って直す。 */
  function positionComposeDock(): void {
    if (composeDock === null || composeDock.hidden) return;
    // 指で動かしている最中に置き直すと、指から外れる
    if (dockGesture) return;
    const seen = window.visualViewport;
    const inset =
      seen === null || seen === undefined
        ? 0
        : keyboardInset(layoutHeight(), seen.height, seen.offsetTop);
    dockShift = -inset;
    applyDockShift();
  }


  /**
   * 置いた結果を測って直す。
   *
   * 計算だけに頼ると、知らせの取りこぼしや端末の癖でずれが残る。
   * 実際の底と、見えている範囲の底を毎コマ突き合わせ、差があればそのぶん足し引きする。
   * **原因が何であっても結果の側で吸収される**のが要点。
   */
  function correctComposeDock(): boolean {
    if (composeDock === null || composeDock.hidden) return false;
    // 指で動かしている最中の底は「ずれ」ではない。直しに来ると指と引っ張り合う
    if (dockGesture) return false;
    const seen = window.visualViewport;
    if (seen === null || seen === undefined) return false;

    const dockBottom = composeDock.getBoundingClientRect().bottom;
    // 持ち上げる前の底＝貼り付き先。これがどちらの物差しかを教えてくれる
    const restingBottom = dockBottom - dockShift;
    const visibleBottom = visibleBottomFor(
      restingBottom,
      layoutHeight(),
      seen.height,
      seen.offsetTop,
    );
    if (!needsCorrection(dockBottom, visibleBottom)) return false;

    dockShift = correctedShift(dockShift, dockBottom, visibleBottom);
    applyDockShift();
    return true;
  }


  /** ドックの中に焦点があるか（キーボードが出ている間だけ見張るため）。 */
  function isDockFocused(): boolean {
    if (composeDock === null || composeDock.hidden || connections.root === null) return false;
    const active = connections.root.activeElement;
    return active !== null && composeDock.contains(active);
  }


  let trackingDock = false;


  /**
   * 文字を打っている間だけ、毎コマ突き合わせて直し続ける。
   * 焦点が外れたら止める（見張り続けると電池を食う）。
   */
  function trackComposeDock(): void {
    if (trackingDock) return;
    trackingDock = true;

    let moved = false;
    const step = (): void => {
      if (!isDockFocused()) {
        trackingDock = false;
        return;
      }
      if (correctComposeDock()) {
        moved = true;
      } else if (moved) {
        // 動いていたものが収まった。書こうとしている箇所を見え直す
        moved = false;
        ensureDraftVisible();
      }
      lifetime.frame(step);
    };
    lifetime.frame(step);
  }


  /**
   * キーボードが出入りしている間だけ、数コマぶん位置を合わせ続ける。
   *
   * 出入りは滑って動くので、知らせが 1 回来た時点ではまだ動いている最中のことがある。
   * 常時見張ると電池を食うので、動きが収まるか、決めた時間が過ぎたらやめる。
   */
  const SETTLE_BUDGET_MS = 400;

  let settleUntil = 0;

  let settling = false;


  function settleComposeDock(): void {
    settleUntil = Date.now() + SETTLE_BUDGET_MS;
    if (settling) return;
    settling = true;

    const step = (): void => {
      positionComposeDock();
      correctComposeDock();
      if (composeDock !== null && !composeDock.hidden && Date.now() < settleUntil) {
        lifetime.frame(step);
        return;
      }
      settling = false;
      // 動きが収まった。書こうとしている箇所が隠れていたら出し直す
      ensureDraftVisible();
    };
    lifetime.frame(step);
  }


  /** ドックの中身。 */
  function renderComposeDock(): void {
    if (composeDock === null || draft === null) return;
    composeDock.replaceChildren();
    // 中身を作り直すので、持っていた部品の参照は捨てる
    dockQuote = null;
    composeDock.appendChild(el("div", "peek-grab"));
    composeDock.appendChild(sheetComposer(draft));
  }


  /**
   * ドックとキーボードが隠している高さぶん、ページ側のスクロールに余白を持たせる。
   * ドックの上端から下は全部隠れているので、そこまでを避ける量とする。
   */
  function updateScrollPadding(): void {
    if (composeDock === null || composeDock.hidden) return;
    const html = document.documentElement;
    if (originalScrollPadding === null) originalScrollPadding = html.style.scrollPaddingBottom;
    const hidden = Math.max(0, layoutHeight() - composeDock.getBoundingClientRect().top);
    html.style.scrollPaddingBottom = `${Math.round(hidden)}px`;
  }


  /**
   * 書こうとしている箇所が、いま見えているかを確かめ、隠れていたら出し直す。
   *
   * ドックを開いた時点では見えていても、そのあとキーボードが出て隙間が狭くなり、
   * 印が上へ消えてしまうことがある。見えていれば何もしない。
   */
  function ensureDraftVisible(): void {
    if (composeDock === null || composeDock.hidden || draft === null) return;
    const mark = draft.marks[0];
    if (mark === undefined) return;

    const seen = window.visualViewport;
    const gapTop = seen?.offsetTop ?? 0;
    const gapBottom = composeDock.getBoundingClientRect().top;
    const rect = mark.getBoundingClientRect();
    if (isWithinGap(rect.top, rect.bottom, gapTop, gapBottom)) return;

    updateScrollPadding();
    mark.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }


  /** 選んだ文が、ドックに隠れない位置へ来るようにする。 */
  function scrollSelectionIntoView(): void {
    if (pendingScrollTarget === null) return;
    updateScrollPadding();
    pendingScrollTarget.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }


  function restoreScrollPadding(): void {
    if (originalScrollPadding === null) return;
    document.documentElement.style.scrollPaddingBottom = originalScrollPadding;
    originalScrollPadding = null;
  }


  /**
   * ドックを開く。
   *
   * 全幅の板と同時には出さない。書いている間もページを読めることが要なので、
   * 板が開いていれば先に閉じる。
   */
  function openComposeDock(): void {
    if (composeDock === null || draft === null) return;
    connections.readingNavigation?.close(false);

    // 板を引っ込めても、書きかけはドックへ持ち越す（dock.ts の afterOpenDock）
    const flow = afterOpenDock(currentFlow());
    if (state.open && !flow.sheetOpen) setOpen(false);
    syncDraft(flow);

    hideSelectionBar();
    hideMarkPeek();

    renderComposeDock();
    composeDock.hidden = false;
    // 開いた直後はキーボードが滑り込んでくる最中なので、収まるまで追う
    settleComposeDock();
    scrollSelectionIntoView();
    render();
  }


  function closeComposeDock(): void {
    // 書きかけをやめるなら、まだ残っている下書きの印も外す
    // （送信のときは控えへ移してあるので、ここには残っていない）
    if (draft !== null && draft.marks.length > 0) unwrapDraftMarks(draft.marks);
    // 書きかけが終わるのはここだけ（dock.ts の afterCloseDock）
    syncDraft(afterCloseDock(currentFlow()));
    pendingScrollTarget = null;
    restoreScrollPadding();
    if (composeDock !== null) {
      composeDock.hidden = true;
      composeDock.replaceChildren();
      dockShift = 0;
      dockDrag = 0;
      dockGesture = false;
      composeDock.classList.remove("is-dropping");
      composeDock.style.transform = "";
    }
    render();
  }


  function isDocked(): boolean {
    return composeDock !== null && !composeDock.hidden;
  }


  /**
   * ドックを下へ払って閉じる。
   *
   * 覗き見カードと同じ作法にそろえる: 指に 1:1 で付いてきて、
   * 払いきれば下へ抜けて閉じ、足りなければ元の位置へ戻る。
   * キーボードが出たままでも一続きの動きで閉じられる（閉じると同時に畳まれる）。
   *
   * 文字を打っているところ・ボタンの上から始めた動きは数えない。
   */
  function attachDockSwipe(target: HTMLElement): void {
    let startX = 0;
    let startY = 0;
    let axis: SwipeAxis = "undetermined";
    let tracking = false;

    target.addEventListener("pointerdown", (event) => {
      if (!isDocked()) return;
      // 入力欄やボタンの上から始めた動きは、払う操作ではない
      if (event.target instanceof Element && event.target.closest("textarea, input, button") !== null) {
        return;
      }
      startX = event.clientX;
      startY = event.clientY;
      axis = "undetermined";
      tracking = true;
    }, { signal: lifetime.signal });

    target.addEventListener(
      "pointermove",
      (event) => {
        if (!tracking) return;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        if (axis === "undetermined") axis = lockAxis(dx, dy);
        if (axis !== "vertical") return;
        // 後ろのページを道連れにしない
        event.preventDefault();
        dockGesture = true;
        // 閉じる向きは下だけ。上へは抵抗を掛けて、行き止まりだと手で分かるようにする
        setDockDrag(dy > 0 ? dy : rubberBand(dy), false);
      },
      { ...{ passive: false }, signal: lifetime.signal },
    );

    const finish = (event: PointerEvent): void => {
      if (!tracking) return;
      tracking = false;
      if (!dockGesture) return;

      const dy = event.clientY - startY;
      if (!isDownwardSwipe(event.clientX - startX, dy)) {
        // 払いきらなかった。元の位置へ戻し、そのあと置き直しに任せる
        setDockDrag(0, true);
        lifetime.timeout(() => {
          dockGesture = false;
          settleComposeDock();
        }, SWIPE_MS);
        return;
      }

      // 下端より下へ完全に送り出してから閉じる
      const height = target.getBoundingClientRect().height;
      setDockDrag(exitDrop(height, dockShift), true);
      lifetime.timeout(() => closeComposeDock(), SWIPE_MS);
    };

    target.addEventListener("pointerup", finish, { signal: lifetime.signal });
    target.addEventListener("pointercancel", (event) => finish(event), { signal: lifetime.signal });
  }


  /**
   * ページ側を縦に動かし始めたら、キーボードを畳む。
   *
   * 書きかけ・下書きの印・ドックはそのまま残る。畳んだあとのドックは
   * 下端に貼り付いた通常の姿へ戻り、そこから先はページだけが動く。
   * 判断そのものは dock.ts の `dismissesKeyboard` にある（数として確かめられるように）。
   */
  function attachKeyboardDismiss(): void {
    let startX = 0;
    let startY = 0;
    let startedInDock = false;
    let watching = false;

    const begin = (event: Event, x: number, y: number): void => {
      if (!isDockFocused()) return;
      startX = x;
      startY = y;
      startedInDock = composeDock !== null && event.composedPath().includes(composeDock);
      watching = true;
    };

    const move = (x: number, y: number): void => {
      if (!watching) return;
      const dismiss = dismissesKeyboard({
        keyboardVisible: isDockFocused(),
        startedInDock,
        dx: x - startX,
        dy: y - startY,
      });
      if (!dismiss) return;
      watching = false;
      collapseKeyboard();
    };

    const stop = (): void => {
      watching = false;
    };

    // 指の動きは pointer で拾う。ただし画面が動き出すとブラウザが pointer を取り上げるので、
    // 取り上げられたあとも来る touch のほうも同じ見張りに流す
    document.addEventListener("pointerdown", (event) => begin(event, event.clientX, event.clientY), { capture: true, signal: lifetime.signal });
    document.addEventListener("pointermove", (event) => move(event.clientX, event.clientY), { capture: true, signal: lifetime.signal });
    document.addEventListener("pointerup", stop, { capture: true, signal: lifetime.signal });
    document.addEventListener(
      "touchstart",
      (event) => {
        const touch = event.touches[0];
        if (touch !== undefined) begin(event, touch.clientX, touch.clientY);
      },
      { ...{ capture: true, passive: true }, signal: lifetime.signal },
    );
    document.addEventListener(
      "touchmove",
      (event) => {
        const touch = event.touches[0];
        if (touch !== undefined) move(touch.clientX, touch.clientY);
      },
      { ...{ capture: true, passive: true }, signal: lifetime.signal },
    );
    document.addEventListener("touchend", stop, { capture: true, signal: lifetime.signal });
  }


  /** キーボードを畳む。書きかけもドックも残す。 */
  function collapseKeyboard(): void {
    const active = connections.root?.activeElement;
    if (active instanceof HTMLElement) active.blur();
    // 畳んだあと、下端へ静かに着地するまで合わせる
    settleComposeDock();
  }
  return {
    dispose() { lifetime.dispose(); trackingDock = false; settling = false; restoreScrollPadding(); },
    syncMarks,
    flashCard,
    focusCard,
    applyFocus,
    selectFromMark,
    hideMarkPeek,
    isPeeking,
    renderPeek,
    attachInnerScroll,
    get peekSliding() { return peekSliding; },
    set peekSliding(value: boolean) { peekSliding = value; },
    attachPeekGestures,
    selectFromCard,
    isNarrow,
    hasFinePointer,
    appleKeys,
    clampWidth,
    applyPush,
    applyPanelShape,
    attachSheetDrag,
    tokenPx,
    applyViewportHeight,
    setOpen,
    setWidth,
    handleResize,
    placePopover,
    hidePopover,
    scheduleSelectionCheck,
    hideSelectionBar,
    discardDraft,
    dropDraft,
    trackComposeDock,
    settleComposeDock,
    updateScrollPadding,
    openComposeDock,
    closeComposeDock,
    isDocked,
    attachDockSwipe,
    attachKeyboardDismiss,
    get popover() { return popover; },
    set popover(value: HTMLElement | null) { popover = value; },
    get selectionBar() { return selectionBar; },
    set selectionBar(value: HTMLElement | null) { selectionBar = value; },
    get composeDock() { return composeDock; },
    set composeDock(value: HTMLElement | null) { composeDock = value; },
    nameSurface,
    get draft() { return draft; },
    set draft(value: Draft | null) { draft = value; },
    get draftFocused() { return draftFocused; },
    set draftFocused(value: boolean) { draftFocused = value; },
    get peek() { return peek; },
    set peek(value: PeekView) { peek = value; },
    get peekDragging() { return peekDragging; },
    set peekDragging(value: boolean) { peekDragging = value; },
    get peekHandoff() { return peekHandoff; },
    set peekHandoff(value: boolean) { peekHandoff = value; },
    get selectionTimer() { return selectionTimer; },
    set selectionTimer(value: number) { selectionTimer = value; },
    get adjustingSelection() { return adjustingSelection; },
    set adjustingSelection(value: boolean) { adjustingSelection = value; },
    get dockQuote() { return dockQuote; },
    set dockQuote(value: HTMLElement | null) { dockQuote = value; },
    get sheetOpenPending() { return sheetOpenPending; },
    set sheetOpenPending(value: boolean) { sheetOpenPending = value; },
    state
  };
}
