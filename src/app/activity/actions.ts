"use server";

import { refresh } from "next/cache";

import { currentOrganization } from "@/lib/organization/scope";
import { openPage } from "@/lib/access/access";
import { parsePageSlug } from "@/lib/comments/comments";
import { currentIdentity, isMember } from "@/lib/identity/identity";
import {
  forgetAllPageViews,
  forgetPageView,
  setViewOptOut,
} from "@/lib/pages/views";

/**
 * 「見たページとコメント」からの、アカウント側の消しもの。
 *
 * ここは画面とは別に叩ける口なので、**1 つずつ自分で名乗りを確かめる**
 * （「画面を開けたのだから通してよい」は成り立たない・src/app/sharing/actions.ts と同じ）。
 *
 * ## 消せるのは自分の行だけ
 *
 * 誰の控えかは**必ず名乗りから採り、送られてきた値からは受け取らない**。アドレスを
 * 受ける形にすると、他人のアドレスを書いて叩くだけで、その人の控えを消せる口になる。
 * 送られてくるのは「どのページか」と「入り切り」だけで、どちらも**中身は信じない**
 * （画面から来る値は、人が書いた文字と同じだけしか信用できない）。
 *
 * ## 門を迂回しない
 *
 * 1 行消すときも `openPage` を通す。控える口（src/app/api/views）とまったく同じ判定なので、
 * 「いま開けないページ」を指して叩いても何も起きない。消すだけなら通してもよさそうに
 * 見えるが、通せば**存在するかどうかを当てる道具**になる（消えたか消えないかで答えが返る）。
 *
 * ## うまくいかなかったときは、行が戻る
 *
 * 断りの文言は出さない。消せていなければ次の描き直しで行がそのまま並ぶので、
 * 画面がいつでも保管庫の言うとおりになる。「消えました」と言って残っているより、
 * 消えていないことがそのまま見えるほうが正しい。
 */

/** 会社の人でなければ、アカウント側には何も起きない（ゲストと名無しには自分の分が無い）。 */
async function member() {
  const viewer = await currentIdentity();
  return isMember(viewer) ? viewer : null;
}

/** 1 行だけ消す。どのページかは呼び名（`internal/…`）で受けて、門を通してから消す。 */
export async function forgetViewAction(page: unknown): Promise<void> {
  const organization = await currentOrganization();
  const viewer = await member();
  const ref = parsePageSlug(page);
  if (viewer !== null && ref !== null) {
    try {
      const gate = await openPage(organization, viewer, ref.slug);
      if (gate.ok) await forgetPageView(viewer, gate.page);
    } catch {
      // 消せなかったときは、消えていない行がそのまま戻る
    }
  }
  refresh();
}

/** アカウントに残っている自分の分を全部消す。 */
export async function forgetAllViewsAction(): Promise<void> {
  const organization = await currentOrganization();
  const viewer = await member();
  if (viewer !== null) {
    try {
      await forgetAllPageViews(organization, viewer);
    } catch {
      // 同上。消えていない行は次の描き直しでまた並ぶ
    }
  }
  refresh();
}

/** 「記録を残さない」を入り切りする。オンにすると、いま残っている分も消える。 */
export async function setViewOptOutAction(off: unknown): Promise<void> {
  const organization = await currentOrganization();
  const viewer = await member();
  if (viewer !== null) {
    try {
      await setViewOptOut(organization, viewer, off === true);
    } catch {
      // 設定が入っていなければ、次の描き直しで入口が元の側に戻る
    }
  }
  refresh();
}
