import { notFound } from "next/navigation";

import { isAdmin } from "@/lib/access/access";
import { currentIdentity, isMember, type Member } from "@/lib/identity/identity";
import type { OrganizationScope } from "@/lib/organization/scope";

/**
 * 管理画面の実行係の番人（src/app/sharing/actions.ts・src/app/sharing/people-actions.ts の両方がここを呼ぶ）。
 *
 * **1 つずつ、必ず自分で名簿を確かめる。** server action は画面とは別に叩ける口なので、
 * 「管理画面を開けたのだから通してよい」は成り立たない。画面を出すときの判定と、
 * ここでの判定は別々に要る。管理者かは要求の組織での所属の役割（持ち主・管理者）で決まる（src/lib/access/access.ts の `isAdmin`）。
 *
 * 名簿に無い人には 404 を返す（画面と同じ。あることを教えない）。
 * "use server" のファイルの外に置くのは、そこから書き出した関数が全部、画面から叩ける口になるため（番人そのものを口にしない）。
 */
export async function requireAdmin(organization: OrganizationScope): Promise<Member> {
  const viewer = await currentIdentity();
  if (!isMember(viewer)) notFound();
  if (!(await isAdmin(organization, viewer))) notFound();
  return viewer;
}
