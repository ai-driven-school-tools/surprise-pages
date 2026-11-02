"use client";

import { PAGE, TITLE, SECTION_NOTE, PRIMARY } from "./_components/styles";
import { ErrorMark } from "./_components/error-mark";
import { useT } from "./_components/i18n";

export default function WorkspaceError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useT();
  return (
    <main className={PAGE}>
      <h1 className={TITLE}>{t("errors.screen.title")}</h1>
      <p className={SECTION_NOTE}>{t("errors.screen.detail")}</p>
      <button className={PRIMARY} onClick={() => retry()}>
        {t("common.retry")}
      </button>
      <ErrorMark digest={error.digest} />
    </main>
  );
}
