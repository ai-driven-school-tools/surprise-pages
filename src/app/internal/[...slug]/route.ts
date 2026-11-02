import { servePrivatePage } from "@/lib/pages/private-page";
import { routeLog } from "@/lib/logging/server-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ slug: string[] }> }) {
  return routeLog("/internal/[...slug]", request, async () => {
    return servePrivatePage(request, context);
  });
}

/** HEAD shares every view gate with GET, but media metadata never opens its body. */
export async function HEAD(request: Request, context: { params: Promise<{ slug: string[] }> }): Promise<Response> {
  return routeLog("/internal/[...slug]", request, async () => {
    const response = await GET(request, context);
    await response.body?.cancel();
    return new Response(null, { status: response.status, headers: response.headers });
  });
}
