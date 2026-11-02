"use server";

import { redirect } from "next/navigation";

import { currentOrganization } from "@/lib/organization/scope";
import { currentBrowserIdentity, isMember } from "@/lib/identity/identity";
import { isTokenId, revokeToken } from "@/lib/identity/publish-tokens";

/**
 * この画面からできる操作は 1 つだけ ——「このパソコンをログアウトさせる」。
 *
 * 増やす操作はここに置かない。増やすのはターミナル（`pages-publish login`）で、
 * その入口は許可を押した人の手元にしか無い。画面から増やせるようにすると、
 * 名乗りの中身を人が写して貼ることになり、写しが画面やコピー履歴に残る。
 */

/** ログインしていない人・会社の人でない人の行き先。 */
const SIGN_IN = "/signin?next=/devices";

/**
 * 1 台ログアウトさせる。
 *
 * 結果は画面の状態ではなく道筋（/devices?stopped=…）で伝える。ログアウトのあとに
 * 一覧を取り直すのはサーバーなので、クライアントに一覧の写しを持たせずに済む。
 * 載せるのは id だけ。パソコンの名前は載せない（人が書いた文字を URL に流さない）。
 */
export async function logOutAction(form: FormData): Promise<void> {
  const organization = await currentOrganization();
  const viewer = await currentBrowserIdentity();
  if (!isMember(viewer)) redirect(SIGN_IN);

  const id = form.get("id");
  if (!isTokenId(id)) redirect("/devices?error=stop");

  let stopped = false;
  try {
    stopped = await revokeToken(organization, id, viewer.email);
  } catch {
    stopped = false;
  }

  redirect(stopped ? `/devices?stopped=${id}` : "/devices?error=stop");
}
