import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { currentIdentity, currentBrowserIdentity, isMember } from "@/lib/identity/identity";
import { safeInternalPath } from "@/lib/pages/safe-path";
import { serverTranslate } from "@/lib/i18n/server";
import { siteName } from "@/lib/settings/site-settings";

import { BrandMark } from "../_components/brand-mark";
import { ALERT, PAGE_NARROW, PRIMARY, SECTION_NOTE, TITLE } from "../_components/styles";

export const dynamic = "force-dynamic";

/** 「別のアカウントでログイン」の印。Google のアカウントの選択を必ず出す。 */
const CHOOSE_ACCOUNT_VALUE = "choose";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; account?: string }>;
}) {
  const params = await searchParams;
  const { next, error } = params;
  const target = safeInternalPath(next) ?? "/";
  const choose = params.account === CHOOSE_ACCOUNT_VALUE;

  /*
   * すでに名乗れている人は、ログインの画面を見せずに行き先へ通す。
   * 名乗りの読み取りは src/lib/identity/identity.ts に任せる（この画面が自分でセッションをのぞくと、ログイン状態を読む口が 2 つになる）。
   * 手元では、ログインを省いた仮の人もここで通り、Google の画面には一度も飛ばない。
   */
  const identity = await currentIdentity();
  const viewer = target.startsWith("/devices") || target.startsWith("/cli-login") ? await currentBrowserIdentity() : identity;
  if (isMember(viewer)) redirect(target);
  const t = await serverTranslate();

  return (
    <main className={PAGE_NARROW}>
      {/* タブ・サイドバーと同じ印。名乗りの上に 1 つだけ置く */}
      <div className="mb-6">
        <BrandMark size={32} />
      </div>
      <h1 className={TITLE}>{siteName()}</h1>
      <p className={`${SECTION_NOTE} break-keep`}>{t("auth.signin.personalPrompt")}</p>

      {error ? <p className={`mb-4 ${ALERT}`}>{t("auth.signin.personalFailed")}</p> : null}

      {/*
        押す口までの距離は 24px（説明の mb-4 + ここの mt-2）。断りが出たときも、
        断りが同じ mb-4 を持つので距離は変わらない。
      */}
      <form
        className="mt-2"
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: target }, choose ? { prompt: "select_account" } : {});
        }}
      >
        <button type="submit" className={`w-full ${PRIMARY}`}>
          {t("auth.signin.google")}
        </button>
      </form>
    </main>
  );
}
