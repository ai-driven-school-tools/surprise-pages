import type { Metadata } from "next";
import "./globals.css";
import { installationProblem } from "@/lib/db/database";
import { SetupGuide } from "./_components/setup-guide";
import { I18nProvider } from "./_components/i18n";
import { currentLocale, currentOrganizationName, currentShareableOrganizationName } from "@/lib/i18n/server";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { defaultTranslate } from "@/lib/i18n/default";
import { organizationParams } from "@/lib/i18n/translate";
import { siteName } from "@/lib/settings/site-settings";

/**
 * 画面の題と説明。製品名（Pages）はそのまま、説明は要求の組織の名前で言う（「見本商事の図解・レポート置き場」）。
 * 組織の名前は宛先に既に出ているので、説明に出しても漏れにならない。ページ本体の中身（題・要約）は載せない（src/lib/pages/og.ts）。
 */
export async function generateMetadata(): Promise<Metadata> {
  // 説明はログインの画面にも載るので、配布版では組織の名前（設置した本人の呼び方）を出さない
  const organization = await currentShareableOrganizationName();
  return {
    title: siteName(),
    // 検索に載せない画面の説明なので、言語では分けない（日本語の辞書から採る）
    description: defaultTranslate("app.description", organizationParams(organization)),
    // 一覧やログイン画面も検索には載せない（ページ本体は src/lib/pages/og.ts 側で同じ指定が付く）
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const problem = await installationProblem();
  // 画面の言語（多言語対応の基盤・docs/guides/i18n.md）。URL には載せず、人の設定とブラウザの言語で決める
  // 組織の名前は言語と同じ 1 回の組織の設定の読みを分け合う（縦に待つ段を増やさない）
  const [locale, organization] = await Promise.all([currentLocale(), currentOrganizationName()]);
  return (
    <html lang={locale}>
      <body className="min-h-dvh bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <I18nProvider locale={locale} messages={locale === DEFAULT_LOCALE ? undefined : messagesFor(locale)} organization={organization}>
          {problem ? <SetupGuide problem={problem} /> : children}
        </I18nProvider>
      </body>
    </html>
  );
}
