"use client";

import { PAGE, PRIMARY, SECTION_NOTE, TITLE } from "./_components/styles";
import { ErrorMark } from "./_components/error-mark";
import { defaultTranslate as t } from "@/lib/i18n/default";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

/**
 * 外枠そのものが描けなかったときの最後の画面。外枠を通らないので全体の見た目は付かない
 * （Next の決まり）が、語彙は他の画面とそろえる。文字だけで、何が起きたかと次の一手を伝える。
 * 問い合わせの番号は Next が渡す照合用の番号（digest）なので、外枠が無くても出せる。
 * 外枠を通らないので、その人の言語（ベータの入り切りと個人設定）も分からない。日本語の辞書を引く。
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang={DEFAULT_LOCALE}>
      <body>
        <main className={PAGE}>
          <h1 className={TITLE}>{t("errors.global.title")}</h1>
          <p className={SECTION_NOTE}>{t("errors.global.detail")}</p>
          <button type="button" className={PRIMARY} onClick={() => retry()}>
            {t("common.retry")}
          </button>
          <ErrorMark digest={error.digest} />
        </main>
      </body>
    </html>
  );
}
