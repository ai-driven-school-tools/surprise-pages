import { servePrivatePage } from "@/lib/pages/private-page";
import { routeLog } from "@/lib/logging/server-log";
import { rt } from "@/lib/i18n/request";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ visibility: string; slug: string[] }> }) {
  return routeLog("/history/[visibility]/[...slug]", request, async () => {
    const { visibility, slug } = await context.params;
    if (visibility !== "public" && visibility !== "internal") return new Response(rt("errors.delivery.pageMissingShort"), { status: 404 });
    return servePrivatePage(request, { params: Promise.resolve({ slug, shelf: visibility }) });
  });
}

export async function HEAD(request: Request, context: { params: Promise<{ visibility: string; slug: string[] }> }) {
  return routeLog("/history/[visibility]/[...slug]", request, async () => {
    const response = await GET(request, context);
    await response.body?.cancel();
    return new Response(null, { status: response.status, headers: response.headers });
  });
}
