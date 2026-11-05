import { after } from "next/server";

import { renderDiagrams } from "@/lib/first-paint/diagram-render";
import { diagramPrerenderOn } from "@/lib/first-paint/diagrams";
import {
  DIAGRAM_HTML_MAX,
  FAILURE_RETRY_MS,
  diagramPageId,
  keepDiagrams,
  readDiagramRenderRequest,
  recallDiagrams,
} from "@/lib/first-paint/diagram-prerender";
import { dropPageDelivery } from "@/lib/pages/cache";
import { inBackground, routeLog } from "@/lib/logging/server-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 応答を返したあとで、明暗の 2 回をブラウザで描く（src/lib/first-paint/diagram-render.ts の全体の上限 40 秒より長く）
export const maxDuration = 60;

/**
 * 図のページの図を、サーバーのブラウザで描いて控える口（src/lib/first-paint/diagram-prerender.ts）。
 *
 * 呼ぶのは本文の入口（/internal・/public）が控えに絵の無い版を配ったときだけ（`requestDiagramRender`）。
 * - 呼べるのは、このサーバーが署名した許可（本文の指紋と控えの鍵に結ぶ・1 分）を持つ要求だけ。違えば中身の無い 404（あることを教えない）
 * - 人の名乗りは見ない（人が押す口ではない）。鍵は版の目印で、描いた絵は同じ版を開いて見てよいと決まった人（canViewPage）にだけ配られる
 * - 答えは中身を持たない（もう控えにある・しばらく前に描けなかったなら 204・描き始めたら 202）。描くのは応答のあと
 * - 描けなかった版は「描けなかった」を控える（見るたびにブラウザを起こさない）
 */
function answer(status: 202 | 204 | 404): Response {
  return new Response(null, { status, headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  return routeLog("/api/pages/diagrams", request, async () => {
    if (!diagramPrerenderOn()) return answer(404);
    const length = Number(request.headers.get("content-length") ?? "0");
    if (!Number.isFinite(length) || length > DIAGRAM_HTML_MAX * 2) return answer(404);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return answer(404);
    }
    const asked = readDiagramRenderRequest(request.headers.get("authorization"), body);
    if (asked === null) return answer(404);
    const held = await recallDiagrams(asked.key, { fresh: true });
    if (held !== null && (!("failed" in held) || Date.now() - held.at < FAILURE_RETRY_MS)) return answer(204);
    after(inBackground("diagram-render", async () => {
      const drawn = await renderDiagrams(asked.html);
      await keepDiagrams(asked.key, drawn ?? { failed: true, at: Date.now() });
      // 公開のページは配信網が描く前の紙を 1 日持つので、描けたら 1 度だけ落とす（次の 1 人が描いた図つきで取り直す）
      const pageId = diagramPageId(asked.key);
      if (drawn !== null && pageId !== null) await dropPageDelivery(pageId);
    }));
    return answer(202);
  });
}
