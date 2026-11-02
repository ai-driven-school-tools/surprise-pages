import { jsonError, jsonResponse, serverError } from "@/lib/api";
import { currentOrganization } from "@/lib/organization/scope";
import { rt } from "@/lib/i18n/request";
import { canUsePageTools, gateError, openToolsPage as openPage } from "@/lib/access/access";
import { currentIdentity } from "@/lib/identity/identity";
import { parsePageSlug, listComments } from "@/lib/comments/comments";
import {
  isVisibleOutcome,
  outcomesFromHtml,
  versionMarksMatch,
  withChangeAttribution,
  type OutcomeSource,
} from "@/lib/comments/outcome";
import { isVersionSha, listVersions, readFileAt } from "@/lib/revisions/revisions";
import type { OutcomesResponse } from "@/lib/comments/types";
import type { StoredPage } from "@/lib/pages/store";
import { routeLog } from "@/lib/logging/server-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * コメントが付いたときの文と、そのあと直された文。
 *
 * 読んでよい人の線引きはコメントの一覧とまったく同じ（openPage と canUsePageTools）。
 * 当時の本文を返すので、ここだけ緩いと、制限つきのページの中身が
 * 「いまの文」という形で名簿の外へ出る。
 *
 * 閉じたときは断らずに空を返す。記事だけを読んでいる人に、失敗の知らせを出す
 * 筋合いが無い（コメントの一覧と同じ）。
 */

function closed(): OutcomesResponse {
  return { outcomes: [] };
}

/**
 * 門を通ったページの本文だけを取りに行く。
 *
 * いまと同じ版に付いたコメントは本文を要らない（same と決まっている）。
 * 当時の版といまの版だけを、まとめて取り寄せる。
 */
async function htmlForOutcomes(
  page: StoredPage,
  comments: readonly OutcomeSource[],
  toVersion: string,
): Promise<Map<string, string>> {
  const wanted = new Set<string>();
  wanted.add(toVersion);
  for (const comment of comments) {
    if (comment.parentId !== null) continue;
    if (comment.quote === null || comment.quote.length === 0) continue;
    if (comment.pageVersion === null) continue;
    if (versionMarksMatch(comment.pageVersion, toVersion)) continue;
    wanted.add(comment.pageVersion);
  }

  const htmlAt = new Map<string, string>();
  await Promise.all(
    [...wanted].map(async (version) => {
      const html = await readFileAt(page, version);
      if (html !== null) htmlAt.set(version, html);
    }),
  );
  return htmlAt;
}

export async function GET(request: Request): Promise<Response> {
  return routeLog("/api/comments/outcomes", request, async () => {
    const organization = await currentOrganization();
    const url = new URL(request.url);
    const page = parsePageSlug(url.searchParams.get("page"));
    if (page === null) return jsonError(rt("toolbox.server.badPage"), 400);

    const viewer = await currentIdentity();
    if (!canUsePageTools(viewer)) return jsonResponse(closed(), 200);

    const toParam = url.searchParams.get("to");
    if (toParam !== null && !isVersionSha(toParam)) {
      return jsonError(rt("toolbox.server.badVersion"), 400);
    }

    try {
      const gate = await openPage(organization, viewer, page.slug);
      if (!gate.ok) return gateError(gate.reason);

      const toVersion = toParam ?? gate.page.currentVersionId;
      if (toVersion === null) {
        const payload: OutcomesResponse = { outcomes: [] };
        return jsonResponse(payload, 200);
      }

      const comments = await listComments(organization, page.slug, viewer);
      const htmlAt = await htmlForOutcomes(gate.page, comments, toVersion);
      const raw = outcomesFromHtml({ comments, toVersion, htmlAt });
      if (!raw.some((outcome) => isVisibleOutcome(outcome.state))) {
        const payload: OutcomesResponse = { outcomes: raw };
        return jsonResponse(payload, 200);
      }

      const versionPage = await listVersions(gate.page, 99);
      const outcomes = await withChangeAttribution({
        outcomes: raw,
        comments,
        versions: versionPage.versions,
        toVersion,
        htmlAt,
        readHtml: (sha) => readFileAt(gate.page, sha),
      });
      const payload: OutcomesResponse = { outcomes };
      return jsonResponse(payload, 200);
    } catch (error) {
      return serverError(error);
    }
  });
}
