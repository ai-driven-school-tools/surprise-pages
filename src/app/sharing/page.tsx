import { currentOrganization } from "@/lib/organization/scope";
import PersonalAdmin from "./personal";
import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/access/access";
import { currentIdentity, isMember } from "@/lib/identity/identity";

/**
 * 管理画面。開けるのは設置した本人（持ち主）だけ。それ以外には **404**（403 にすると「そういう画面がある」ことだけは伝わってしまう）。
 * 中身は資料ごとの招待の一覧（src/app/sharing/personal.tsx）。
 */
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const organization = await currentOrganization();
  const viewer = await currentIdentity();
  if (!isMember(viewer)) notFound();
  if (!(await isAdmin(organization, viewer))) notFound();
  return <PersonalAdmin viewer={viewer} />;
}
