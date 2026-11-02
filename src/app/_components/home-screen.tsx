import Link from "next/link";
import { currentOrganization } from "@/lib/organization/scope";
import { LinkPending } from "./back-link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { currentIdentity, isMember } from "@/lib/identity/identity";
import { homeFor, type HomeNote, type HomeRow } from "@/lib/workspace/home";
import { formatDateTime, formatMonthDay, formatTime, TIME_ZONE } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";
import { intlLocale } from "@/lib/i18n/locales";
import { currentLocale, serverTranslate } from "@/lib/i18n/server";
import type { Translate } from "@/lib/i18n/translate";
import { KIND_LABELS } from "@/lib/workspace/model";
import { ACTIVITY_PLACE } from "@/lib/workspace/places";

import { Icon } from "./icons";
import { PageHeader } from "./page-header";

/**
 * ホーム。中身の決まりは src/lib/workspace/home.ts（ここは並べて字にするだけ）。
 *
 * 行は資料の一覧と同じ 1 行（`.ws-row`）。題｜添え書き｜時刻の 3 列で、3 つの節とも右端を 1 本にそろえる。
 * 節は見出しの太さと余白だけで分ける（線も囲みも足さない）。空の節のうち、コメントと共有は**見出しごと出さない**
 * ——来ている日だけ上に出て、無い日は「最近開いたもの」が先頭に来る。
 */

/** 行の時刻。今日なら時刻だけ、それより前は月日（一覧の更新日と同じ形）。 */
function when(locale: Locale, iso: string, today: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const day = new Intl.DateTimeFormat(intlLocale(locale), { timeZone: TIME_ZONE, dateStyle: "short" }).format(at);
  return day === today ? formatTime(locale, at) : formatMonthDay(locale, at);
}

function noteText(t: Translate, note: HomeNote): string {
  switch (note.kind) {
    case "commented":
      return t("home.commented", { name: note.name, count: note.count });
    case "replied":
      return t("home.replied", { name: note.name });
    case "shared":
      return t("home.sharedWithYou");
    case "author":
      return note.name ?? t("home.mine");
  }
}

function Rows({ rows, t, locale, today }: { rows: HomeRow[]; t: Translate; locale: Locale; today: string }) {
  return (
    <ul>
      {rows.map((row) => (
        <li className="ws-row ws-row-home" key={row.href}>
          <a className="ws-row-title" href={row.href}>
            <span className="ws-kind" title={t(KIND_LABELS[row.kind])}>
              <Icon name={row.kind} />
              <span className="sr-only">{t("library.kindPrefix", { kind: t(KIND_LABELS[row.kind]) })}</span>
            </span>
            <span className="ws-name" title={row.title}>
              {row.title}
            </span>
          </a>
          <span className="ws-row-note">{noteText(t, row.note)}</span>
          <time className="ws-row-date" dateTime={row.at} title={formatDateTime(locale, row.at)}>
            {when(locale, row.at, today)}
          </time>
        </li>
      ))}
    </ul>
  );
}

function Section({
  id,
  title,
  count,
  more,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  more?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <section className="ws-section" aria-labelledby={id}>
      <div className="ws-section-head">
        <h2 id={id}>
          {title}
          {count !== undefined ? <span className="ws-section-count">{count}</span> : null}
        </h2>
        {more ? (
          <Link href={more.href} prefetch={false} className="ws-section-more">
            {more.label}
            <Icon name="next" small />
            <LinkPending />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export async function HomeScreen() {
  const organization = await currentOrganization();
  const viewer = await currentIdentity();
  if (!isMember(viewer)) redirect("/signin");
  const [home, t, locale] = await Promise.all([homeFor(organization, viewer), serverTranslate(), currentLocale()]);
  const today = new Intl.DateTimeFormat(intlLocale(locale), { timeZone: TIME_ZONE, dateStyle: "short" }).format(new Date());
  const list = (rows: HomeRow[]) => <Rows rows={rows} t={t} locale={locale} today={today} />;

  return (
    <main>
      <PageHeader
        title={t("workspace.places.home")}
        actions={
          <a className="ws-button ws-primary" href="/create">
            <Icon name="create" />
            {t("library.create")}
          </a>
        }
      />

      {/* 「続きに戻る」画面なので、最近開いたものを一番上に。知らせ（コメント・共有）は来ている日だけ、その下に出る */}
      <Section
        id="home-recent"
        title={t("home.sections.recent")}
        more={{ href: ACTIVITY_PLACE.href, label: t("home.seeAll") }}
      >
        {home.recent.rows.length > 0 ? (
          list(home.recent.rows)
        ) : home.recent.paused ? (
          <p className="ws-muted">
            {t("home.recentPaused")}{" "}
            <Link href="/settings" prefetch={false} className="underline underline-offset-2">
              {t("home.recentPausedLink")}
            </Link>
          </p>
        ) : (
          <p className="ws-muted">{t("home.recentEmpty")}</p>
        )}
      </Section>

      {home.comments.rows.length > 0 ? (
        <Section id="home-comments" title={t("home.sections.comments")} count={home.comments.total}>
          {list(home.comments.rows)}
        </Section>
      ) : null}

      {home.shared.rows.length > 0 ? (
        <Section id="home-shared" title={t("home.sections.shared")} count={home.shared.total}>
          {list(home.shared.rows)}
        </Section>
      ) : null}

      {/* 右端の行き先は置かない——サイドバーの「会社の資料」と同じ名前の押す部品を 1 画面に 2 つ並べない */}
      <Section id="home-fresh" title={t("home.sections.fresh")}>
        {home.fresh.rows.length > 0 ? list(home.fresh.rows) : <p className="ws-muted">{t("home.freshEmpty")}</p>}
      </Section>
    </main>
  );
}
