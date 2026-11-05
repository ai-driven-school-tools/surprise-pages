import { MARK_FOLD_PATH, MARK_ROUND, MARK_SHEET_PATH, MARK_TILE_RADIUS, MARK_VIEW_BOX } from "../../lib/settings/brand";
import { previousUrl, readHistorySteps, watchHistorySteps } from "../../lib/revisions/history-steps";
import { TITLEBAR_HEIGHT, TITLEBAR_START_CSS } from "../../lib/workspace/window-titlebar";
import { paintPageTone } from "./page-ground";
import {
  FAVORITES_PLACE,
  HOME_PLACE,
  LIBRARY_PLACE,
  MINE_PLACE,
  placeLabel,
  placeOfPath,
  sidebarOrganizationName,
  type WorkspacePlace,
} from "../../lib/workspace/places";
import { LOCATION_BAR_STYLES } from "./location-bar-styles";
import { organizationFromTag, t } from "../shared/i18n";
import { topInset } from "./top-inset";
import type { CommentAuthor, PageVersion } from "../../lib/comments/types";
import {
  el,
  icon,
  ICON_CHEVRON_LEFT,
  ICON_CHEVRON_RIGHT,
  ICON_CIRCLE_USER,
  ICON_COMPANY,
  ICON_FOLDER,
  ICON_HOME,
  ICON_LOGOUT,
  ICON_SETTINGS,
  ICON_STAR,
  updatedDay,
} from "../shared/util";

/**
 * 現在地の行。ページの上端に「どの一覧から来て、いま何を見ているか」を 1 行で出す。
 *
 *   ブラウザ            ◆  会社の資料 / 見本の企画案              ☆  10月3日 更新 · 第12版  (顔)
 *   デスクトップアプリ   ● ● ●  ‹ ›  ◆  会社の資料 / 見本の企画案  ☆  10月3日 更新 · 第12版  (顔)
 *
 * 左端の印（◆）は製品の印（src/lib/settings/brand.ts。サイドバーの頭と同じ形）で、押すとホーム（`/`）。「ロゴ＝ホーム」は説明なしで通じる。
 * 右端の顔は、いま誰として見ているか。押すと**サイドバーを畳んだメニュー**（ホーム・自分の資料・会社の資料・お気に入り・
 * 個人設定・ログアウト）が開く。一覧の画面ではサイドバーが答えている「どこへ行くか・自分は誰か」を、ページの上では
 * 顔が答える。行き先の名前は `src/lib/workspace/places.ts`（サイドバーと同じ正本）から引き、新しい語彙を増やさない。
 * 「自分の活動」（/activity）は、サイドバーと同じくここにも置かない——ホームの「最近見た」の「すべて見る」が入口。
 * 顔の中身は名乗りから（showSelf）。名乗っていなければ輪郭で、メニューは「Pages を開く」の 1 行だけ。
 * ふだんこの行は製品の部品（墨はワークスペース）なので、「このページの道具」である右下の道具箱には顔を置かない。
 *
 * 「いつ・何版目」は、いま出ている版のこと。押すと道具箱の履歴が開く（版の一覧と同じ数え方）。
 * 出すのは履歴を見てよい人の画面で、版が分かってから（分かるまでは何も置かない。字が後から出るだけで行は動かない）。
 * その左の星は、このページを自分のお気に入りに入れているか（一覧の行の星と同じ絵・同じ 2 態）。押すと付け外し。
 * 出すのはサーバーの答えに載っているときだけ（showFavorite）。サイドバーから開いた人が、ここで外して戻れる。
 *
 * ページを開くと一覧（ワークスペースの画面）が画面ごと入れ替わり、どこにいるのか・どう戻るのかの
 * 手がかりが消えていた。場所の名前を押すと、その一覧へ戻る——**来た一覧なら履歴を 1 つ戻る**ので、
 * 離れたときのスクロール位置・絞り込み・検索語のまま出る（一覧の側は URL と控えで状態を持っている）。
 *
 * デスクトップアプリでは、この行が窓の題名の帯を兼ねる（信号機ボタンの右に、戻る・進む）。
 * 見分けはブラウザが知らせる窓の枠の幅だけで、アプリから何かを受け取る口は無い（src/lib/workspace/window-titlebar.ts）。
 *
 * 入れ物は道具箱とは別の Shadow DOM。本文の文字数（コメントの位置）にも書き出しにも数えられない。
 */
export const LOCATION_TAG = "surprise-location";

/** ワークスペースの絵（`src/app/_components/icons.tsx`）と同じ線の太さ。一覧の画面の戻る・進むと見分けが付かないようにする。 */
const STROKE = 1.5;

type Origin = {
  readonly label: string;
  readonly href: string;
  /** 履歴を 1 つ戻れば着くか（着くなら、移動ではなく戻る）。 */
  readonly viaBack: boolean;
};

/**
 * 戻る先の場所。
 *
 * 1 つ前に見ていたのが一覧なら、その一覧（絞り込みや検索語の付いた URL ごと）。
 * そうでなければ——Slack のリンクから直に開いた・ページからページへ移った——会社の資料。
 * 「自分の資料」にはしない。開いているのが他の人の資料のとき、行が嘘をつく。
 */
export function originOf(view: Window): Origin {
  const previous = previousUrl(view);
  const place = previous === null ? null : placeOfPath(previous.url.pathname);
  if (previous !== null && place !== null) {
    return { label: placeLabel(place, t), href: `${previous.url.pathname}${previous.url.search}`, viaBack: previous.reachable };
  }
  return { label: placeLabel(LIBRARY_PLACE, t), href: LIBRARY_PLACE.href, viaBack: false };
}

/** 顔から開くメニューの 1 行。行き先（a）か、その場の操作（button）。 */
type SelfRow =
  | { readonly kind: "link"; readonly label: string; readonly icon: readonly string[]; readonly href: string }
  | { readonly kind: "action"; readonly label: string; readonly icon: readonly string[]; readonly run: () => void };

/** サイドバーに並ぶ場所（上から順）と、その絵。サイドバーの項目と同じ Lucide の絵（`src/app/_components/icons.tsx`）。 */
const SELF_PLACES: ReadonlyArray<{ readonly place: WorkspacePlace; readonly icon: readonly string[] }> = [
  { place: HOME_PLACE, icon: ICON_HOME },
  { place: MINE_PLACE, icon: ICON_FOLDER },
  { place: LIBRARY_PLACE, icon: ICON_COMPANY },
  { place: FAVORITES_PLACE, icon: ICON_STAR },
];

/** 製品の印（src/lib/settings/brand.ts の形を、この行の墨と地で描く）。サイドバーの頭の印と同じ 20px。 */
function brandMark(): SVGSVGElement {
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("viewBox", MARK_VIEW_BOX);
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("aria-hidden", "true");
  const tile = document.createElementNS(svgNs, "rect");
  tile.setAttribute("width", "32");
  tile.setAttribute("height", "32");
  tile.setAttribute("rx", String(MARK_TILE_RADIUS));
  tile.setAttribute("class", "mark-tile");
  const sheet = document.createElementNS(svgNs, "path");
  sheet.setAttribute("d", MARK_SHEET_PATH);
  sheet.setAttribute("class", "mark-sheet");
  const fold = document.createElementNS(svgNs, "path");
  fold.setAttribute("d", MARK_FOLD_PATH);
  fold.setAttribute("class", "mark-fold");
  for (const shape of [sheet, fold]) {
    shape.setAttribute("stroke-width", String(MARK_ROUND));
    shape.setAttribute("stroke-linejoin", "round");
  }
  svg.append(tile, sheet, fold);
  return svg;
}

export class LocationBar {
  private readonly host = document.createElement(LOCATION_TAG);
  private readonly lead = el("div", "lead");
  private readonly mark = el("a", "mark");
  private readonly back = this.step(t("toolbox.location.back"), ICON_CHEVRON_LEFT, () => window.history.back());
  private readonly forward = this.step(t("toolbox.location.forward"), ICON_CHEVRON_RIGHT, () => window.history.forward());
  private readonly origin = el("a", "place");
  private readonly divider = el("span", "divider", "/");
  private readonly title = el("span", "title");
  private readonly favorite = el("button", "star");
  private onToggleFavorite: (() => void) | null = null;
  private readonly version = el("button", "version");
  private readonly versionWhen = el("span", "version-when");
  private readonly versionNumber = el("span", "version-number");
  private openHistory: (() => void) | null = null;
  /** 右端の顔（名乗りが届くまで出さない）。 */
  private readonly self = el("button", "self");
  /** 顔から開くメニューの入れ物（名乗りの行と、行き先の列）。 */
  private readonly sheet = el("div", "sheet");
  private readonly menu = el("div", "menu");
  private selfRows: readonly SelfRow[] = [];
  private selfName: string | null = null;
  private readonly stops: Array<() => void> = [];
  private from: Origin;

  constructor() {
    this.from = originOf(window);
    const shadow = this.host.attachShadow({ mode: "open" });
    const style = el("style");
    style.textContent = LOCATION_BAR_STYLES;

    const steps = el("div", "steps");
    steps.setAttribute("role", "group");
    steps.setAttribute("aria-label", t("toolbox.location.history"));
    steps.append(this.back, this.forward);
    this.lead.append(steps);

    // 製品の印＝ホーム。読み上げの名前は行き先の名前（サイドバーの「ホーム」と同じ）
    this.mark.href = HOME_PLACE.href;
    const home = placeLabel(HOME_PLACE, t);
    this.mark.title = home;
    this.mark.setAttribute("aria-label", home);
    this.mark.append(brandMark());
    // 組織のロゴ（サイドバーの頭の行と同じく印の右）。配信側が札に書いたときだけ。読み上げは印の「ホーム」が言うので飾り
    const logoHref = organizationFromTag().logo;
    const logo = logoHref === null ? null : el("img", "logo");
    if (logo !== null && logoHref !== null) {
      logo.src = logoHref;
      logo.alt = "";
      logo.setAttribute("aria-hidden", "true");
    }

    this.divider.setAttribute("aria-hidden", "true");
    this.title.setAttribute("aria-current", "page");
    const crumbs = el("div", "crumbs");
    crumbs.append(this.origin, this.divider, this.title);

    this.favorite.type = "button";
    this.favorite.hidden = true;
    this.favorite.append(icon(ICON_STAR, 16, STROKE));
    this.favorite.addEventListener("click", () => this.onToggleFavorite?.());

    this.version.type = "button";
    this.version.hidden = true;
    this.version.title = t("toolbox.location.openHistory");
    const separator = el("span", "version-sep", "·");
    separator.setAttribute("aria-hidden", "true");
    this.version.append(this.versionWhen, separator, this.versionNumber);
    this.version.addEventListener("click", () => this.openHistory?.());

    this.self.type = "button";
    this.self.hidden = true;
    this.self.setAttribute("aria-haspopup", "menu");
    this.self.setAttribute("aria-expanded", "false");
    this.self.addEventListener("click", () => this.toggleSelfMenu());
    this.sheet.hidden = true;
    this.menu.setAttribute("role", "menu");
    this.sheet.addEventListener("keydown", (event) => this.onMenuKey(event));

    const bar = el("nav", "bar");
    bar.setAttribute("aria-label", t("toolbox.location.label"));
    bar.append(this.lead, this.mark, ...(logo === null ? [] : [logo]), crumbs, this.favorite, this.version, this.self);
    shadow.append(style, bar, this.sheet);

    this.origin.addEventListener("click", (event) => {
      // 別のタブで開く押し方は、ブラウザに任せる
      if (!this.from.viaBack || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      window.history.back();
    });

    document.body.append(this.host);
    topInset.set("location", TITLEBAR_HEIGHT);

    this.paint();
    this.stops.push(topInset.watch(() => this.arrange()));
    this.stops.push(watchHistorySteps(window, () => this.paint()));
    const onScroll = (): void => this.paintScrolled();
    const onResize = (): void => this.arrange();
    const onLoad = (): void => this.paintGround();
    // メニューは、顔とメニューそのもの以外を押されたら畳む（影の中の出来事は通り道で見る）
    const onClick = (event: MouseEvent): void => {
      if (this.sheet.hidden) return;
      const path = event.composedPath();
      if (path.includes(this.self) || path.includes(this.sheet)) return;
      this.closeSelfMenu(false);
    };
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("load", onLoad);
    document.addEventListener("click", onClick);
    scheme.addEventListener("change", onLoad);
    this.stops.push(() => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("load", onLoad);
      document.removeEventListener("click", onClick);
      scheme.removeEventListener("change", onLoad);
    });
    // 題はページが後から書き換えることがある（スライドの題を直したときなど）
    const head = document.querySelector("title");
    if (head !== null) {
      const observer = new MutationObserver(() => this.paintTitle());
      observer.observe(head, { childList: true, characterData: true, subtree: true });
      this.stops.push(() => observer.disconnect());
    }
  }

  private step(label: string, paths: readonly string[], onClick: () => void): HTMLButtonElement {
    const button = el("button", "step");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.append(icon(paths, 16, STROKE));
    button.addEventListener("click", onClick);
    return button;
  }

  /** 履歴が動いたとき・控えから出し直されたときに、行ぜんぶを今の状態へ合わせる。 */
  private paint(): void {
    this.from = originOf(window);
    this.origin.textContent = this.from.label;
    this.origin.href = this.from.href;
    const steps = readHistorySteps(window);
    this.back.disabled = !steps.back;
    this.forward.disabled = !steps.forward;
    this.paintTitle();
    this.paintGround();
    this.paintScrolled();
    this.arrange();
  }

  /**
   * いま出ている版が「いつの・何版目か」を右端に出す。押すと履歴が開く。
   * null を渡すと引っ込める（版が分からない・別の版を見ている）。
   */
  showVersion(version: PageVersion | null, openHistory: () => void): void {
    this.openHistory = version === null ? null : openHistory;
    if (version === null) {
      this.version.hidden = true;
      return;
    }
    const when = t("toolbox.location.updated", { day: updatedDay(version.committedAt) });
    const number = version.number === null ? "" : t("toolbox.history.versionNumber", { number: version.number });
    this.versionWhen.textContent = when;
    this.versionNumber.textContent = number;
    this.versionNumber.hidden = number.length === 0;
    this.version.querySelector(".version-sep")?.toggleAttribute("hidden", number.length === 0);
    // 読み上げでは「10月3日 更新 第12版（履歴を開く）」と 1 つに読ませる
    this.version.setAttribute("aria-label", t("toolbox.location.versionAction", { version: [when, number].filter((part) => part.length > 0).join(" ") }));
    this.version.hidden = false;
  }

  /**
   * お気に入りの星。null を渡すと引っ込める（答えに載っていない＝出さない相手）。
   * 塗りは aria-pressed から CSS が決める（一覧の行の星と同じ 2 態）。
   */
  showFavorite(selected: boolean | null, onToggle: () => void): void {
    this.onToggleFavorite = selected === null ? null : onToggle;
    if (selected === null) {
      this.favorite.hidden = true;
      return;
    }
    const label = t(selected ? "toolbox.location.favoriteRemove" : "toolbox.location.favoriteAdd");
    this.favorite.setAttribute("aria-pressed", selected ? "true" : "false");
    this.favorite.setAttribute("aria-label", label);
    this.favorite.title = label;
    this.favorite.hidden = false;
  }

  /** 右端に「いつ・何版目」が出ているか（出ていれば、道具箱は ⋯ の中に履歴の入口を置かない）。 */
  versionShowing(): boolean {
    return !this.version.hidden;
  }

  /**
   * 右端の顔と、そこから開くメニュー。
   *
   * 会社の人なら頭文字の丸（サイドバーの名乗りの行と同じ姿）と、サイドバーを畳んだ列。
   * それ以外（名乗っていない＝ログインが切れた）は輪郭と、「Pages を開く」の 1 行だけ。
   * 「ログインしていません」とは言わない——名乗っていないことは異常ではなく、輪郭がもう言っている。
   * 出すのは表示名だけ（アドレスは届いてもいない）。
   */
  showSelf(viewer: CommentAuthor | null, onSignOut: () => void): void {
    const member = viewer !== null && viewer.kind === "member";
    this.selfName = member ? viewer.name : null;
    const label = member ? t("toolbox.self.labelNamed", { name: viewer.name }) : t("toolbox.self.label");
    this.self.title = label;
    this.self.setAttribute("aria-label", label);
    this.self.replaceChildren();
    if (member) {
      const face = el("span", "avatar", viewer.name.slice(0, 1));
      face.setAttribute("aria-hidden", "true");
      this.self.append(face);
    } else {
      this.self.append(icon(ICON_CIRCLE_USER, 24, STROKE));
    }
    this.selfRows = member
      ? [
          ...SELF_PLACES.map((entry): SelfRow => ({
            kind: "link",
            // 顔のメニューはサイドバーを畳んだもの。組織の名前もサイドバーと同じ長さで切る
            label: placeLabel(entry.place, t, sidebarName()),
            icon: entry.icon,
            href: entry.place.href,
          })),
          { kind: "link", label: t("workspace.settings"), icon: ICON_SETTINGS, href: "/settings" },
          { kind: "action", label: t("workspace.logout"), icon: ICON_LOGOUT, run: onSignOut },
        ]
      : [{ kind: "link", label: t("toolbox.self.openProduct"), icon: ICON_HOME, href: HOME_PLACE.href }];
    this.self.hidden = false;
    // 開いている最中に名乗りが変わったら、中身も描き直す（古い名前の列を残さない）
    if (!this.sheet.hidden) this.paintSelfMenu();
  }

  private toggleSelfMenu(): void {
    if (this.sheet.hidden) this.openSelfMenu();
    else this.closeSelfMenu(true);
  }

  private openSelfMenu(): void {
    this.paintSelfMenu();
    this.sheet.hidden = false;
    this.self.setAttribute("aria-expanded", "true");
    // 開いている間は、道具箱の層より上に出す（メニューがコメントの板の下に潜らないように）
    this.host.setAttribute("data-menu-open", "");
    this.menuItems()[0]?.focus();
  }

  /** 畳む。`refocus` は顔へ焦点を返すか（キーボードで畳んだときは返し、外を押したときは押した先に任せる）。 */
  private closeSelfMenu(refocus: boolean): void {
    if (this.sheet.hidden) return;
    this.sheet.hidden = true;
    this.menu.replaceChildren();
    this.self.setAttribute("aria-expanded", "false");
    this.host.removeAttribute("data-menu-open");
    if (refocus) this.self.focus({ preventScroll: true });
  }

  /** メニューの中身。名乗りの 1 行（会社の人だけ）と、行き先の列。個人設定とログアウトの前だけ 1 段空ける。 */
  private paintSelfMenu(): void {
    this.sheet.replaceChildren();
    if (this.selfName !== null) this.sheet.append(el("p", "menu-name", this.selfName));
    this.menu.replaceChildren();
    for (const row of this.selfRows) {
      const item = row.kind === "link" ? el("a", "menu-item") : el("button", "menu-item");
      item.setAttribute("role", "menuitem");
      item.tabIndex = -1;
      item.append(icon(row.icon, 16, STROKE), el("span", "menu-item-label", row.label));
      if (item instanceof HTMLAnchorElement) item.href = row.kind === "link" ? row.href : "";
      if (item instanceof HTMLButtonElement) item.type = "button";
      item.addEventListener("click", () => {
        this.closeSelfMenu(false);
        if (row.kind === "action") row.run();
      });
      // 場所の列と、個人設定・ログアウトの間は余白で分ける（線は引かない）
      if (row.kind === "link" && row.href === "/settings") item.classList.add("is-apart");
      this.menu.append(item);
    }
    this.sheet.append(this.menu);
  }

  private menuItems(): HTMLElement[] {
    return [...this.menu.querySelectorAll<HTMLElement>("[role='menuitem']")];
  }

  /** メニューの中のキー操作（矢印で行を移る・Home / End・Escape で畳む・Tab で畳んで次へ）。 */
  private onMenuKey(event: KeyboardEvent): void {
    const items = this.menuItems();
    const active = this.host.shadowRoot?.activeElement ?? null;
    const at = items.findIndex((item) => item === active);
    const go = (index: number): void => {
      event.preventDefault();
      items[(index + items.length) % items.length]?.focus();
    };
    if (event.key === "ArrowDown") go(at + 1);
    else if (event.key === "ArrowUp") go(at - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(items.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      this.closeSelfMenu(true);
    } else if (event.key === "Tab") this.closeSelfMenu(true);
  }

  private paintTitle(): void {
    const title = document.title.trim();
    this.title.textContent = title;
    this.title.title = title;
    // 題の無いページは、場所の名前だけを出す（区切りだけが残らないように）
    this.title.hidden = this.divider.hidden = title.length === 0;
  }

  private paintGround(): void {
    // 地と明暗は、新しい版の知らせ（latest-bar.ts）と同じ読み方（page-ground.ts）
    paintPageTone(this.host);
  }

  private paintScrolled(): void {
    this.host.toggleAttribute("data-scrolled", window.scrollY > 0);
  }

  /** 上にある帯（環境の帯）の下に置き、窓の題名の帯を兼ねているかを印にする。 */
  private arrange(): void {
    const above = topInset.above("location");
    this.host.style.setProperty("--location-top", `${above}px`);
    // 左の場所に幅があれば、デスクトップアプリの窓の中（全画面にすると幅は 0 に戻る）
    const titlebar = this.lead.getBoundingClientRect().width > 0;
    this.host.toggleAttribute("data-titlebar", titlebar && above === 0);
    this.host.toggleAttribute("data-under-ribbon", titlebar && above > 0);
  }

  destroy(): void {
    for (const stop of this.stops) stop();
    this.host.remove();
    topInset.set("location", 0);
  }
}

/**
 * デスクトップアプリの窓の中か（窓の枠が、信号機ボタンのぶんの幅を知らせてきているか）。
 * 全画面にしている間は、枠が無いのでブラウザと同じ答えになる。
 */
export function insideWindowTitlebar(): boolean {
  const probe = el("div");
  probe.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;width:${TITLEBAR_START_CSS};height:0`;
  document.documentElement.append(probe);
  const inside = probe.getBoundingClientRect().width > 0;
  probe.remove();
  return inside;
}

/**
 * 現在地の行を出す。出さないのは、よその画面の中にはめ込まれているとき（題も戻り道も外側が持つ）と、
 * すでに出ているとき。
 */
export function mountLocationBar(): LocationBar | null {
  if (window.top !== window.self) return null;
  if (document.querySelector(LOCATION_TAG) !== null) return null;
  return new LocationBar();
}

/** サイドバーと同じ長さに切った組織の名前（札に無ければ undefined＝辞書の一般語）。 */
function sidebarName(): string | undefined {
  const name = organizationFromTag().name;
  return name === null ? undefined : sidebarOrganizationName(name);
}
