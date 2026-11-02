import {jsonError,serverError} from "@/lib/api";
import {currentIdentity,isMember} from "@/lib/identity/identity";
import {findDeckImage,imageBytes, DeckImageNotFoundError } from "@/lib/deck/media/image-catalog";
import { routeLog } from "@/lib/logging/server-log";
import { currentOrganization } from "@/lib/organization/scope";
import { rt, requestTranslate } from "@/lib/i18n/request";
import { localizedMessage } from "@/lib/i18n/errors";

export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:Request):Promise<Response>{
 return routeLog("/api/pages/deck-edit/image-library/preview", request, async () => {
   const organization=await currentOrganization();
   const viewer=await currentIdentity();if(!isMember(viewer))return jsonError(rt("deckEditor.api.loginRequired"),401);
   try{
    const asset=await findDeckImage(organization,new URL(request.url).searchParams.get("id")??"");if(!asset)return jsonError(rt("deckEditor.api.imageNotFound"),404);
    const image=await imageBytes(organization,asset,viewer);return new Response(new Uint8Array(image.bytes),{headers:{"content-type":image.contentType,"cache-control":"private, no-store","x-content-type-options":"nosniff"}});
   }catch(error){if(error instanceof DeckImageNotFoundError)return jsonError(localizedMessage(error,requestTranslate()),404);return serverError(error);}
 });
}
