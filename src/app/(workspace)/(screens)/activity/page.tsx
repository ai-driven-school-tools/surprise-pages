import { ActivityTabs } from "@/app/activity/activity-tabs";

import { currentOrganization } from "@/lib/organization/scope";
import { visiblePagesFor } from "@/lib/access/access";
import { listMyComments } from "@/lib/comments/comments";
import { currentIdentity } from "@/lib/identity/identity";
import { listViewedPages, viewOptedOut, VIEW_RETENTION_DAYS } from "@/lib/pages/views";
import { serverTranslate } from "@/lib/i18n/server";

import { PAGE } from "@/app/_components/styles";
import { PageHeader } from "@/app/_components/page-header";
import { MyComments } from "@/app/activity/my-comments";
import { ViewedPages } from "@/app/activity/viewed-pages";

export const dynamic = "force-dynamic";

/**
 * 見たページとコメント。
 *
 * **ログイン画面へ飛ばさない。** ここに並ぶのは、名乗っていない人ならブラウザの中に
 * 残っている分だけ。公開ページを読んだだけの人が「さっきのページ」へ戻れることが
 * この画面の要なので、身分照会を挟むと、いちばん必要な人の前で扉が閉まる。
 * （名乗りは引くが、それは「アカウントに残っている分があるか」を見るためだけ。
 * 誰であっても画面そのものは開く。）
 *
 * 画面名に「履歴」を使わない。この製品では、その語はページの版（改訂）の一覧が
 * 先に使っている（右下のバーの時計）。同じ語で 2 つのものを指すと、
 * どちらの話をしているのかが会話から分からなくなる。
 *
 * ブラウザの中の分は待たずに読めるので、節の中身はブラウザ側の部品が持つ。
 * ここが渡すのはアカウントに残っている分だけで、部品が最後に 1 本へ混ぜて 1 回で描く。
 */
export default async function MePage() {
  const organization = await currentOrganization();
  const [viewer, t] = await Promise.all([currentIdentity(), serverTranslate()]);

  /*
   * **見てよいページの行を先に確定させてから、その中だけを引く。**
   *
   * 読む口にページを引かせない形にしてある（src/lib/pages/views.ts は渡された行しか見られない）。
   * 見た当時は開けたが、あとから制限がかかったページは、ここで行ごと落ちる——
   * 題を出すこと自体が漏れになるため。同じ絞り込みを 2 か所に書かないので、
   * 片方だけ直して片方を忘れる、が起こりようがない。
   *
   * 名乗っていない人のぶんも同じ道を通す。ここで「会社の人か」を見て枝を分けると、
   * 誰に何を出すかの判断が画面側にも生まれる。出すものを決めるのは読む口 1 つでよい。
   */
  /*
   * 「残さない」の設定は、見える行を待たずに同時に取りに行く（どちらももう片方を
   * 材料にしていない）。関数は米国東部・保管庫は東京にあるので、縦に並べたぶんだけ
   * 待ち時間がそのまま増える（tests/checks/check-roundtrips.mjs）。
   */
  const [visible, optedOut] = await Promise.all([visiblePagesFor(organization, viewer), viewOptedOut(organization, viewer)]);
  /*
   * 2 つの節の中身は、どちらも「見える行」が決まってからでないと引けない。ただし
   * 互いの答えは要らないので、縦に並べず同時に投げる（往復が 1 回増えるだけで済む）。
   *
   * コメントのほうだけは、読めなくても画面ごと落とさずに節の中で断る。見たページと
   * 書いたコメントは別々の記録で、片方が読めないだけでもう片方まで見られなくなるのは、
   * 「さっきのページへ戻る」というこの画面の役目に対して重すぎる。
   */
  const [server, comments] = await Promise.all([
    listViewedPages(organization, viewer, visible),
    listMyComments(organization, viewer, visible).catch(() => null),
  ]);

  return (
    <main className={PAGE}>
      <PageHeader title={t("workspace.places.activity")} />

      {/*
        タブの名前がそのまま節の名前。下に見出しと説明を重ねない（同じ名前を 2 度読ませていた）。
        何日で消えるかは src/lib/pages/views.ts が正本（掃除の仕組みと同じ数を読む）。ここに数字を
        書き写すと、片方だけ変えたときに画面が嘘をつく（消えていないのに消えたと言う／その逆）。
      */}
      {/*
        タブを待ちの表示（Suspense）で包まない。ワークスペースは待ちの表示を持たない（理由は src/app/_components/library-screen.tsx）。
      */}
      <ActivityTabs
        views={<ViewedPages server={server} optedOut={optedOut} retentionDays={VIEW_RETENTION_DAYS} />}
        comments={<MyComments rows={comments} />}
      />
    </main>
  );
}
