import Link from "next/link";
import { currentOrganization } from "@/lib/organization/scope";
import { redirect } from "next/navigation";

import { currentBrowserIdentity, isMember } from "@/lib/identity/identity";
import { listTokens, type TokenSummary } from "@/lib/identity/publish-tokens";
import { localizeStored } from "@/lib/i18n/errors";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";
import { currentLocale, serverTranslate } from "@/lib/i18n/server";
import type { Translate } from "@/lib/i18n/translate";

import {
  ALERT,
  DANGER,
  LIST,
  META,
  PAGE,
  QUIET,
  ROW_TITLE,
  SECTION_HEADING,
  SECTION_NOTE,
} from "../_components/styles";
import { PageHeader } from "../_components/page-header";
import { AddDevice } from "./add-device";
import { logOutAction } from "./actions";
import { SubmitButton } from "../_components/submit-button";

/**
 * ログイン中のデバイスの一覧。
 *
 * 使う人にとってこの画面は「いま、どこから投稿できるか」の名簿で、できるのは
 * 見ることと、1 つずつログアウトさせることだけ。増やす操作はここには無い
 * （増やすのはターミナルの `pages-publish login`）。
 *
 * **並ぶのはパソコンだけではない。** クラウド環境（Cursor / Claude）も同じ一覧に
 * 並ぶので、文言を「そのパソコン」で書き切らない。消えた環境に「もう一度ログイン
 * すれば」と言うと、できないことを勧めることになる。デバイスはその総称。
 *
 * 出せるのは名前と日時だけ。名乗りの中身も、その型（ハッシュ）も、id も
 * 画面には出さない（id はログアウトのフォームの隠し値としてだけ持つ）。
 *
 * 一覧は毎回サーバーで取り直す。クライアントに一覧の写しを持たせない。
 */

export const dynamic = "force-dynamic";

/** 画面の言葉と日付の書式。サーバーで 1 度決めて部品へ渡す（docs/guides/i18n.md）。 */
type Words = { t: Translate; locale: Locale };

/** 日付だけ。書式は言語の共通口（src/lib/i18n/format.ts・会社の暦で読む）。 */
function day(locale: Locale, iso: string): string {
  return formatDate(locale, iso);
}

/** 日付と時刻（分まで）。 */
function stamp(locale: Locale, iso: string): string {
  return formatDateTime(locale, iso);
}

/**
 * 一覧に出す名前。名前が届いていなかった古いものは、代わりの呼び名で出す。
 * 代わりの呼び名（「不明なデバイス」）は保存先にも日本語の字で残るので、出すときに訳す
 * （src/app/cli-login/actions.ts が辞書の日本語で置く）。
 */
function displayName(t: Translate, computer: TokenSummary): string {
  return computer.label.length > 0 ? localizeStored(computer.label, t) : t("auth.devices.unnamed");
}

/** 行の副文。ログインした日は日付だけ、投稿・ログアウトの時刻は分まで。 */
function summaryLine({ t, locale }: Words, computer: TokenSummary): string {
  const since = t("auth.devices.signedIn", { date: day(locale, computer.createdAt) });
  if (computer.revokedAt !== null) return `${since} ・ ${t("auth.devices.loggedOut", { time: stamp(locale, computer.revokedAt) })}`;
  // 期限の切れたものはログアウト済みの節に並べ、いつ切れたかを書く
  if (computer.expired) return `${since} ・ ${computer.expiresAt === null ? t("auth.devices.expired") : t("auth.devices.expiredAt", { time: stamp(locale, computer.expiresAt) })}`;
  if (computer.lastUsedAt === null) return `${since} ・ ${t("auth.devices.noUsePublish")}`;
  return `${since} ・ ${t("auth.devices.lastPublish", { time: stamp(locale, computer.lastUsedAt) })}`;
}

/** ログアウトしたら何ができなくなるか。 */
function consequence(t: Translate): string {
  return t("auth.devices.consequencePublish");
}

/** ログイン中の 1 行。押せないので `a` にせず、hover の背景も付けない。 */
function LiveRow({ computer, words }: { computer: TokenSummary; words: Words }) {
  const { t } = words;
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <span className="min-w-0">
        <span className={`block truncate ${ROW_TITLE}`}>{displayName(t, computer)}</span>
        <span className={`block truncate ${META}`}>{summaryLine(words, computer)}</span>
      </span>
      {/*
        ログアウトは 2 段階。ここでは道筋を変えるだけで、行がその場で確認に開く。
      */}
      <Link
        href={`/devices?confirm=${computer.id}#confirm`}
        aria-label={t("auth.devices.logoutLabel", { name: displayName(t, computer) })}
        className={`shrink-0 ${QUIET}`}
      >
        {t("auth.devices.logout")}
      </Link>
    </div>
  );
}

/** ログアウト済みの 1 行。色を足さず、節の位置と操作の無さで区別する。 */
function StoppedRow({ computer, words }: { computer: TokenSummary; words: Words }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <span className="min-w-0">
        <span className={`block truncate ${ROW_TITLE}`}>{displayName(words.t, computer)}</span>
        <span className={`block truncate ${META}`}>{summaryLine(words, computer)}</span>
      </span>
    </div>
  );
}

/** 「ログアウト」を押した行。ここだけが確認文と 2 つのボタンに置き換わる。 */
function ConfirmRow({ computer, words }: { computer: TokenSummary; words: Words }) {
  const { t, locale } = words;
  const name = displayName(t, computer);
  return (
    <div className="py-3">
      {/*
        道筋の目印（#confirm）を付けて、移動してきたときにここへ視線と読み上げが届くようにする。
      */}
      {/*
        「そのパソコン」と言い切らない。ここにはクラウド環境も並ぶので、
        パソコン前提の言い方だと、消えた環境に「もう一度ログインすれば」と
        できないことを勧めてしまう。
      */}
      <p id="confirm" tabIndex={-1} className="text-sm">
        {/* 同じ名前が並んだときのために、ログインした日も添える */}
        {t("auth.devices.confirm", { name, date: day(locale, computer.createdAt), consequence: consequence(t) })}
      </p>
      <form action={logOutAction} className="mt-2 flex items-baseline gap-4">
        <input type="hidden" name="id" value={computer.id} />
        <SubmitButton
          idle={t("auth.devices.logout")}
          busy={t("auth.devices.loggingOut")}
          label={t("auth.devices.logoutLabel", { name })}
          className={DANGER}
        />
        <Link href="/devices" className={QUIET}>
          {t("auth.devices.cancel")}
        </Link>
      </form>
    </div>
  );
}

export default async function TokensPage({
  searchParams,
}: {
  searchParams: Promise<{ confirm?: string; stopped?: string; error?: string }>;
}) {
  const organization = await currentOrganization();
  const viewer = await currentBrowserIdentity();
  if (!isMember(viewer)) redirect("/signin?next=/devices");

  const { confirm, stopped, error } = await searchParams;
  const [t, locale] = await Promise.all([serverTranslate(), currentLocale()]);
  const words: Words = { t, locale };

  let computers: TokenSummary[] | null = null;
  try {
    computers = await listTokens(organization, viewer.email);
  } catch {
    computers = null;
  }

  // 期限切れはもう使えないので、ログアウト済みと同じ節に並べる
  const live = computers === null ? [] : computers.filter((one) => one.revokedAt === null && !one.expired);
  const dead = computers === null ? [] : computers.filter((one) => one.revokedAt !== null || one.expired);

  const justStopped =
    stopped === undefined || computers === null
      ? null
      : (computers.find((one) => one.id === stopped) ?? null);
  const stoppedLine =
    justStopped === null ? null : t("auth.devices.stopped", { name: displayName(t, justStopped) });

  return (
    <main className={PAGE}>
      <PageHeader title={t("auth.devices.title")} back={{ href: "/settings", label: t("auth.devices.back") }} />

      {stoppedLine !== null ? <p className={SECTION_NOTE}>{stoppedLine}</p> : null}
      {error === "stop" ? (
        <p className={`mb-4 ${ALERT}`}>{t("auth.devices.stopFailed")}</p>
      ) : null}

      <AddDevice />

      <section className="mb-12">
        <h2 className={SECTION_HEADING}>{t("auth.devices.live")}</h2>
        <p className={SECTION_NOTE}>{t("auth.devices.liveNote")}</p>
        {computers === null ? (
          <p className={ALERT}>{t("auth.devices.loadFailed")}</p>
        ) : live.length === 0 ? (
          <p className={SECTION_NOTE}>{t("auth.devices.empty")}</p>
        ) : (
          <ul className={LIST}>
            {live.map((computer) => (
              <li key={computer.id}>
                {confirm === computer.id ? (
                  <ConfirmRow computer={computer} words={words} />
                ) : (
                  <LiveRow computer={computer} words={words} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {dead.length > 0 ? (
        <section>
          <h2 className={SECTION_HEADING}>{t("auth.devices.dead")}</h2>
          <ul className={LIST}>
            {dead.map((computer) => (
              <li key={computer.id}>
                <StoppedRow computer={computer} words={words} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
