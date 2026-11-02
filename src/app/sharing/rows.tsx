import Link from "next/link";
import type { ReactNode } from "react";

import { formatDate, formatDateTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";
import type { Translate } from "@/lib/i18n/translate";

import { META, QUIET, ROW_TITLE } from "../_components/styles";
import { SubmitButton } from "../_components/submit-button";
import { revokePermissionAction } from "./actions";

/**
 * 管理画面の面どうしで使い回す行の部品と小物（src/app/sharing/page.tsx と src/app/sharing/people.tsx で分けた）。
 * 面ごとに書き写すと、同じ役割の行が面ごとに違う見た目・違う的になって揃わなくなるので、1 か所に置く。
 */

/** 日付と時刻（分まで）。書式は言語の共通口（src/lib/i18n/format.ts・会社の暦で読む）。 */
export function stamp(locale: Locale, iso: string): string {
  return formatDateTime(locale, iso);
}

/** 日付だけ。管理者になった日は、分まで出しても読み手の判断が変わらない。 */
export function day(locale: Locale, iso: string): string {
  return formatDate(locale, iso);
}

/**
 * 画面の言葉を引く道具。サーバーで 1 度決めて、部品へ渡して回る
 * （部品ごとに言語を決め直さない・docs/guides/i18n.md）。
 */
export type Words = { t: Translate; locale: Locale };

/** 題の分からないページ（台帳から消えたページを指したままの行）は、言葉で代える。 */
export function titleOr(t: Translate, title: string | null): string {
  return title ?? t("admin.common.unknownPage");
}


/**
 * そのグループが、いま何枚の**閲覧を制限したページ**で効いているか。
 *
 * 数えているのは、いま閲覧を制限しているページに出ている許可だけ。制限を外したページに
 * 残っている許可は、いま誰の出入りも変えていないので数えない（`src/lib/access/access.ts` の
 * `setPageRestricted` は見せ方の列を書き換えるだけで、許可の行はそのまま残る）。
 * 数えていない分があるので、文言にも「閲覧を制限した」と母集団を書く。
 */
export function usageOf(t: Translate, pageCount: number): string {
  if (pageCount === 0) return t("admin.groups.unused");
  return t("admin.groups.usedOn", { count: pageCount });
}


/**
 * 一覧の 1 行まるごとを行き先にする。
 *
 * 一覧はどれも「1 行 = 1 件の入口」なので、名前の字だけを的にしない。
 * 2 行目まで読んでから押す動きに、細い的は合わない。
 */
export function RowLink({ href, title, note }: { href: string; title: string; note: string }) {
  return (
    <Link
      href={href}
      className="block py-3 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900"
    >
      <span className={`block truncate ${ROW_TITLE}`}>{title}</span>
      <span className={`block truncate ${META}`}>{note}</span>
    </Link>
  );
}

/**
 * 詳細面の行 1 本。左に誰か・何か、その下に理由、右に外す口（外せない相手には置かない）。
 *
 * 題は文字でもリンクでもよい（辿れる先があるときだけリンクにする）。
 * リンクにするときも行の高さは変えない——右の「外す」と 1 行目の底が揃わなくなるため。
 */
export function DetailRow({
  title,
  note,
  detail,
  children,
}: {
  title: ReactNode;
  /** 理由・補足の 1 行（無ければ出さない） */
  note?: string;
  /** さらに 1 行だけ添える細字（まとまりに入っている人の顔ぶれ） */
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <span className="min-w-0">
        <span className={`block truncate ${ROW_TITLE}`}>{title}</span>
        {note === undefined ? null : <span className={`block truncate ${META}`}>{note}</span>}
        {detail === undefined ? null : <span className={`block truncate ${META}`}>{detail}</span>}
      </span>
      {children}
    </div>
  );
}


/**
 * 許可を 1 件外す口。目印だけでなくページも一緒に送る（別のページの許可を消させない）。
 *
 * `from` は「人の面から押した」の印。実行係はそれを見て、その人を開いたまま返す。
 */
export function RevokeForm({
  id,
  pageId,
  label,
  from,
  t,
}: {
  id: string;
  pageId: string;
  label: string;
  from?: string;
  t: Translate;
}) {
  return (
    <form action={revokePermissionAction} className="shrink-0">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="pageId" value={pageId} />
      {from === undefined ? null : <input type="hidden" name="from" value={from} />}
      <SubmitButton idle={t("admin.common.remove")} busy={t("admin.common.removing")} label={label} className={QUIET} />
    </form>
  );
}

