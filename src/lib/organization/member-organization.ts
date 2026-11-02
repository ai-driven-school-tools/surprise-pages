import { type OrganizationRole } from "./organizations";
import { type OrganizationScope } from "./scope";
import { emailKey } from "../identity/member-name";
import { isSiteOwner } from "../settings/site-settings";
import type { Member, Outsider } from "../identity/identity";

/**
 * 「この要求の組織でこの人は何者か」。この設置は組織が 1 つだけで、所属の名簿を持たない。
 * 設置した本人を持ち主（owner）、ほかの人を member として扱い、見てよいかは招待の名簿（restricted の許可）で決まる
 * （src/lib/access/rules.ts）。**可否はここで決めない。**
 */

/** 名乗りに付く所属（その組織での役割つき）。 */
export type MemberOrganization = OrganizationScope & { readonly role: OrganizationRole };

function roleIn(email: string): OrganizationRole {
  return isSiteOwner(email) ? "owner" : "member";
}

/** 自動参加のドメイン。この設置は持たない（空）。名簿に入れるアドレスの形は validEmail で見る。 */
export async function requestAutoJoinDomains(_organization: OrganizationScope): Promise<string[]> {
  return [];
}

/** その組織でのこの人の所属。 */
export async function memberOrganizationOf(organization: OrganizationScope, email: string): Promise<MemberOrganization | null> {
  return { ...organization, role: roleIn(email) };
}

/** Google で確かめたアドレスの人（名乗りの材料）。 */
export type SignedInPerson = { email: string; name: string | null; image: string | null };

/** ログインした人を組織の人（`Member`）にする。この設置に所属の無い人（`Outsider`）は居ない。 */
export async function placeInOrganization(organization: OrganizationScope, person: SignedInPerson): Promise<Member | Outsider> {
  return { kind: "member", ...person, organization: { ...organization, role: roleIn(person.email) } };
}

/** 記録に残っている人（背景の処理の持ち主・共同編集の保存者）。 */
export type RecordedPerson = { email: string; name: string | null };

/** 記録に残っている人を、いまの役割で名乗りにする。 */
export async function recordedMember(organization: OrganizationScope, person: RecordedPerson): Promise<Member | null> {
  return (await recordedMembers(organization, [person])).get(emailKey(person.email)) ?? null;
}

/** 記録に残っている何人かを名乗りにする。鍵はそろえたアドレス。 */
export async function recordedMembers(organization: OrganizationScope, people: readonly RecordedPerson[]): Promise<Map<string, Member>> {
  const members = new Map<string, Member>();
  for (const person of people) {
    members.set(emailKey(person.email), { kind: "member", email: person.email, name: person.name, image: null, organization: { ...organization, role: roleIn(person.email) } });
  }
  return members;
}
