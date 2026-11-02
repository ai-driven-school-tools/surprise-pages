import type { ReactNode } from "react";
import { currentOrganization } from "@/lib/organization/scope";
import { currentIdentity, isMember } from "@/lib/identity/identity";
import { readAppearance, workspaceAdmin } from "@/lib/workspace/workspace";
import { sidebarFavorites } from "@/lib/workspace/sidebar-favorites";
import { signOut } from "@/auth";
import { WorkspaceShell } from "./workspace-shell";
import { isPersonalEdition, siteName } from "@/lib/settings/site-settings";
export async function Workspace({ children }: { children: ReactNode }) {
  const organization = await currentOrganization();
  const viewer = await currentIdentity();
  if (!isMember(viewer)) return children;
  // 3 つは互いの答えを要らないので同時に取りに行く（往復は距離で決まる・check-roundtrips.mjs）
  const [admin, appearance, favorites] = await Promise.all([
    workspaceAdmin(organization, viewer),
    readAppearance(viewer.email),
    sidebarFavorites(organization, viewer),
  ]);
  return (
    <WorkspaceShell
      name={viewer.name ?? viewer.email.split("@")[0]}
      email={viewer.email}
      admin={admin}
      appearance={appearance}
      favorites={favorites}
      personal={isPersonalEdition()}
      siteName={siteName()}
      organizationLogo={null}
      logout={async () => {
        "use server";
        await signOut({ redirectTo: "/signin" });
      }}
    >
      {children}
    </WorkspaceShell>
  );
}
