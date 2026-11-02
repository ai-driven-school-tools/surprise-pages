"use client";
import type { MyComment } from "@/lib/comments/comments";
import { formatDateTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";

import { useLocale, useT } from "../_components/i18n";
import { Icon } from "../_components/icons";
import { ALERT } from "../_components/styles";

/**
 * 書いたコメントの節。
 *
 * **並べるのは「渡された行」だけ**で、この部品は自分でコメントもページも引かない。
 * 引ける形にすると、見てよいページの絞り込みがここにも生まれ、片方を直して片方を
 * 忘れる余地ができる（見たページの節と、まったく同じ理由・同じ作法）。
 *
 * **消す入口は置かない。** コメントを消すのはページの中のコメント欄で、そこには
 * 引用も返信も並んでいる。文脈の見えないここから消せるようにすると、返信の付いた
 * 1 件を、返事があることを知らないまま消せてしまう。節の説明でその場所を案内する。
 *
 * 行を押すと**ページを開くだけ**（コメントの位置までは飛ばさない）。飛ばすには
 * ページの中の印を当て直す仕掛けが要り、当たらなかったときに黙って先頭が出る。
 */

/** 日付と時刻（2026/08/13 11:20）。ほかの画面と同じ書式の共通口（相対表記は使わない・時刻帯は東京）。 */
function stamp(locale: Locale, iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "" : formatDateTime(locale, at);
}

export function MyComments({ rows }: { rows: readonly MyComment[] | null }) {
  const t = useT();
  const locale = useLocale();
  /*
   * 読めなかったときは、空とは別の文で断る。無言で空になると、1 件も書いていないのか
   * 読めなかったのかが区別できない（見たページの節と同じ書き分け）。
   */
  if (rows === null) {
    return (
      <p className={ALERT}>{t("activity.comments.loadFailed")}</p>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="ws-empty">
        <Icon name="comments" />
        <p className="font-medium">{t("activity.comments.empty")}</p>
      </div>
    );
  }

  return (
    <ul>
      {rows.map((row) => (
        <li key={row.id}>
          {/*
            見たページと同じ 1 行。行そのものが、そのコメントの位置へのリンク。
            1 行目は書いた文、2 行目はどのページか。右に状態と日時（どちらも縮まない列）。
          */}
          <a href={`${row.href}#c=${row.id}`} className="ws-row ws-row-activity">
            <span className="min-w-0">
              <span className="ws-name block">{row.body}</span>
              <span className="ws-row-author truncate">{row.pageTitle}</span>
            </span>
            <span className="ws-row-note">{row.resolved ? t("activity.comments.resolved") : t("activity.comments.open")}</span>
            <time className="ws-row-date" dateTime={row.createdAt}>
              {stamp(locale, row.createdAt)}
            </time>
          </a>
        </li>
      ))}
    </ul>
  );
}
