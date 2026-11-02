import Link from "next/link";
import { PAGE, PRIMARY, SECTION_NOTE, TITLE } from "./_components/styles";
import { serverTranslate } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = await serverTranslate();
  return (
    <main className={PAGE}>
      <h1 className={TITLE}>{t("errors.notFound.title")}</h1>
      <p className={SECTION_NOTE}>{t("errors.notFound.detail")}</p>
      <Link href="/" className={PRIMARY}>
        {t("errors.notFound.back")}
      </Link>
    </main>
  );
}
