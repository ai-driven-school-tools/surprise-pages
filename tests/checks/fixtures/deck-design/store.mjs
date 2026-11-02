// In-memory transport only. The real revision/save implementations run above it.
/** 最初の組織（最初の組織）。組織で絞った口（orgDb）も同じ偽の保存先へつなぐ（絞りそのものは check-tenant-scope.mjs が見る）。 */
export const SURPRISE = Object.freeze({ id: "00000000-0000-4000-8000-000000000001", assetPrefix: "" });
export const orgDb = () => getDb();
export function getDb() {
  return { rpc(name, params) {
    const state = globalThis.__deckStore;
    // 要求ごとの所属の読み。この入れ物の人は全員 最初の組織 の所属で、管理者の名簿（admins）にいる人は admin
    if (name === "org_member_identity") return Promise.resolve({data:{role:(state.admins ?? []).some(row=>row.email===params.p_email)?"admin":"member",joined:false},error:null});
    // 組織の素材の容量を足す。この入れ物は数を持たない
    if (name === "org_add_usage") return Promise.resolve({data:[{org_add_usage:null}],error:null});
    if (name !== "org_page_access_facts") throw new Error(`Unexpected function ${name}`);
    return Promise.resolve({data:{is_admin:(state.admins ?? []).some(row=>row.email===params.p_email),is_granted:(state.permissions ?? []).some(row=>row.page_id===params.p_page_id && row.member_email===params.p_email)},error:null});
  }, from(table) {
    let op = "read", payload = null;
    const filters = {};
    const query = {
      select() { return query; }, eq(key, value) { filters[key] = value; return query; },
      is(key, value) { filters[key] = value; return query; }, order() { return query; }, limit() { return query; },
      insert(value) { op = "insert"; payload = value; return query; },
      update(value) { op = "update"; payload = value; return query; },
      async maybeSingle() { return resolve(); }, async single() { return resolve(); },
      then(yes, no) { return Promise.resolve(resolve()).then(yes, no); },
    };
    function resolve() {
      const state = globalThis.__deckStore;
      if (table === "pages") {
        if (op === "update") Object.assign(state.page, payload);
        return { data: Object.entries(filters).every(([key,value])=>state.page[key]===value) ? state.page : null, error: null };
      }
      if (table === "admins" || table === "page_permissions") {
        const rows = table === "admins" ? state.admins ?? [] : state.permissions ?? [];
        return {data:rows.find(row=>Object.entries(filters).every(([key,value])=>row[key]===value)) ?? null,error:null};
      }
      // 組織の段と使用量。この入れ物の組織は最初の組織（段 standard・上限なし）で、使用量の行は無い
      if (table === "organizations") return { data: { plan: "standard", limits_override: null }, error: null };
      if (table === "organization_usage") return { data: [], error: null };
      if (table !== "page_revisions") throw new Error(`Unexpected table ${table}`);
      if (op === "insert") {
        if (state.race) return { data: null, error: { code: "23505" } };
        state.revisions.push(payload);
        return { data: payload, error: null };
      }
      const rows = state.revisions.filter((row) => !filters.version_id || row.version_id === filters.version_id);
      return { data: rows.at(-1) ?? null, error: null };
    }
    return query;
  } };
}
export const warmPageHtml = async (_id, _version, html) => { globalThis.__deckStore.warm = html; };
export const dropPageDelivery = async () => {};
export const expirePageAssets = async () => {};
/** 名乗りの差し替え。管理者かは所属の役割で決まるので、この入れ物の管理者の名簿（admins）を役割に写す。 */
export const withOrganization = (viewer) => viewer?.kind !== "member" || viewer.organization ? viewer ?? null
  : { ...viewer, organization: { id: "00000000-0000-4000-8000-000000000001", assetPrefix: "", role: (globalThis.__deckStore?.admins ?? []).some((row) => row.email === viewer.email) ? "admin" : "member" } };
export const currentIdentity = async () => withOrganization(globalThis.__deckViewer);
/** 記録の人をいまの所属で名乗りにする（この入れ物の人は全員 最初の組織 の所属・管理者の名簿の人は admin）。 */
export const stillMember = async (_organization, person) => withOrganization({ kind: "member", email: person.email, name: person.name ?? null, image: null, desktop: false });
export const stillMembers = async (organization, people) => new Map(await Promise.all(people.map(async (person) => [person.email.trim().toLowerCase(), await stillMember(organization, person)])));
export const isMember = (value) => value?.kind === "member";
export const isMemberOf = (value, organization) => value?.kind === "member" && value.organization?.id === organization?.id;
export const openPage = async () => ({ ok: true, page: {
  title: globalThis.__deckStore.page.title,
  id: "page", organization: SURPRISE, pageSlug: "internal/example/design", slug: "internal/example/design", visibility: "internal", createdBy: "owner@example.test",
  currentVersionId: globalThis.__deckStore.revisions.at(-1)?.version_id ?? null,
} });
export const isAdmin = async () => false;
export const hasOwnerGrant = async () => false;
export const canEditPage = (viewer) => viewer.email === "owner@example.test";
export const ALLOWED_DOMAIN = "example.test";
export const auth = async () => null;
export const cookies = async () => ({ get: () => undefined });
export const headers = async () => ({ get: () => null });
export const parsePageSlug = (value) => typeof value === "string" && /^(internal|public)\/[a-z0-9/-]+$/.test(value)
  ? { slug: value, slugPrefix: value.split("/")[0], visibility: value.split("/")[0], parts: value.split("/").slice(1) } : null;
export async function put(path, stream, options) {
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  globalThis.__deckAssets ??= new Map();
  globalThis.__deckAssets.set(path, { bytes, options });
  return { pathname: path };
}
export const get = async () => null;
export class BlobNotFoundError extends Error {}
export const head = async () => { throw new BlobNotFoundError(); };
export const list = async () => ({ blobs: [], hasMore: false });
