import {readFile} from "node:fs/promises";
import path from "node:path";
import fonts from "../../../../../vendor/deck-fonts/manifest.json";
import { routeLog } from "@/lib/logging/server-log";
export const runtime = "nodejs";
/** Only the licensed, content-addressed font files in the manifest are public. */
export async function GET(_request: Request, context: {params:Promise<{file:string}>}): Promise<Response> {
  return routeLog("/vendor/deck-fonts/[file]", _request, async () => {
    const {file}=await context.params;
    if(!fonts.some(font=>font.file===file))return new Response(null,{status:404,headers:{"cache-control":"no-store"}});
    try{
      const bytes=await readFile(path.join(process.cwd(),"vendor","deck-fonts",file));
      return new Response(bytes,{headers:{"content-type":"font/woff2","cache-control":"public, max-age=31536000, immutable","access-control-allow-origin":"*","x-content-type-options":"nosniff"}});
    }catch{return new Response(null,{status:404,headers:{"cache-control":"no-store"}});}
  });
}
