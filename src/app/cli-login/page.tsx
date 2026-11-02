import { redirect } from "next/navigation";

import { currentOrganization } from "@/lib/organization/scope";
import { findOpenPending } from "@/lib/identity/cli-login-pending";
import { currentBrowserIdentity, isMember } from "@/lib/identity/identity";
import { serverTranslate } from "@/lib/i18n/server";

import { Handoff } from "./handoff";
import { firstValue, localTarget, usableState } from "./handoff-target";
import { META, PAGE_NARROW, SECTION_NOTE, TITLE } from "../_components/styles";

/**
 * ターミナルからのログイン。
 *
 * 手元の投稿コマンドには「自分が誰か」を名乗る手段が無い。そこで一度だけこの画面を開き、
 * 会社の Google アカウントで入ってもらい、そのパソコン用の名乗りを 1 つ用意して
 * ターミナルへ渡す。使う人にとっての出来事は「このパソコンから投稿できるようになった」で、
 * 渡す中身そのものは画面にも URL にも出さない（handoff.tsx が本文で届ける）。
 *
 * クラウド環境には人のブラウザが無い。そのときは番号（port）が付かない URL で開き、
 * 許可した名乗りは手元へ送らず、クラウド環境が取りに来る郵便受けへ置く。
 *
 * **この画面を開いただけでは何も用意しない。** 用意するのは「許可する」を押したときだけ
 * （src/app/cli-login/actions.ts）。開いた時点で用意すると、更新や戻るのたびに一覧が増えるうえ、
 * リンクを踏ませるだけで待ち構えているパソコンへ名乗りを届けさせられる。
 *
 * 届け先の番号は画面に出さない。数字を見せても、心当たりのある人にしか意味が無く、
 * 多くの人には読めない飾りが増えるだけになる。人が確かめられるのは
 * 「いま自分でターミナルに打ったかどうか」なので、聞くのはそれだけにする。
 * ターミナルが送ってきたパソコンの名前も、ここでは見せない（外から書ける文字なので、
 * 判断のよりどころにすると「あなたのパソコン」と名乗られたときに効かなくなる）。
 *
 * 誰を通すかは src/auth.ts の判定に任せる。ここで会社かどうかを数え直さない
 * （入口ごとに書くと、片方だけ緩い判定になったときに気づけない）。
 *
 */

export const dynamic = "force-dynamic";

export default async function CliLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const organization = await currentOrganization();
  const params = await searchParams;
  const port = firstValue(params["port"]);
  const target = localTarget(port);
  const handshake = usableState(firstValue(params["state"]));
  const name = firstValue(params["name"]);
  const t = await serverTranslate();

  const local = target !== null && handshake !== null && port !== null;
  const remote =
    !local && handshake !== null && port === null
      ? await findOpenPending(organization, handshake)
      : null;

  // 通せない形なら、ログインもさせず、何も用意しない
  if (!local && remote === null) {
    return (
      <main className={PAGE_NARROW}>
        <h1 className={TITLE}>{t("auth.cliLogin.title")}</h1>
        <p className={SECTION_NOTE}>{t("auth.cliLogin.direct")}</p>
      </main>
    );
  }

  const back = local && port !== null && handshake !== null
    ? new URLSearchParams({ port, state: handshake })
    : new URLSearchParams({ state: handshake ?? "" });
  if (name !== null) back.set("name", name);

  const viewer = await currentBrowserIdentity();
  if (!isMember(viewer)) {
    redirect(`/signin?next=${encodeURIComponent(`/cli-login?${back.toString()}`)}`);
  }
  // 組織の指定は無い（この設置は組織が 1 つだけ）
  const organizationSlug = null;

  if (local && target !== null && handshake !== null) {
    return (
      <main className={PAGE_NARROW}>
        <h1 className={TITLE}>{t("auth.cliLogin.title")}</h1>
        <p className={META}>{viewer.email}</p>

        <div className="mt-6">
          <Handoff
            target={target}
            handshake={handshake}
            email={viewer.email}
            computer={name ?? ""}
            organizationSlug={organizationSlug}
          />
        </div>
      </main>
    );
  }

  return (
    <main className={PAGE_NARROW}>
      <h1 className={TITLE}>{t("auth.cliLogin.title")}</h1>
      <p className={META}>{viewer.email}</p>

      {/*
        何をする画面かの説明と、心当たりがない人への断りは、どちらも**押す前だけ**意味がある。
        押したあとも出したままだと、済んだ人に「これからします」「閉じろ」と言い続けることに
        なるので、状態を持っている Handoff 側に置いてある。ここは額縁だけを持つ。
      */}
      <div className="mt-6">
        <Handoff
          target={null}
          handshake={handshake ?? ""}
          email={viewer.email}
          computer={name ?? ""}
          organizationSlug={organizationSlug}
        />
      </div>
    </main>
  );
}
