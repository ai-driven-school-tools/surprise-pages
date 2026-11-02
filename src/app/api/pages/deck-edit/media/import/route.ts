import {mediaError} from "@/lib/deck/media/api";
import {readUploadBytes} from "@/lib/deck/media/video-storage";
import {z} from "zod";
import {currentIdentity,isMember} from "@/lib/identity/identity";
import {loadEditablePage} from "@/lib/access/page-edit-access";
import {jsonError,jsonResponse,serverError} from "@/lib/api";
import {downloadRemoteMedia,DeckRemoteMediaError} from "@/lib/deck/media/remote-media";
import {saveOptimizedImage,DeckImageInputError} from "@/lib/deck/media/image-optimize";
import {recordDeckImage} from "@/lib/deck/media/image-catalog";
import { routeLog } from "@/lib/logging/server-log";
import { currentOrganization } from "@/lib/organization/scope";
import { rt } from "@/lib/i18n/request";
export const runtime="nodejs";
export const maxDuration=300;
export async function POST(request:Request){
 return routeLog("/api/pages/deck-edit/media/import", request, async () => {
   const organization=await currentOrganization();
   const viewer=await currentIdentity();if(!isMember(viewer))return jsonError(rt("deckEditor.api.loginRequired"),401);
   try{
    const body=z.object({page:z.string().max(400),url:z.string().url().max(4096)}).strict().parse(JSON.parse(new TextDecoder().decode(await readUploadBytes(request,16384))));
    const gate=await loadEditablePage(organization,viewer,body.page);if(!gate.ok)return gate.response;
    const downloaded=await downloadRemoteMedia(body.url);
    try{
     const saved=await saveOptimizedImage(gate.page.organization,body.page,await downloaded.readImage(),downloaded.type);
     await recordDeckImage(gate.page,viewer.email,saved,"url",{sourcePageUrl:body.url,title:"リンクから追加"}).catch(()=>undefined); // i18n-keep: 保存する画像の題名（置くと原稿の代替テキストになる）
     return jsonResponse({kind:"image",...saved},201);
    }finally{await downloaded.dispose();}
   }catch(error){if(error instanceof z.ZodError)return jsonError(rt("deckEditor.api.enterLink"),400);if(error instanceof DeckRemoteMediaError)return mediaError("remote",error.message,400);if(error instanceof DeckImageInputError)return mediaError("invalid-file",error.message,400);if(error instanceof RangeError)return mediaError("size",error.message,413);return serverError(error);}
 });
}
