import { FIRST_ORGANIZATION, firstOrganizationScope, type OrganizationScope } from "./scope";

/**
 * 組織の型。この設置は組織が 1 つだけ（src/lib/organization/scope.ts の FIRST_ORGANIZATION）なので、
 * 台帳の読み書きは持たない。役割は設置した本人が owner、招いた人が member（src/lib/organization/member-organization.ts）。
 */

/** 役割は 3 つだけ。DB の check と同じ並び。 */
export const ORGANIZATION_ROLES = ["owner", "admin", "member"] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export const ORGANIZATION_KINDS = ["team", "personal"] as const;
export type OrganizationKind = (typeof ORGANIZATION_KINDS)[number];

export { FIRST_ORGANIZATION };

/** 組織に属する表を組織ごとに片付ける口のための一覧（この設置では 1 つ）。 */
export async function everyOrganization(): Promise<OrganizationScope[]> {
  return [firstOrganizationScope()];
}
