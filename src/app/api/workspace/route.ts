import { currentBrowserIdentity } from "@/lib/identity/identity";
import { currentOrganization } from "@/lib/organization/scope";
import { openPage } from "@/lib/access/access";
import { getDb, orgDb } from "@/lib/db/database";
import { workspaceMutationSchema } from "@/lib/workspace/settings";
import { sameOriginRequest } from "@/lib/access/request-security";
import { jsonResponse, jsonError, serverError } from "@/lib/api";
import { routeLog } from "@/lib/logging/server-log";
import { rt } from "@/lib/i18n/request";
import { setBetaFeature } from "@/lib/settings/beta-features-store";
export async function POST(request: Request) {
  return routeLog("/api/workspace", request, async () => {
    const organization = await currentOrganization();
    const viewer = await currentBrowserIdentity();
    if (!viewer) return jsonError(rt("errors.request.loginRequired"), 401);
    if (!sameOriginRequest(request))
      return jsonError(rt("errors.request.useScreen"), 403);
    try {
      const raw = await request.text();
      if (raw.length > 2048) return jsonError(rt("errors.request.tooLarge"), 413);
      const parsed = workspaceMutationSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) return jsonError(rt("errors.request.checkInput"), 400);
      const input = parsed.data,
        email = viewer.email.toLowerCase();
      if (input.action === "appearance") {
        const result = await getDb()
          .from("workspace_preferences")
          .upsert(
            { owner_email: email, appearance: input.value },
            { onConflict: "owner_email" },
          );
        if (result.error) throw new Error("設定を保存できませんでした"); // i18n-keep: 内部の失敗（serverError が決まった 500 の文を返す）
      } else if (input.action === "locale") {
        // 「自動」は空として置く（ブラウザの言語に合わせる）
        const result = await getDb()
          .from("workspace_preferences")
          .upsert(
            { owner_email: email, locale: input.value === "auto" ? null : input.value },
            { onConflict: "owner_email" },
          );
        if (result.error) throw new Error("設定を保存できませんでした"); // i18n-keep: 内部の失敗（serverError が決まった 500 の文を返す）
      } else if (input.action === "beta") {
        // 誰の設定かは名乗りから採る（アドレスを受け取らない）
        await setBetaFeature(organization, email, input.feature, input.enabled);
      } else {
        const gate = await openPage(organization, viewer, input.page);
        if (!gate.ok) return jsonError(rt("errors.request.pageUnavailable"), 404);
        const result = input.selected
          ? await orgDb(gate.page.organization)
              .from("page_favorites")
              .upsert(
                { owner_email: email, page_id: gate.page.id },
                { onConflict: "organization_id,owner_email,page_id" },
              )
          : await orgDb(gate.page.organization)
              .from("page_favorites")
              .delete()
              .eq("owner_email", email)
              .eq("page_id", gate.page.id);
        if (result.error) throw new Error("お気に入りを保存できませんでした"); // i18n-keep: 内部の失敗（serverError が決まった 500 の文を返す）
      }
      return jsonResponse({ ok: true }, 200);
    } catch (error) {
      if (error instanceof SyntaxError)
        return jsonError(rt("errors.request.checkInput"), 400);
      return serverError(error);
    }
  });
}
