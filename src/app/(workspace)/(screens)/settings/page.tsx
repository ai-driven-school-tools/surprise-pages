import { redirect } from "next/navigation";
import { currentOrganization } from "@/lib/organization/scope";
import { currentIdentity, isMember } from "@/lib/identity/identity";
import { readAppearance, readLocaleSetting } from "@/lib/workspace/workspace";
import { readBetaFeatures } from "@/lib/settings/beta-features-store";
import { BETA_FEATURE_IDS } from "@/lib/settings/beta-features";
import { viewOptedOut, VIEW_RETENTION_DAYS } from "@/lib/pages/views";
import { SettingsScreen } from "@/app/settings/settings-screen";
import { ViewedPages } from "@/app/activity/viewed-pages";
import { siteUsageFor } from "@/lib/workspace/usage";
export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  const organization = await currentOrganization();
  const viewer = await currentIdentity();
  if (!isMember(viewer)) redirect("/signin");
  const [appearance, locale, beta, optedOut, usage] = await Promise.all([
    readAppearance(viewer.email),
    readLocaleSetting(viewer.email),
    readBetaFeatures(organization, viewer.email),
    viewOptedOut(organization, viewer),
    siteUsageFor(viewer.email),
  ]);
  const offered = [...BETA_FEATURE_IDS];
  return (
    <SettingsScreen
      name={viewer.name ?? viewer.email.split("@")[0]}
      email={viewer.email}
      appearance={appearance}
      locale={locale}
      beta={beta}
      offered={offered}
      usage={usage}
      retentionDays={VIEW_RETENTION_DAYS}
    >
      <ViewedPages server={[]} optedOut={optedOut} retentionDays={VIEW_RETENTION_DAYS} settingsOnly />
    </SettingsScreen>
  );
}
