import { readFileSync } from "node:fs";
import path from "node:path";
import imageStamp from "@/widget/dist/page-images-stamp.json";
import { routeLog } from "@/lib/logging/server-log";
const source = readFileSync(path.join(process.cwd(), "src/widget/dist/page-images.js"), "utf8");
export async function GET(_request: Request, context: {params: Promise<{stamp?: string[]}>}) {
  return routeLog("/page-images.js/[[...stamp]]", _request, async () => {
    const {stamp} = await context.params;
    const current = stamp?.length === 1 && stamp[0] === imageStamp.stamp;
    return new Response(source, {headers: {"content-type": "text/javascript; charset=utf-8", "cache-control": current ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate", "x-content-type-options": "nosniff"}});
  });
}
