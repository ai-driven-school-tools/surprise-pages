import { createWidgetLifetime } from "../shared/widget-lifetime";
import { t } from "../shared/i18n";
import { writeClipboardText } from "../../lib/workspace/clipboard";
import {
  loadPageAccess,
  savePageAccess,
  type AccessChanges,
  type AccessGrant,
  type AccessGroup,
  type AccessRequest,
  type AccessScope,
  type PageAccessView
} from "../shared/api";
import type { State } from './types';
import {
  sharingVisible
} from "./dock";
import {
  SUCCESS_LIFE_MS,
  type ToastState
} from "../shared/toast";
import { ICON_SIZE } from "../shared/tokens";
import {
  ICON_CHECK,
  ICON_CLOSE,
  ICON_EYE,
  ICON_LINK,
  ICON_PLUS,
  ICON_TRASH,
  ICON_USERS,
  ICON_USER_PEN,
  el,
  icon,
  paintCopyLinkButton
} from "../shared/util";

/** Owns sharing behavior; receives only its required page/editor connections. */
type Host = {
  pushToast: (text: string, toastState: ToastState, retry?: () => void) => string;
  showError: (message: string) => void;
  barLink: HTMLButtonElement | null;
  narrowLink: HTMLButtonElement | null;
  setOpen: (open: boolean) => void;
  handleFailure: (result: { message: string; status: number; }) => void;
  render: () => void;
  renderPanelBody: () => void;
  actionButton: (label: string, paths: readonly string[], onClick: () => void, variant?: string, spokenLabel?: string) => HTMLButtonElement;
  state: Pick<State, "view" | "busy" | "slug" | "features" | "visibility" | "personal">;
};

export function createCommentSharing(connections: Host) {
  const lifetime = createWidgetLifetime();
  const pushToast: Host['pushToast'] = (...args) => connections.pushToast(...args);
  const showError: Host['showError'] = (...args) => connections.showError(...args);
  const setOpen: Host['setOpen'] = (...args) => connections.setOpen(...args);
  const handleFailure: Host['handleFailure'] = (...args) => connections.handleFailure(...args);
  const render: Host['render'] = (...args) => connections.render(...args);
  const renderPanelBody: Host['renderPanelBody'] = (...args) => connections.renderPanelBody(...args);
  const actionButton: Host['actionButton'] = (...args) => connections.actionButton(...args);
  const state: Pick<State, "access" | "accessEmail" | "accessInvited" | "accessScopeTo" | "accessRevokeId" | "accessApproveId" | "view" | "busy" | "slug" | "features" | "visibility" | "personal"> = {
    access: null,
    accessEmail: "",
    accessInvited: null,
    accessScopeTo: null,
    accessRevokeId: null,
    accessApproveId: null,
    get view() { return connections.state.view; }, set view(value: State["view"]) { connections.state.view = value; },
    get busy() { return connections.state.busy; }, set busy(value: State["busy"]) { connections.state.busy = value; },
    get slug() { return connections.state.slug; }, set slug(value: State["slug"]) { connections.state.slug = value; },
    get features() { return connections.state.features; }, set features(value: State["features"]) { connections.state.features = value; },
    get visibility() { return connections.state.visibility; }, set visibility(value: State["visibility"]) { connections.state.visibility = value; },
    get personal() { return connections.state.personal; }, set personal(value: State["personal"]) { connections.state.personal = value; }
  };
  let linkCopied = false;
  let linkCopiedTimer = 0;


  // ---------------------------------------------------------------------------
  // 共有
  // ---------------------------------------------------------------------------

  function pageUrl(): string {
    return `${window.location.origin}${window.location.pathname}`;
  }


  function showNotice(message: string): void {
    pushToast(message, "success");
  }


  async function copyText(
    text: string,
    done: string,
    failure: string = t("toolbox.share.copyFailed"),
  ): Promise<boolean> {
    const written = await writeClipboardText(text);
    if (lifetime.disposed) return false;
    if (written) showNotice(done);
    else showError(failure);
    return written;
  }


  /**
   * いま見ているページの URL を写す。
   *
   * コメント 1 件へのリンク（#c=）とは別の口。あちらはコメントのカードからで、
   * 右下の鎖をチェックに差し替える対象ではない。
   */
  async function copyPageUrl(): Promise<void> {
    const ok = await copyText(pageUrl(), t("toolbox.common.linkCopied"));
    if (lifetime.disposed) return;
    if (ok) markLinkCopied();
  }


  function paintCopyButtons(): void {
    if (connections.barLink !== null) paintCopyLinkButton(connections.barLink, linkCopied);
    if (connections.narrowLink !== null) paintCopyLinkButton(connections.narrowLink, linkCopied);
  }


  /**
   * 鎖をチェックに差し替え、知らせと同じ長さで戻す。
   *
   * バー全体は作り直さない。コメント一覧の位置が飛び、書いていた途中も消える。
   */
  function markLinkCopied(): void {
    linkCopied = true;
    lifetime.clearTimeout(linkCopiedTimer);
    paintCopyButtons();
    linkCopiedTimer = lifetime.timeout(() => {
      linkCopied = false;
      paintCopyButtons();
    }, SUCCESS_LIFE_MS);
  }


  /**
   * 選んだ文章そのものを写し取る（空の入力欄で ⌘C を押したとき）。
   *
   * 失敗しても叱らない。空の入力欄で ⌘C を押したときの既定の動きは「何も起きない」で、
   * 元より悪くなることが無いため。断り書きを出すほうが、かえって手を止めさせる。
   */
  async function copyQuote(quote: string): Promise<void> {
    // 写せなくても黙って既定どおりにする（許可が下りない・安全な文脈でない、はこちらでは直せない）
    if (!(await writeClipboardText(quote)) || lifetime.disposed) return;
    showNotice(t("toolbox.share.quoteCopied"));
  }


  // ---------------------------------------------------------------------------
  // 共有範囲（このページを誰に見せるか）
  // ---------------------------------------------------------------------------

  /**
   * 危ないほうへ倒すときに、先に読ませる 1 文。
   *
   * 「よろしいですか」だけの問いは、何が起きるかを言っていないので使わない。
   * ここで断るのは**見える人が増える**ほうだけ。減らすほうは押し直せば戻るので、
   * 念押しを付けると手数だけが増える。
   */
  const ACCESS_OPEN_WARNING = t("toolbox.access.openWarning");


  /**
   * 社外へ出す 1 手の念押し。
   *
   * ここだけは「押し直せば戻る」が成り立たない。URL が閉じても、社外の人が
   * もう読んだことは戻らない。だから何が起きるかを言い切ってから進める。
   * 社内の URL（`/internal/…`）はそのまま生きていることも言う——貼ってあるリンクが
   * 死ぬのではないかという心配で、押す手が止まらないように。
   */
  /**
   * 検索と、公開の本当のリスク。**この 1 文で対にする。**
   *
   * 検索避けは 3 枚重ねで止めてある（応答の頭・ページの札・robots.txt。1 枚でも
   * 欠けたら検査表が落ちる）ので、「出ません」と言い切ってよい。
   *
   * ただし**そこだけ言うと、安心だけを渡して肝心のリスクを隠すことになる。**
   * 公開の危うさは検索ではなく人の手にある——渡した先から先へ転送されるのも、
   * 貼り付けられるのも、画面を写されるのも、こちらからは追えない。
   * 「出ません」と「追えません」を続けて置くことで、片方だけが記憶に残らないようにする。
   */
  // （この 1 文は公開の念押しの 2 つに、それぞれの文の中で入っている。辞書の toolbox.access.publishWarning を見る）


  /**
   * 押す前にやること。**状態の説明とは別の段落に置く。**
   *
   * 何が起きるか（上の文）を読めても、自分のページを見返す動きにはならない。
   * 一度出したものは、URL を閉じても「もう読まれた」が戻らないので、
   * 押す前にこちらから頼む。
   *
   * 灰色の小さい字にしない——読み飛ばしてよい補足ではなく、いまやることなので、
   * 状態の説明と同じ強さで置く。
   */
  const ACCESS_REVIEW_NOTE = t("toolbox.access.reviewNote");


  const ACCESS_PUBLISH_WARNING = t("toolbox.access.publishWarning");


  /**
   * 名簿で絞った状態から、いきなり社外へ出す 1 手。
   *
   * 2 つのことが同時に起きるので、両方を言う。名簿の話を落とすと、絞ったつもりの
   * ページが社外に出たことに気づけない。
   */
  const ACCESS_PUBLISH_FROM_LIST_WARNING = t("toolbox.access.publishFromListWarning");


  /** 共有範囲の項目を、この人に出してよいか。決めるのは dock.ts の 1 か所。 */
  function canManageAccess(): boolean {
    return sharingVisible({
      allowed: state.features.sharing,
      openToAnyone: state.visibility === "public",
    });
  }


  async function openAccess(): Promise<void> {
    // 出していないはずの入り口から呼ばれても開かない（門はここでももう一度見る）
    if (!canManageAccess()) return;
    state.view = "access";
    setOpen(true);

    if (state.access !== null) return;
    const result = await loadPageAccess(state.slug);
    if (lifetime.disposed) return;
    if (!result.ok) {
      // 取れなかったのに板だけ残すと、「読み込んでいます」から動かない画面を見せ続ける。
      // 何が起きたかは知らせが言うので、板はコメントに戻す
      if (state.view === "access") state.view = "comments";
      handleFailure(result);
      return;
    }
    state.access = result.value;
    render();
  }


  /**
   * 共有範囲を書き換える。
   *
   * 返ってきた姿をそのまま採る。手元で組み立て直すと、別の画面で同時に触られたときに
   * 画面の中だけが正しい、という食い違いが残る。
   */
  async function saveAccess(changes: AccessChanges, done?: string): Promise<boolean> {
    state.busy = true;
    state.accessInvited = null;
    render();

    const result = await savePageAccess(state.slug, changes);
    if (lifetime.disposed) return false;
    state.busy = false;
    if (!result.ok) {
      handleFailure(result);
      return false;
    }
    state.access = result.value;
    state.accessScopeTo = null;
    state.accessRevokeId = null;
    state.accessApproveId = null;
    render();
    // 知らせるのは**書けたあと**だけ。先に出すと、断られたのに「やりました」が残る
    if (done !== undefined) showNotice(done);
    return true;
  }


  /** いま見せてある人のアドレス（送り直す並びのもと）。 */
  function grantedMembers(access: PageAccessView): string[] {
    const list: string[] = [];
    for (const grant of access.grants) {
      if (grant.kind === "member" && grant.memberEmail !== null) list.push(grant.memberEmail);
    }
    return list;
  }


  /** いま見せてあるグループの id。 */
  function grantedGroups(access: PageAccessView): string[] {
    const list: string[] = [];
    for (const grant of access.grants) {
      if (grant.kind === "group" && grant.groupId !== null) list.push(grant.groupId);
    }
    return list;
  }


  function grantLabel(grant: AccessGrant): string {
    if (grant.kind === "member") return grant.memberEmail ?? t("toolbox.access.unknownMember");
    return grant.groupName ?? t("toolbox.access.goneGroup");
  }


  function addMember(access: PageAccessView): void {
    const email = state.accessEmail.trim();
    if (email.length === 0) return;

    const now = grantedMembers(access);
    if (now.some((one) => one.toLowerCase() === email.toLowerCase())) {
      showError(t("toolbox.access.alreadyAdded"));
      return;
    }
    state.accessEmail = "";
    void saveAccess({ members: [...now, email] }).then((saved) => {
      if (!saved || !state.personal || lifetime.disposed) return;
      state.accessInvited = email;
      render();
    });
  }


  function revokeGrant(access: PageAccessView, grant: AccessGrant): void {
    if (grant.kind === "member") {
      const keep = grantedMembers(access).filter((one) => one !== grant.memberEmail);
      void saveAccess({ members: keep });
      return;
    }
    void saveAccess({ groups: grantedGroups(access).filter((one) => one !== grant.groupId) });
  }


  /** 念押しの一組（何が起きるかの 1 文 → 進む・やめる）。作りは 1 つだけにする。 */
  function accessConfirm(
    sentence: string,
    label: string,
    paths: readonly string[],
    onConfirm: () => void,
    /** 押す前にやること。渡したときだけ、状態の説明の下に別の段落で出す */
    todo?: string,
  ): HTMLElement {
    const box = el("div", "access-confirm");
    box.appendChild(el("p", "access-warning", sentence));
    if (todo !== undefined) box.appendChild(el("p", "access-warning", todo));

    const row = el("div", "access-row");
    row.appendChild(actionButton(label, paths, onConfirm, "is-danger"));
    row.appendChild(
      actionButton(t("toolbox.common.cancel"), ICON_CLOSE, () => {
        state.accessScopeTo = null;
        state.accessRevokeId = null;
        state.accessApproveId = null;
        renderPanelBody();
      }),
    );
    box.appendChild(row);
    return box;
  }


  /**
   * 見える人の広さ。**念押しが要るかは、この順が上がるかどうかだけで決まる。**
   *
   * 向きごとに条件を書き比べない（6 通りある）。数の大小 1 つにしておけば、
   * 見せ方が 4 つ目に増えても、ここに並べるだけで決まりが効き続ける。
   */
  const SCOPE_WIDTH: Readonly<Record<AccessScope, number>> = {
    restricted: 0,
    internal: 1,
    public: 2,
  };


  /** その行き先へ動かすときに出す念押し。狭くなる向きは無し（押し直せば戻る）。 */
  function scopeWarning(from: AccessScope, to: AccessScope): string | null {
    if (SCOPE_WIDTH[to] <= SCOPE_WIDTH[from]) return null;
    if (to === "internal") return ACCESS_OPEN_WARNING;
    return from === "restricted" ? ACCESS_PUBLISH_FROM_LIST_WARNING : ACCESS_PUBLISH_WARNING;
  }


  /**
   * 念押しの「進む」に出す字と絵。
   *
   * 並ぶのは**広がる向きの行き先だけ**。いちばん狭い「選んだ人だけ」へ広がることは
   * ないので、ここには要らない（狭まる向きは念押しを出さずにそのまま動かす）。
   */
  /** 選び分けの名前。行にも、念押しの見出しにも、同じ字を使う。 */
  const SCOPE_LABEL: Readonly<Record<AccessScope, string>> = {
    restricted: t("toolbox.access.scope.restricted"),
    internal: t("toolbox.access.scope.internal"),
    public: t("toolbox.access.scope.public"),
  };


  const SCOPE_ACTION: Readonly<
    Record<"internal" | "public", { label: string; icon: readonly string[] }>
  > = {
    internal: { label: t("toolbox.access.action.internal"), icon: ICON_USERS },
    public: { label: t("toolbox.access.action.public"), icon: ICON_LINK },
  };


  /**
   * いまの見せ方で渡す URL。
   *
   * **いま開いている URL から作らない。** 社内として投稿したページを公開に切り替えても
   * 呼び名は `internal/…` のままなので、この板は `/internal/…` を開いたまま出ていることが多い。
   * 呼び名から組み立てれば、どちらの入口から開いていても同じ 1 本になる。
   *
   * 公開なら社外に渡す `/public/…`、それ以外は社内向けの `/internal/…`。呼び名が `public/…` の
   * ページは公開から動かせないので（`switchable` が偽）、`/internal/…` を作ることはない。
   */
  function shareUrlOf(scope: AccessScope): string {
    const rest = state.slug.split("/").slice(1).join("/");
    return `${window.location.origin}/${scope === "public" ? "public" : "internal"}/${rest}`;
  }


  /**
   * いまの見せ方で渡す URL と、写す口。
   *
   * **どの見せ方でも出す。** 見せる相手を決めたその足で渡したくなるので、ここに無いと
   * 右下のバーまで戻ることになる。字は「リンクをコピー」でそろえる（バーの口と同じ
   * 役割なので、同じ字にする）。どちらの入口の URL かは、出ている字そのものが示す。
   */
  function accessShareLink(scope: AccessScope): HTMLElement {
    const url = shareUrlOf(scope);
    const box = el("div", "access-link");
    box.appendChild(el("span", "access-url", url));
    box.appendChild(
      actionButton(t("toolbox.common.copyLink"), ICON_LINK, () => {
        void copyText(url, t("toolbox.common.linkCopied"));
      }),
    );
    return box;
  }


  /**
   * 「社内の全員」「選んだ人だけ」「社外の誰でも」の選び分け。
   *
   * **どこからどこへでも 1 手で動く。** 隣どうししか動かせない形にしていたころは、
   * 名簿で絞った状態から社外へ出すのに「いったん社内の全員に戻す」を挟ませていた。
   * 遠回りの理由（名簿を作った判断を飛び越えさせない）は作り手の都合で、押す人には
   * 「押せないボタン」としか見えない。何が起きるかは念押しで言えば足りる。
   *
   * 念押しを出すのは**見える人が広がる向き**だけ（狭くなるほうは押し直せば戻る）。
   * 向きの判定は `SCOPE_WIDTH` の大小 1 つに寄せてある。
   */
  function accessScope(access: PageAccessView): HTMLElement {
    const box = el("div", "access-scope");
    const scope = access.scope;

    /** 押されたときの 1 手。広がる向きなら念押しを出し、狭まる向きならそのまま動かす。 */
    const go = (to: AccessScope): void => {
      if (to === scope) return;
      if (scopeWarning(scope, to) === null) {
        void saveAccess({ scope: to });
        return;
      }
      state.accessScopeTo = to;
      state.accessRevokeId = null;
      renderPanelBody();
    };

    /*
     * 縦に並べて、**1 つだけ選ぶ印（丸）**で持つ。
     *
     * 横に並べた丸角のボタンは「表示の切り替え（タブ）」の記号で、押すと下の中身が
     * 入れ替わるという約束を運んでしまう。ここで起きるのは値の書き換えなので、
     * 記号と振る舞いが食い違っていた。丸なら「どれか 1 つを選ぶ」とだけ読める。
     *
     * そして**選んだものに属する設定を、その下に字下げして入れる**。
     * 名簿（見せる人・見せるグループ）が意味を持つのは「選んだ人だけ」のときだけで、
     * 3 択と同じ高さに並べていたころは、どの選択肢の設定なのかが画面に出ていなかった。
     * 親子は字下げだけで示す——縦線も囲みも帯も引かない。
     */
    const choices: readonly AccessScope[] = [
      "restricted",
      ...(state.personal ? [] : (["internal"] as const)),
      ...(access.switchable ? (["public"] as const) : []),
    ];

    for (const choice of choices) {
      box.appendChild(accessScopeRow(SCOPE_LABEL[choice], scope === choice, () => go(choice)));
      // いま選ばれているものの下に、その選択肢に属するものを入れる
      if (scope === choice) box.appendChild(accessScopeDetail(access, choice));
    }
    return box;
  }


  /**
   * 見せ方を広げる前の念押し。**板の中身をこれだけに差し替える。**
   *
   * 丸（ラジオ）は「押した瞬間に選ばれる」記号なので、押しても丸が動かないと
   * 「反応しなかった」と読まれる。かといって先に丸を動かすと、まだ書いていない
   * 状態を選ばれたことにしてしまう。だから**押した瞬間に板の中身が入れ替わる**
   * ——選び分けそのものが消えて、答えるべき問いだけが残る。何かが起きたことは
   * 画面が変わったことで伝わり、丸と実際の状態が食い違うこともない。
   *
   * 行き先を見出しで言う。中身が入れ替わって選び分けが見えなくなるので、
   * どこへ動こうとしているのかを文の中だけに置くと読み落とす。
   */
  function accessScopeConfirm(scope: AccessScope, going: AccessScope): HTMLElement | null {
    if (going === "restricted") return null;
    const warning = scopeWarning(scope, going);
    if (warning === null) return null;

    const action = SCOPE_ACTION[going];
    const box = el("div", "access-part");
    box.appendChild(el("h3", "access-head", t("toolbox.access.switchTo", { scope: SCOPE_LABEL[going] })));
    box.appendChild(
      accessConfirm(
        warning,
        action.label,
        action.icon,
        () => void saveAccess({ scope: going }),
        // 中身の見直しを頼むのは社外へ出す 1 手だけ。社内に戻すほうは読む人が変わらない
        going === "public" ? ACCESS_REVIEW_NOTE : undefined,
      ),
    );
    return box;
  }


  /** 選び分けの 1 行（丸と名札）。 */
  function accessScopeRow(label: string, on: boolean, onPick: () => void): HTMLElement {
    const row = el("label", "check-row");
    const input = el("input");
    input.type = "radio";
    input.name = "surprise-access-scope";
    input.className = "check-input";
    input.checked = on;
    // いま選ばれているものは押しても何も起きないので、口として出さない
    input.disabled = state.busy || on;

    const mark = el("span", "radio-mark");
    row.appendChild(input);
    row.appendChild(mark);
    row.appendChild(el("span", "check-label", label));

    input.addEventListener("change", () => {
      if (input.checked) onPick();
    }, { signal: lifetime.signal });
    row.addEventListener("click", (event) => event.stopPropagation(), { signal: lifetime.signal });
    return row;
  }


  /** 選んだものに属する説明と設定。 */
  function accessScopeDetail(access: PageAccessView, scope: AccessScope): HTMLElement {
    const box = el("div", "scope-child");

    if (scope === "public") {
      box.appendChild(el("p", "note", t("toolbox.access.publicNote")));
      box.appendChild(accessShareLink(scope));
      box.appendChild(el("p", "note", t("toolbox.access.publicCloseNote")));
      if (state.personal) box.appendChild(accessPeople(access));
      return box;
    }

    if (scope === "internal") {
      box.appendChild(el("p", "note", t("toolbox.access.internalNote")));
      box.appendChild(accessShareLink(scope));
      return box;
    }

    box.appendChild(el("p", "note", state.personal ? t("toolbox.access.restrictedNotePersonal") : t("toolbox.access.restrictedNote")));
    box.appendChild(accessShareLink(scope));
    // 待たせている人がいれば先に出す。この板でいちばん答えを急ぐのはここ
    const waiting = accessRequests(access);
    if (waiting !== null) box.appendChild(waiting);
    box.appendChild(accessPeople(access));
    if (!state.personal) box.appendChild(accessGroups(access));
    return box;
  }


  /**
   * 許可 1 件の行。取り消す前に、誰が見られなくなるかを言い切る。
   *
   * 作った人（共同）（役割つきの許可）は、名前の下の細字でそう言う。行を色で塗り分けたり
   * 印を足したりしない——並んでいるのは同じ「見せてある相手」で、違うのは役割 1 つだけ。
   * 付け替えの口は個人あての行にだけ出す。まとまりには役割を持たせない。
   *
   * ボタンの読み上げ名には相手の名を入れる。同じ字のボタンが行の数だけ並ぶので、
   * 字だけ読み上げても、どの人への操作なのかが分からない。
   */
  function accessGrantRow(access: PageAccessView, grant: AccessGrant): HTMLElement {
    if (state.accessRevokeId === grant.id) {
      const sentence =
        state.personal && access.scope === "public"
          ? t("toolbox.access.revokeToolsSentence", { who: grantLabel(grant) })
          : grant.kind === "member"
            ? t("toolbox.access.revokeMemberSentence", { who: grantLabel(grant) })
            : t("toolbox.access.revokeGroupSentence", { who: grantLabel(grant) });
      return accessConfirm(sentence, t("toolbox.access.revoke"), ICON_TRASH, () => revokeGrant(access, grant));
    }

    const row = el("div", "access-row");
    const who = el("div", "access-name");
    who.appendChild(el("span", undefined, grantLabel(grant)));
    if (grant.role === "owner") who.appendChild(el("p", "note", t("toolbox.access.coOwner")));
    row.appendChild(who);

    /*
     * 自分の行には、どちらの口も出さない。
     *
     * 「閲覧に戻す」を押せば共有を触る力が、「取り消す」を押せばページを見る力そのものが
     * 自分から外れ、外したあとは自分では戻せない（もうこの板が開かない）。
     * 出さないのは自分が作った人（共同）として載っている行だけで、見るだけの人として
     * 載っているだけなら今までどおり自分で外せる。**入口でも同じことを断っている**——
     * 画面で隠すだけでは、通信を作れば通ってしまう。
     */
    if (grant.mine && grant.role === "owner") {
      row.appendChild(el("span", "note", t("toolbox.access.itsYou")));
      return row;
    }

    if (grant.kind === "member" && !state.personal) {
      row.appendChild(
        grant.role === "owner"
          ? actionButton(
            t("toolbox.access.toViewer"),
            ICON_EYE,
            () => void saveAccess({ role: { id: grant.id, to: "viewer" } }),
            undefined,
            t("toolbox.access.toViewerLabel", { who: grantLabel(grant) }),
          )
          : actionButton(
            t("toolbox.access.toOwner"),
            ICON_USER_PEN,
            () => void saveAccess({ role: { id: grant.id, to: "owner" } }),
            undefined,
            t("toolbox.access.toOwnerLabel", { who: grantLabel(grant) }),
          ),
      );
    }

    row.appendChild(
      actionButton(
        t("toolbox.access.revoke"),
        ICON_TRASH,
        () => {
          state.accessRevokeId = grant.id;
          state.accessScopeTo = null;
          renderPanelBody();
        },
        "is-danger",
        t("toolbox.access.revokeLabel", { who: grantLabel(grant) }),
      ),
    );
    return row;
  }


  /** 申し出を出した人の呼び方。名前が分かっていても、誰かを取り違えないようにアドレスも添える。 */
  function requesterLabel(request: AccessRequest): string {
    if (request.requesterName === null) return request.requesterEmail;
    return `${request.requesterName}（${request.requesterEmail}）`;
  }


  /**
   * 「見せてほしい」と言っている人の段。
   *
   * 0 件なら段ごと出さない（中身の無い見出しを置かない）ので、戻り値は null になりうる。
   *
   * 制限が外れているときも出さない。社内の全員が見られる状態では、答えても
   * 何も変わらないのに「見られるようになります」と言うことになる。
   * また制限を付ければ、積まれたままの申し出がここに戻ってくる。
   */
  function accessRequests(access: PageAccessView): HTMLElement | null {
    if (access.requests.length === 0) return null;

    const box = el("div", "access-part");
    box.appendChild(el("h3", "access-head", t("toolbox.access.requests")));

    for (const request of access.requests) {
      if (state.accessApproveId === request.id) {
        box.appendChild(
          accessConfirm(
            t("toolbox.access.approveSentence", { who: requesterLabel(request) }),
            t("toolbox.access.approveConfirm"),
            ICON_CHECK,
            () => void saveAccess({ answer: { id: request.id, approved: true } }),
          ),
        );
        continue;
      }

      const row = el("div", "access-row");
      row.appendChild(el("span", "access-name", requesterLabel(request)));
      row.appendChild(
        actionButton(t("toolbox.access.approve"), ICON_CHECK, () => {
          state.accessApproveId = request.id;
          state.accessRevokeId = null;
          state.accessScopeTo = null;
          renderPanelBody();
        }),
      );
      // 却下は押し直しがきく（断られた人は、また頼める）。念押しは挟まない
      row.appendChild(
        actionButton(t("toolbox.access.deny"), ICON_CLOSE, () =>
          void saveAccess({ answer: { id: request.id, approved: false } }),
        ),
      );
      box.appendChild(row);
    }
    return box;
  }


  /** 個人あてに出した許可と、アドレスで足す口。 */
  function accessPeople(access: PageAccessView): HTMLElement {
    const box = el("div", "access-part");
    box.appendChild(el("h3", "access-head", state.personal && access.scope === "public" ? t("toolbox.access.peopleTools") : t("toolbox.access.people")));

    const rows = access.grants.filter((grant) => grant.kind === "member");
    if (rows.length === 0) box.appendChild(el("p", "note", state.personal && access.scope === "public" ? t("toolbox.access.noPeopleTools") : t("toolbox.access.noPeople")));
    // 押すと何ができる人になるのかを、その口が出ているときだけ言う
    else box.appendChild(el("p", "note", state.personal ? t("toolbox.access.invitedNote") : t("toolbox.access.coOwnerNote")));
    for (const grant of rows) box.appendChild(accessGrantRow(access, grant));
    // 配布版には知らせの手段が無い（会社の Slack もメールも使わない）。送るリンクは板の上に
    // いつも出ているので、ここではそれを指すだけにする（同じリンクを 2 度並べない）
    if (state.personal && state.accessInvited !== null) {
      box.appendChild(el("p", "note", t("toolbox.access.invited", { who: state.accessInvited })));
    }

    const add = el("div", "access-add");
    const field = el("input");
    field.type = "email";
    field.value = state.accessEmail;
    field.placeholder = t("toolbox.access.emailPlaceholder");
    if (state.personal) field.placeholder = t("toolbox.access.emailPlaceholderPersonal");
    field.addEventListener("input", () => {
      state.accessEmail = field.value;
    }, { signal: lifetime.signal });
    field.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      addMember(access);
    }, { signal: lifetime.signal });
    add.appendChild(field);

    /*
     * 塗りの口（`is-primary`）は使わない。
     *
     * あれは**その板でやりたいこと**に取ってある（編集の「保存」、Slack への「投稿」）。
     * この板でやりたいのは「誰に見せるか」を決めることで、主役は上の選び分け。
     * アドレスを足すのはその中の一手段なので、塗りを当てると主役より強くなり、
     * 板の中でいちばん目を引くのが入力欄の塊になる。
     * 板の中のほかの口（見せる・やめる・取り消す）と同じ語彙にそろえる。
     */
    const button = actionButton(t("toolbox.access.add"), ICON_PLUS, () => addMember(access), "is-strong");
    button.disabled = state.busy;
    add.appendChild(button);
    box.appendChild(add);
    return box;
  }


  /** 閲覧グループあてに出した許可と、まだ足していないグループの一覧。 */
  function accessGroups(access: PageAccessView): HTMLElement {
    const box = el("div", "access-part");
    box.appendChild(el("h3", "access-head", t("toolbox.access.groups")));

    if (access.groups.length === 0) {
      box.appendChild(el("p", "note", t("toolbox.access.noGroups")));
      return box;
    }

    /*
     * 入り切りの四角で持つ。
     *
     * 行ごとに「足す」「取り消す」の口を出していたころは、同じ語が行の数だけ並び、
     * しかも足した行が上へ動いた（許可済みを上に寄せていたため）。押した瞬間に
     * 行が動くのは、押した人がいちばん驚く。
     *
     * 四角なら状態がその場に出るので、**並びを名前順に固定できる**（動かない）。
     * 語も要らない——入っているかどうかを言うのは四角の役目。
     * 部品は既にあるもの（送信欄の「Slack のスレッドに送る」）を使い回す。
     *
     * 念押しは出さない。外す向きは見える人が減るだけで、押し直せば戻る。
     * 何が起きたかは知らせ（トースト）が言う。
     */
    const granted = new Set(grantedGroups(access));
    for (const group of access.groups) {
      box.appendChild(accessGroupToggle(access, group, granted.has(group.id)));
    }
    return box;
  }


  /** グループ 1 つの入り切り。 */
  function accessGroupToggle(
    access: PageAccessView,
    group: AccessGroup,
    on: boolean,
  ): HTMLElement {
    const row = el("label", "check-row");
    const input = el("input");
    input.type = "checkbox";
    input.className = "check-input";
    input.checked = on;
    input.disabled = state.busy;

    const mark = el("span", "check-mark");
    mark.appendChild(icon(ICON_CHECK, ICON_SIZE.small));

    row.appendChild(input);
    row.appendChild(mark);
    row.appendChild(el("span", "check-label", group.name));

    input.addEventListener("change", () => {
      const now = grantedGroups(access);
      const next = input.checked ? [...now, group.id] : now.filter((id) => id !== group.id);
      const done = input.checked
        ? t("toolbox.access.groupOn", { group: group.name })
        : t("toolbox.access.groupOff", { group: group.name });
      void saveAccess({ groups: next }, done);
    }, { signal: lifetime.signal });
    row.addEventListener("click", (event) => event.stopPropagation(), { signal: lifetime.signal });
    return row;
  }


  function accessView(): HTMLElement {
    const box = el("div", "access");
    const access = state.access;

    if (access === null) {
      box.appendChild(el("div", "empty", t("toolbox.common.loading")));
      return box;
    }

    /*
     * 見せ方を広げようとしている間は、**板の中身を念押しだけに差し替える**。
     * 丸が動かないまま選び分けを出しておくと「押したのに反応しない」と読まれる。
     */
    const going = state.accessScopeTo;
    if (going !== null) {
      const confirm = accessScopeConfirm(access.scope, going);
      if (confirm !== null) {
        box.appendChild(confirm);
        return box;
      }
    }

    /*
     * 板の中身は選び分け 1 つだけ。名簿も申し出も、**選んだ選択肢の子**として
     * その中に入る（accessScopeDetail）。3 択と同じ高さに並べていたころは、
     * どの選択肢の設定なのかが画面に出ていなかった。
     */
    box.appendChild(accessScope(access));
    return box;
  }
  return {
    dispose() { lifetime.dispose(); },
    pageUrl,
    showNotice,
    copyText,
    copyPageUrl,
    copyQuote,
    canManageAccess,
    openAccess,
    accessView,
    get linkCopied() { return linkCopied; },
    set linkCopied(value: boolean) { linkCopied = value; },
    state
  };
}
