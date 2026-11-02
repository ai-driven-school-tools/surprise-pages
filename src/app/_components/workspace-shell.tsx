"use client";
import Link from "next/link";
// 中身まで取り寄せる指定（FULL）の名前。公開の型（PrefetchOptions）が要求する列挙なので、Next の実装から読む
import { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types";
import { DOCUMENT_LINK_SELECTOR, DOCUMENT_SPECULATION_RULES, PREFETCH_FRESH_SECONDS, PREFETCH_HOVER_MS, documentPrerenderRules, prefetchTarget, prerenderTarget } from "@/lib/pages/prefetch-policy";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { applyAppearance } from "./appearance";
import { Icon } from "./icons";
import { ActionMenu, IconButton, MenuAction, Modal } from "./controls";
import { LinkPending } from "./back-link";
import { BrandMark } from "./brand-mark";
import { WindowHistory } from "./window-history";
import { ShortcutProvider } from "./shortcut-provider";
import { useOpenShortcutHelp, useShortcut } from "./shortcuts";
import { useOrganizationName, useT } from "./i18n";
import type { ShortcutId } from "@/lib/workspace/keyboard-shortcuts";
import type { WorkspaceAppearance } from "@/lib/workspace/settings";
import type { SidebarFavorite } from "@/lib/workspace/sidebar-favorites";
import { ACTIVITY_PLACE, FAVORITES_PLACE, HOME_PLACE, LIBRARY_PLACE, MINE_PLACE, WORKSPACE_PLACES, isAtPlace, placeLabel, sidebarOrganizationName } from "@/lib/workspace/places";
/** 近道の受け口はワークスペースの外枠ごと包む（どの画面でも同じキーが効く）。 */
export function WorkspaceShell(props: Parameters<typeof Shell>[0]) {
  return (
    <ShortcutProvider>
      <Shell {...props} />
    </ShortcutProvider>
  );
}
/** 目次の行き先へ「g のあと 1 字」で移る。 */
function useGoShortcut(id: ShortcutId, href: string, enabled = true) {
  const router = useRouter();
  useShortcut(id, () => router.push(href), enabled);
}
function Shell({
  children,
  name,
  email,
  admin,
  appearance,
  favorites,
  personal,
  siteName,
  organizationLogo = null,
  logout,
}: {
  children: ReactNode;
  name: string;
  email: string;
  admin: boolean;
  appearance: WorkspaceAppearance;
  /** サイドバーに名前を直接並べるお気に入り（src/lib/workspace/workspace.ts の sidebarFavorites）。星が 0 件ならまとまりごと出さない */
  favorites: { rows: SidebarFavorite[]; total: number };
  personal: boolean;
  /** ツールの名前（設置ごと・src/lib/settings/site-settings.ts の siteName）。製品の印の隣に出す */
  siteName: string;
  /** 組織のロゴ（組織の設定）。製品の印と名前の行の右端に出す。無ければ何も出さない */
  organizationLogo?: { href: string | null; name: string } | null;
  logout: () => Promise<void>;
}) {
  const menuTrigger = useRef<HTMLButtonElement | null>(null);
  const logoutForm = useRef<HTMLFormElement | null>(null);
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const openShortcutHelp = useOpenShortcutHelp();
  const t = useT();
  // 場所の名前に差し込む組織の名前は、サイドバーでは 12 字で切る（現在地の行は切らない）
  const organizationName = useOrganizationName();
  const shortOrganization = organizationName === null ? undefined : sidebarOrganizationName(organizationName);
  const router = useRouter();
  /*
   * サイドバーの星で外した資料。サーバーの取り直し（router.refresh）が届くまで、その行だけ先に消しておく。
   * 届いた props は新しい実体なので、届いたら控えを空にする（一覧でまた星を付けた資料が隠れたままにならない）。
   */
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [removing, setRemoving] = useState<ReadonlySet<string>>(new Set());
  const [favoriteNotice, setFavoriteNotice] = useState("");
  /** 開いている行のメニュー（呼び名）。「…」を押しても行を右クリックしても同じメニューが開く */
  const [favoriteMenu, setFavoriteMenu] = useState<string | null>(null);
  const [seenFavorites, setSeenFavorites] = useState(favorites);
  if (seenFavorites !== favorites) {
    setSeenFavorites(favorites);
    setRemoved(new Set());
  }
  const favoriteRows = favorites.rows.filter((favorite) => !removed.has(favorite.page));
  const favoriteTotal = favorites.total - (favorites.rows.length - favoriteRows.length);
  /**
   * 一覧の行の星と同じ口（`action: "favorite"`）で外す。押した瞬間に行を消し（返事を待たせない・DESIGN.md 12 章）、
   * 失敗したら行を戻して、まとまりの下に 1 行で告げる。
   */
  async function unfavorite(favorite: SidebarFavorite) {
    if (removing.has(favorite.page)) return;
    setRemoving((current) => new Set([...current, favorite.page]));
    setRemoved((current) => new Set([...current, favorite.page]));
    setFavoriteNotice("");
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "favorite", page: favorite.page, selected: false }),
        // 行は先に消してある。返事の前にページを移っても、送りかけた保存を打ち切らせない
        keepalive: true,
      });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setRemoved((current) => {
        const next = new Set(current);
        next.delete(favorite.page);
        return next;
      });
      setFavoriteNotice(t("library.favoriteFailed"));
    } finally {
      setRemoving((current) => {
        const next = new Set(current);
        next.delete(favorite.page);
        return next;
      });
    }
  }
  useGoShortcut("go-home", HOME_PLACE.href);
  useGoShortcut("go-files", MINE_PLACE.href);
  useGoShortcut("go-favorites", FAVORITES_PLACE.href);
  useGoShortcut("go-activity", ACTIVITY_PLACE.href);
  useGoShortcut("go-library", LIBRARY_PLACE.href);
  useGoShortcut("go-settings", "/settings");
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => applyAppearance(appearance);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [appearance]);
  function nav() {
    return (
      <>
        <Link href={HOME_PLACE.href} prefetch={false} className="ws-brand">
          <BrandMark />
          {siteName}
          {organizationLogo?.href ? (
            // 組織の人にだけ配る非公開の画像。共有の画像最適化（next/image）に載せない
            // eslint-disable-next-line @next/next/no-img-element
            <img src={organizationLogo.href} alt={t("organization.settings.logo.alt", { name: organizationLogo.name })} className="ws-organization-logo" />
          ) : null}
          <LinkPending />
        </Link>
        {/* These dynamic shelves share a shell but can read large datasets. Fetch only the chosen screen. */}
        <nav aria-label={t("workspace.navigation")} className="ws-navigation">
          {WORKSPACE_PLACES.map((place) => (
            <Link
              key={place.href}
              href={place.href}
              prefetch={false}
              onNavigate={() => setOpen(false)}
              className="ws-nav-item"
              aria-current={isAtPlace(place, path) ? "page" : undefined}
            >
              <Icon name={place.icon} />
              {placeLabel(place, t, shortOrganization)}
              <LinkPending />
            </Link>
          ))}
        </nav>
        {/*
          お気に入りは項目ではなく、星を付けた資料の名前がそのまま並ぶ（どの画面からでも 1 回で開ける）。
          見出しを押すと一覧（/favorites）。並べ切れない分は「ほか N 件」で同じ一覧へ。星が 0 件の人には出さない。
          資料は Next の画面ではないので、行は素の a（一覧の行と同じ）。
          行に指を乗せると右端に星（灰）が出て、押すとその場で外せる（一覧の行の星と同じ部品・同じ口）。常に出さないのは、
          星がどの行にも付くので並べると地になるため。行の右クリックでは「開く」「お気に入りから外す」のメニュー——
          その口は見えない（右クリックの受け皿で、Tab の順にも入れない。キーボードでは星が同じ操作）。
          a の中にボタンは置けないので、行は「a ＋ 星 ＋ 口」の入れ物（.ws-nav-favorite）で包む。
        */}
        {favoriteRows.length > 0 ? (
          <nav aria-label={t("workspace.places.favorites")} className="ws-nav-group">
            <Link
              href={FAVORITES_PLACE.href}
              prefetch={false}
              onNavigate={() => setOpen(false)}
              className="ws-nav-group-title"
              aria-current={isAtPlace(FAVORITES_PLACE, path) ? "page" : undefined}
            >
              {t("workspace.places.favorites")}
              <LinkPending />
            </Link>
            {favoriteRows.map((favorite) => (
              <div
                key={favorite.page}
                className="ws-nav-favorite"
                onContextMenu={(event) => {
                  event.preventDefault();
                  setFavoriteMenu(favorite.page);
                }}
              >
                <a href={favorite.href} className="ws-nav-item" title={favorite.title}>
                  <span className="ws-nav-name">{favorite.title}</span>
                </a>
                <IconButton
                  label={t("workspace.favoriteRemove", { title: favorite.title })}
                  hint={t("library.favoriteRemove")}
                  icon="favorite"
                  filled
                  aria-pressed
                  onClick={() => void unfavorite(favorite)}
                />
                <ActionMenu
                  open={favoriteMenu === favorite.page}
                  onOpenChange={(value) => setFavoriteMenu(value ? favorite.page : null)}
                  returnFocus={false}
                  trigger={
                    <button
                      type="button"
                      tabIndex={-1}
                      className="ws-icon-button ws-nav-favorite-menu"
                      aria-label={t("library.rowActions", { title: favorite.title })}
                    >
                      <Icon name="more" />
                    </button>
                  }
                >
                  <MenuAction icon="open" href={favorite.href}>
                    {t("library.open")}
                  </MenuAction>
                  <MenuAction icon="favorite" onSelect={() => void unfavorite(favorite)}>
                    {t("library.favoriteRemove")}
                  </MenuAction>
                </ActionMenu>
              </div>
            ))}
            {favoriteTotal > favoriteRows.length ? (
              <Link
                href={FAVORITES_PLACE.href}
                prefetch={false}
                onNavigate={() => setOpen(false)}
                className="ws-nav-item ws-nav-more"
              >
                {t("workspace.favoritesMore", { count: favoriteTotal - favoriteRows.length })}
                <LinkPending />
              </Link>
            ) : null}
            <p role="status" className={favoriteNotice ? "ws-nav-notice" : "sr-only"}>
              {favoriteNotice}
            </p>
          </nav>
        ) : null}
        <div className="ws-nav-bottom">
          <Link
            href="/settings"
            prefetch={false}
            onNavigate={() => setOpen(false)}
            className="ws-nav-item"
            aria-current={
              path === "/settings" || path === "/devices" ? "page" : undefined
            }
          >
            <Icon name="settings" />
            {t("workspace.settings")}
            <LinkPending />
          </Link>
          {admin ? (
            <Link
              href="/sharing"
              prefetch={false}
              onNavigate={() => setOpen(false)}
              className="ws-nav-item"
              aria-current={path === "/sharing" ? "page" : undefined}
            >
              <Icon name="admin" />
              {personal ? t("workspace.adminPersonal") : t("workspace.admin")}
              <LinkPending />
            </Link>
          ) : null}
          {/*
            名乗りの行。ふだん見せるのは自分が誰かだけで、たまにしか使わない操作（キーボードショートカット・ログアウト）は
            名前を押して開くメニューに畳む。
          */}
          <div className="ws-account">
            <form ref={logoutForm} action={logout} hidden />
            <ActionMenu
              side="top"
              align="start"
              trigger={
                <button type="button" className="ws-account-trigger" title={email}>
                  <span className="ws-avatar" aria-hidden="true">
                    {name.slice(0, 1)}
                  </span>
                  <span className="ws-account-name">
                    {name}
                    <span className="sr-only">{t("workspace.accountEmail", { email })}</span>
                  </span>
                </button>
              }
            >
              {openShortcutHelp !== null ? (
                <MenuAction icon="keyboard" shortcut="help" keyboardOnly onSelect={openShortcutHelp}>
                  {t("workspace.keyboardShortcuts")}
                </MenuAction>
              ) : null}
              <MenuAction icon="logout" onSelect={() => logoutForm.current?.requestSubmit()}>
                {t("workspace.logout")}
              </MenuAction>
            </ActionMenu>
          </div>
        </div>
      </>
    );
  }
  return (
    <div
      className="ws-shell"
      data-appearance={appearance}
      data-workspace-mode={path === "/decks/create" ? "create" : "browse"}
    >
      <IntentPrefetch />
      <a className="ws-skip" href="#workspace-content">
        {t("workspace.skipToContent")}
      </a>
      <WindowHistory />
      <aside className="ws-sidebar">{nav()}</aside>
      <div className="ws-mobile-header">
        <IconButton
          ref={menuTrigger}
          label={t("workspace.openMenu")}
          icon="sidebar"
          onClick={() => setOpen(true)}
        />
      </div>
      <Modal
        returnFocus={menuTrigger}
        open={open}
        onOpenChange={setOpen}
        title={t("workspace.navigation")}
        drawer
      >
        {nav()}
      </Modal>
      <div id="workspace-content" className="ws-content" tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}

/**
 * 押す前に取り寄せておく（決まりは src/lib/pages/prefetch-policy.ts・測り方は docs/design/app-speed.md）。ワークスペースの枠に 1 つだけ置く。
 *
 * 画面へのリンクに触れたら（マウスを乗せた・指を置いた・キーで選んだ）、その画面の中身を Next に取り寄せさせる。
 * 触れてから押すまでの間（マウスなら多くは 0.2〜0.5 秒）にサーバーの答えが届き、押した瞬間に中身が出る。
 * 資料（/internal/・/public/）は Next の外の文書なので、触れた 1 枚を裏で開く宣言をブラウザに差し込む（ブラウザが裏で描いておき、
 * 押した瞬間に差し替える）。宣言を受け付けないブラウザでは何もしない。
 */
function IntentPrefetch() {
  const router = useRouter();
  useEffect(() => {
    const fetchedAt = new Map<string, number>();
    let waiting: { target: string; timer: number } | null = null;
    // 裏で開いている資料の宣言（いつも 1 枚だけ。別の資料に触れたら差し替え、外した宣言の裏開きはブラウザがやめる）
    const canPrerender = typeof HTMLScriptElement.supports === "function" && HTMLScriptElement.supports("speculationrules");
    let prerendering: { target: string; rules: HTMLScriptElement } | null = null;
    const prerender = (target: string) => {
      prerendering?.rules.remove();
      const rules = document.createElement("script");
      rules.type = "speculationrules";
      rules.textContent = documentPrerenderRules(target);
      document.head.append(rules);
      prerendering = { target, rules };
    };
    const cancel = () => {
      if (waiting !== null) window.clearTimeout(waiting.timer);
      waiting = null;
    };
    const here = () => ({ origin: window.location.origin, pathname: window.location.pathname, search: window.location.search });
    const intentOf = (event: Event): { target: string; document: boolean } | null => {
      if (!(event.target instanceof Element)) return null;
      const link = event.target.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return null;
      const shape = { href: link.href, target: link.target, hasDownload: link.hasAttribute("download") };
      const screen = prefetchTarget(shape, here());
      if (screen !== null) return { target: screen, document: false };
      const page = canPrerender ? prerenderTarget({ ...shape, listed: link.matches(DOCUMENT_LINK_SELECTOR) }, here()) : null;
      return page === null ? null : { target: page, document: true };
    };
    const onIntent = (event: Event) => {
      const intent = intentOf(event);
      if (intent === null || waiting?.target === intent.target) return;
      const { target } = intent;
      cancel();
      if (intent.document) {
        // いま裏で開いている資料なら、開き直さない
        if (prerendering?.target === target) return;
      } else if (Date.now() - (fetchedAt.get(target) ?? -Infinity) < PREFETCH_FRESH_SECONDS * 1000) {
        // 取り寄せた中身を Next が使ってよい間は、触れ直しても取り直さない（サーバーに同じ画面を何度も描かせない）
        return;
      }
      // とどまったときだけ始める。通り過ぎただけ・すぐ押したときに始めると、Next は届く前の先読みを待たずに
      // 同じ画面をもう一度取りに行くので、サーバーが同じ画面を 2 度描く（docs/design/app-speed.md の「先読み」）
      waiting = {
        target,
        timer: window.setTimeout(() => {
          waiting = null;
          if (intent.document) {
            prerender(target);
            return;
          }
          fetchedAt.set(target, Date.now());
          // 指定が無い（AUTO）と、待ちの表示（loading.tsx）の手前までしか取らない。ワークスペースは待ちの表示を持たないので
          // 何も取れていない。中身まで取る（FULL）。使ってよい長さは next.config.ts の staleTimes.static（30 秒）
          router.prefetch(target, { kind: PrefetchKind.FULL });
        }, PREFETCH_HOVER_MS),
      };
    };
    const onLeave = (event: Event) => {
      if (waiting === null || intentOf(event)?.target !== waiting.target) return;
      // リンクの中の字や絵へ移っただけなら、とどまっている（待ちをやり直さない）
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      const next = event instanceof FocusEvent || event instanceof PointerEvent ? event.relatedTarget : null;
      if (link !== null && next instanceof Node && link.contains(next)) return;
      cancel();
    };
    const options: AddEventListenerOptions = { capture: true, passive: true };
    // 押し始めたら、まだ始めていない先読みはやめる（押した画面は Next がそのまま取りに行く。資料はブラウザが押し始めで開き始める）
    const listeners: [string, (event: Event) => void][] = [
      ["pointerover", onIntent], ["focusin", onIntent], ["pointerout", onLeave], ["focusout", onLeave],
      ["pointerdown", cancel], ["keydown", cancel],
    ];
    for (const [name, listener] of listeners) document.addEventListener(name, listener, options);
    return () => {
      cancel();
      prerendering?.rules.remove();
      for (const [name, listener] of listeners) document.removeEventListener(name, listener, options);
    };
  }, [router]);
  return <script type="speculationrules" dangerouslySetInnerHTML={{ __html: DOCUMENT_SPECULATION_RULES }} />;
}
