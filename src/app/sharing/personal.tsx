import Link from "next/link";
import { currentOrganization } from "@/lib/organization/scope";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentBrowserIdentity, type Member } from "@/lib/identity/identity";
import { isSiteOwner, validEmail } from "@/lib/settings/site-settings";
import { grantToMember, listPagePermissions, openPage, revokePermission, visiblePagesFor } from "@/lib/access/access";
import { PAGE, SECTION_NOTE, SECTION_HEADING, FIELD, PRIMARY, DANGER, LIST, ROW_TITLE } from "../_components/styles";
import { PageHeader } from "../_components/page-header";
import { serverTranslate } from "@/lib/i18n/server";

async function updateInvitation(form: FormData) {
  "use server";
  const organization = await currentOrganization();
  const actor = await currentBrowserIdentity();
  if (actor === null || !isSiteOwner(actor.email)) redirect("/signin?next=/sharing");
  const slug = form.get("page");
  if (typeof slug !== "string") return;
  const gate = await openPage(organization, actor, slug);
  if (!gate.ok) return;
  const remove = form.get("remove");
  if (typeof remove === "string") await revokePermission(organization, remove, gate.page.id);
  else {
    const email = validEmail(form.get("email"));
    if (email === null) redirect("/sharing?error=email");
    await grantToMember(organization, gate.page.id, email, actor.email);
  }
  revalidatePath("/sharing");
}

export default async function PersonalAdmin({ viewer }: { viewer: Member }) {
  const organization = await currentOrganization();
  const pages = await visiblePagesFor(organization, viewer);
  const entries = await Promise.all(pages.map(async (page) => ({ page, permissions: await listPagePermissions(organization, page.id) })));
  const t = await serverTranslate();
  return <main className={PAGE}>
    <PageHeader title={t("admin.personal.title")} />
    <p className={`${SECTION_NOTE} mb-10`}>{t("admin.personal.intro")}</p>
    {entries.length === 0 ? <p className={SECTION_NOTE}>{t("admin.personal.empty")}</p> : null}
    {entries.map(({ page, permissions }) => <section className="mb-12" key={page.id}>
      <h2 className={SECTION_HEADING}><Link href={page.pageSlug.startsWith("internal/") ? `/internal/${page.pageSlug.slice(9)}` : `/history/${page.pageSlug}`}>{page.title}</Link></h2>
      <p className={SECTION_NOTE}>{t("admin.personal.note")}</p>
      <form action={updateInvitation} className="mb-4 flex flex-wrap items-center gap-2">
        <input type="hidden" name="page" value={page.pageSlug} />
        <label className="sr-only" htmlFor={`invite-${page.id}`}>{t("admin.personal.emailLabel")}</label>
        <input id={`invite-${page.id}`} type="email" name="email" required placeholder="name@example.com" className={`${FIELD} min-w-0 flex-1`} />
        <button className={PRIMARY} type="submit">{t("admin.personal.invite")}</button>
      </form>
      <ul className={LIST}>
        {permissions.filter((one) => one.granteeKind === "member").map((one) => <li key={one.id} className="flex items-center justify-between gap-4 py-3">
          <span className={ROW_TITLE}>{one.memberEmail}</span>
          <form action={updateInvitation}>
            <input type="hidden" name="page" value={page.pageSlug} />
            <input type="hidden" name="remove" value={one.id} />
            <button type="submit" className={DANGER}>{t("admin.personal.revoke")}</button>
          </form>
        </li>)}
      </ul>
    </section>)}
  </main>;
}
