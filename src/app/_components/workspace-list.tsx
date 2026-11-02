"use client";
import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Icon } from "./icons";
import {
  IconButton,
  ActionMenu,
  MenuAction,
  Modal,
  SearchField,
  Select,
} from "./controls";
import { PageHeader } from "./page-header";
import { useLocale, useT } from "./i18n";
import { writeClipboardText } from "@/lib/workspace/clipboard";
import { formatDateTime, formatMonthDay } from "@/lib/i18n/format";
import { localizeStored } from "@/lib/i18n/errors";
import { FAVORITES_PLACE, LIBRARY_PLACE, MINE_PLACE, placeLabel } from "@/lib/workspace/places";
import {
  KIND_LABELS,
  SCOPE_LABELS,
  WORKSPACE_PAGE_SIZE,
  clampWorkspacePage,
  rowsOnShelf,
  workspaceViewOf,
  type WorkspaceRow,
} from "@/lib/workspace/model";
/**
 * 検索語を打ち終えてからサーバーへ問い合わせるまでの間。1 文字ごとに問い合わせると、
 * 返事が追い越し合って打鍵のたびに一覧がちらつくため、打つ手が止まるのを少しだけ待つ。
 */
const SEARCH_DELAY_MS = 250;
/**
 * 資料の一覧。絞り込み・並べ替え・ページ分けはサーバー（`library-screen.tsx`）が済ませ、
 * ここに届くのは今のページの行と総数だけ。条件を変えたら URL を変えてサーバーに取り直させる。
 */
export function WorkspaceList({
  rows,
  total,
  page,
  shelf,
}: {
  rows: WorkspaceRow[];
  total: number;
  page: number;
  shelf: "mine" | "company" | "favorites";
}) {
  const router = useRouter(),
    params = useSearchParams(),
    path = usePathname();
  const t = useT(),
    locale = useLocale();
  // 届いている行を絞った条件（空の表示の言い分けに使う）
  const applied = workspaceViewOf((name) => params.get(name));
  // 押した条件は、サーバーの返事を待たずに操作の部品へ映す（返事が来れば URL の値に戻る）
  const [requested, setRequested] = useOptimistic(params.toString());
  const shownParams = new URLSearchParams(requested);
  const { query, kind, scope, sort, tab } = workspaceViewOf((name) =>
    shownParams.get(name),
  );
  const [typed, setTyped] = useState(query),
    [filters, setFilters] = useState(Boolean(kind || scope)),
    [notice, setNotice] = useState(""),
    [copyRow, setCopyRow] = useState<WorkspaceRow | null>(null);
  const [busy, startTransition] = useTransition();
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  // 星の上書きは、サーバーの取り直し（router.refresh）が届くまでのつなぎ。届いた行は新しい実体なので、届いたら上書きを捨てる
  // （サイドバーの星で外したあと、この画面の星だけが付いたまま残らない）
  const [seenRows, setSeenRows] = useState(rows);
  if (seenRows !== rows) {
    setSeenRows(rows);
    setFavorites({});
  }
  const searchTimer = useRef<number | undefined>(undefined);
  // 自分で送った検索語。返事が届いたとき、その間に打ち足した字を URL の値で消さないため。
  // 送っていない値に変わったとき（戻る・サイドバーから開き直す）だけ、入力欄を URL に合わせる
  const [sentQueries, setSentQueries] = useState([applied.query]);
  const [lastQuery, setLastQuery] = useState(applied.query);
  if (lastQuery !== applied.query) {
    setLastQuery(applied.query);
    if (!sentQueries.includes(applied.query)) {
      setTyped(applied.query);
      setSentQueries([applied.query]);
    }
  }
  useEffect(() => () => window.clearTimeout(searchTimer.current), []);
  useEffect(() => {
    // Keep search words and internal document names out of browser storage keys.
    let hash = 0;
    for (const character of params.toString())
      hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0;
    const key = `pages:scroll:v1:${path}:${hash}`;
    const restore = () => {
      try {
        window.scrollTo(0, Number(sessionStorage.getItem(key) ?? 0));
      } catch {}
    };
    restore();
    const save = () => {
      try {
        sessionStorage.setItem(key, String(window.scrollY));
      } catch {}
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => window.removeEventListener("scroll", save);
  }, [path, params]);
  function update(name: string, value: string) {
    // 返事を待っている条件（押したばかりの絞り込みなど）も落とさずに重ねる
    const next = new URLSearchParams(requested);
    if (value) next.set(name, value);
    else next.delete(name);
    if (name !== "page") next.delete("page");
    if (name === "q")
      setSentQueries((sent) => [...sent.slice(-7), value]);
    startTransition(() => {
      setRequested(next.toString());
      const url = `${path}${next.size ? "?" + next : ""}`;
      // 検索語は打つたびに履歴を積まない（今までと同じ）。スクロールは下の控えが受け持つ
      if (name === "q") router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    });
  }
  // 待っている間に別の条件を押しても、送るときは最新の条件に重ねる（古い条件で上書きしない）
  const latestUpdate = useRef(update);
  useEffect(() => {
    latestUpdate.current = update;
  });
  function search(value: string, delay = SEARCH_DELAY_MS) {
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(
      () => latestUpdate.current("q", value),
      delay,
    );
  }
  // お気に入りを外した行は、取り直しが届く前でもお気に入りの棚から消す（棚の決まりは共通の関数）
  const shown = rowsOnShelf(
    rows.map((row) =>
      favorites[row.id] === undefined
        ? row
        : { ...row, favorite: favorites[row.id] },
    ),
    shelf,
    applied.tab,
  );
  const count = total - (rows.length - shown.length),
    pages = Math.max(1, Math.ceil(count / WORKSPACE_PAGE_SIZE)),
    current = clampWorkspacePage(page, count),
    // 空の表示は、届いている行を絞った条件で言い分ける（押したばかりの条件ではなく）
    filtered = Boolean(applied.query || applied.kind || applied.scope),
    title = placeLabel(shelf === "mine" ? MINE_PLACE : shelf === "favorites" ? FAVORITES_PLACE : LIBRARY_PLACE, t);
  /** 星は押した瞬間に立てる・外す（返事を待たせない・DESIGN.md 12 章）。失敗したら戻して 1 行で告げる */
  async function favorite(row: WorkspaceRow) {
    if (saving.has(row.id)) return;
    setSaving((current) => new Set([...current, row.id]));
    setFavorites((current) => ({ ...current, [row.id]: !row.favorite }));
    setNotice("");
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "favorite",
          page: row.page,
          selected: !row.favorite,
        }),
      });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setFavorites((current) => ({ ...current, [row.id]: row.favorite }));
      setNotice(t("library.favoriteFailed"));
    } finally {
      setSaving((current) => {
        const next = new Set(current);
        next.delete(row.id);
        return next;
      });
    }
  }
  async function copy(row: WorkspaceRow) {
    if (await writeClipboardText(new URL(row.href, location.origin).href)) {
      setNotice(t("library.linkCopied"));
    } else {
      setCopyRow(row);
    }
  }
  return (
    <main>
      <PageHeader
        title={title}
        actions={
          <a className="ws-button ws-primary" href="/create">
            <Icon name="create" />
            {t("library.create")}
          </a>
        }
      />
      {shelf === "mine" ? (
        <nav className="ws-tabs" aria-label={t("library.tabs.label")}>
          <button
            className="ws-tab"
            aria-current={tab !== "shared" ? "page" : undefined}
            onClick={() => update("tab", "")}
          >
            {t("library.tabs.created")}
          </button>
          <button
            className="ws-tab"
            aria-current={tab === "shared" ? "page" : undefined}
            onClick={() => update("tab", "shared")}
          >
            {t("library.tabs.shared")}
          </button>
        </nav>
      ) : null}
      <div className="ws-toolbar">
        <SearchField
          label={t("library.searchLabel", { title })}
          placeholder={t("common.search")}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            if (!(
              event.nativeEvent instanceof InputEvent &&
              event.nativeEvent.isComposing
            ))
              search(event.target.value);
          }}
          onCompositionEnd={(event) => search(event.currentTarget.value)}
          onClear={() => {
            setTyped("");
            search("", 0);
          }}
        />
        <IconButton
          label={t("library.filter")}
          icon="filter"
          aria-expanded={filters}
          aria-pressed={Boolean(kind || scope)}
          onClick={() => setFilters(!filters)}
        />
        <ActionMenu label={t("library.sort.label")} icon="sort">
          <MenuAction
            selected={sort === "new"}
            onSelect={() => update("sort", "new")}
          >
            {t("library.sort.new")}
          </MenuAction>
          <MenuAction
            selected={sort === "old"}
            onSelect={() => update("sort", "old")}
          >
            {t("library.sort.old")}
          </MenuAction>
          <MenuAction
            selected={sort === "name"}
            onSelect={() => update("sort", "name")}
          >
            {t("library.sort.name")}
          </MenuAction>
        </ActionMenu>
      </div>
      {filters ? (
        <div className="ws-filters">
          <Select
            aria-label={t("library.kindFilter")}
            value={kind}
            onChange={(e) => update("kind", e.target.value)}
          >
            <option value="">{t("library.allKinds")}</option>
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {t(label)}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t("library.scopeFilter")}
            value={scope}
            onChange={(e) => update("scope", e.target.value)}
          >
            <option value="">{t("library.allScopes")}</option>
            {Object.entries(SCOPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {t(label)}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      {!filters && (kind || scope) ? (
        <p className="ws-muted mb-3">
          {[
            Object.entries(KIND_LABELS).find(([value]) => value === kind)?.[1],
            Object.entries(SCOPE_LABELS).find(
              ([value]) => value === scope,
            )?.[1],
          ]
            .flatMap((label) => (label === undefined ? [] : [t(label)]))
            .join(" · ")}
        </p>
      ) : null}
      <div
        role="status"
        aria-live="polite"
        className={notice ? "ws-status" : "sr-only"}
      >
        {notice || t("library.count", { count })}
      </div>
      {sort !== "new" ? (
        <p className="ws-muted mb-3">
          {t(sort === "name" ? "library.sort.name" : "library.sort.old")}
        </p>
      ) : null}
      <div aria-busy={busy}>
        {count > 0 ? (
          <>
            <div className="ws-row ws-row-heading" aria-hidden="true">
              <span>{t("library.columns.name")}</span>
              <span>{t("library.columns.scope")}</span>
              <span>{t("library.columns.updated")}</span>
              <span />
            </div>
            <ul>
              {shown.map((row) => (
                <li className="ws-row" key={row.id}>
                  <div className="min-w-0">
                    <a className="ws-row-title" href={row.href}>
                      <span className="ws-kind" title={t(KIND_LABELS[row.kind])}>
                        <Icon name={row.kind} />
                        <span className="sr-only">
                          {t("library.kindPrefix", { kind: t(KIND_LABELS[row.kind]) })}
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="ws-name block" title={row.title}>
                          {row.title}
                        </span>
                        {shelf === "company" ? (
                          <span className="ws-row-author">{localizeStored(row.author, t)}</span>
                        ) : null}
                      </span>
                    </a>
                    {row.waiting > 0 && row.shareable ? (
                      <a
                        href={`${row.href}?deck-panel=sharing`}
                        className="ws-muted"
                      >
                        {t("library.accessRequests", { count: row.waiting })}
                      </a>
                    ) : null}
                  </div>
                  <span className="ws-scope">
                    <Icon name={row.scope} small />
                    {t(SCOPE_LABELS[row.scope])}
                  </span>
                  <time
                    className="ws-row-date"
                    dateTime={row.updatedAt}
                    title={formatDateTime(locale, row.updatedAt)}
                  >
                    {formatMonthDay(locale, row.updatedAt)}
                  </time>
                  <div className="ws-row-actions">
                    <IconButton
                      label={
                        t(row.favorite ? "library.favoriteRemove" : "library.favoriteAdd")
                      }
                      icon="favorite"
                      filled={row.favorite}
                      aria-pressed={row.favorite}
                      onClick={() => void favorite(row)}
                    />
                    <ActionMenu label={t("library.rowActions", { title: row.title })}>
                      <MenuAction icon="open" href={row.href}>
                        {t("library.open")}
                      </MenuAction>
                      {row.editable ? (
                        <MenuAction icon="edit" href={`${row.href}?edit=1`}>
                          {t("common.edit")}
                        </MenuAction>
                      ) : null}
                      {row.shareable ? (
                        <MenuAction
                          icon="share"
                          href={`${row.href}?deck-panel=sharing`}
                        >
                          {t("library.sharing")}
                        </MenuAction>
                      ) : null}
                      <MenuAction icon="copy" onSelect={() => void copy(row)}>
                        {t("library.copyLink")}
                      </MenuAction>
                      <MenuAction
                        icon="link"
                        onSelect={() =>
                          requestAnimationFrame(() => setCopyRow(row))
                        }
                      >
                        {t("library.checkLink")}
                      </MenuAction>
                    </ActionMenu>
                  </div>
                </li>
              ))}
            </ul>
            <div className="ws-pagination">
              <span className="ws-muted">
                {pages > 1 ? t("library.countPaged", { count, current, pages }) : t("library.count", { count })}
              </span>
              {pages > 1 ? (
                <>
                  <IconButton
                    label={t("library.previousPage")}
                    icon="previous"
                    disabled={current <= 1}
                    onClick={() => update("page", String(current - 1))}
                  />
                  <IconButton
                    label={t("library.nextPage")}
                    icon="next"
                    disabled={current >= pages}
                    onClick={() => update("page", String(current + 1))}
                  />
                </>
              ) : null}
            </div>
          </>
        ) : (
          <div className="ws-empty">
            <Icon
              name={
                filtered
                  ? "search"
                  : shelf === "favorites"
                    ? "favorite"
                    : "files"
              }
            />
            <p className="font-medium">
              {t(
                filtered
                  ? "library.empty.filteredTitle"
                  : shelf === "favorites"
                    ? "library.empty.favoritesTitle"
                    : applied.tab === "shared"
                      ? "library.empty.sharedTitle"
                      : "library.empty.noneTitle",
              )}
            </p>
            <p className="ws-muted">
              {t(
                filtered
                  ? "library.empty.filteredDetail"
                  : shelf === "favorites"
                    ? "library.empty.favoritesDetail"
                    : "library.empty.noneDetail",
              )}
            </p>
            {!filtered ? (
              <a
                href={
                  shelf === "favorites" || applied.tab === "shared"
                    ? "/library"
                    : "/create"
                }
                className="ws-button"
              >
                {shelf === "favorites" || applied.tab === "shared"
                  ? t("library.empty.browseLibrary")
                  : t("library.create")}
              </a>
            ) : null}
          </div>
        )}
      </div>
      <Modal
        open={copyRow !== null}
        onOpenChange={(open) => {
          if (!open) setCopyRow(null);
        }}
        title={t("library.link")}
      >
        <input
          className="ws-field mt-2 block w-full"
          aria-label={t("library.link")}
          readOnly
          value={
            copyRow
              ? new URL(
                  copyRow.href,
                  typeof location === "undefined"
                    ? "https://example.invalid"
                    : location.origin,
                ).href
              : ""
          }
          onFocus={(e) => e.target.select()}
        />
      </Modal>
    </main>
  );
}
