import {z} from "zod";
import {jsonError,jsonResponse,serverError} from "@/lib/api";
import {currentIdentity,isMember} from "@/lib/identity/identity";
import {loadEditablePage} from "@/lib/access/page-edit-access";
import {findDeckImage,listDeckImages,registerExistingDeckImage,reuseDeckImage,knownDeckImageSources,type DeckImageAsset, DeckImageNotFoundError } from "@/lib/deck/media/image-catalog";
import {readHeadOf} from "@/lib/pages/store";
import {prepareDeckEdit} from "@/lib/deck/edit/source";
import { routeLog } from "@/lib/logging/server-log";
import { currentOrganization } from "@/lib/organization/scope";
import { rt, requestTranslate } from "@/lib/i18n/request";
import { localizedMessage } from "@/lib/i18n/errors";

export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=60;
const reuseSchema=z.object({page:z.string().max(400),assetId:z.uuid()}).strict();
const view=(asset:DeckImageAsset)=>({id:asset.id,title:asset.title/* i18n-keep: 置くと原稿の代替テキストになる題名 */??"画像",width:asset.width,height:asset.height,source:asset.source_name,sourcePageUrl:asset.source_page_url,previewUrl:`/api/pages/deck-edit/image-library/preview?id=${encodeURIComponent(asset.id)}`});
export async function GET(request:Request):Promise<Response>{
 return routeLog("/api/pages/deck-edit/image-library", request, async () => {
   const organization=await currentOrganization();
   const viewer=await currentIdentity();if(!isMember(viewer))return jsonError(rt("deckEditor.api.loginRequired"),401);
   try{
    const page=new URL(request.url).searchParams.get("page")??"",gate=await loadEditablePage(organization,viewer,page);if(!gate.ok)return gate.response;
    let rows=await listDeckImages(viewer,gate.page);
    const head=await readHeadOf(gate.page);if(head){
     const nodes=prepareDeckEdit(head.html).nodes.filter(node=>node.tag==="img"&&node.src),known=await knownDeckImageSources(gate.page,nodes.flatMap(node=>node.src?[node.src]:[]));let missing=false;
     for(const node of nodes){if(!node.src||known.has(node.src))continue;missing=true;await registerExistingDeckImage(gate.page,gate.page.createdBy??viewer.email,node.src,node.alt??null).catch(()=>undefined);known.add(node.src);}
     if(missing)rows=await listDeckImages(viewer,gate.page);
    }
    return jsonResponse({current:rows.current.map(view),recent:rows.recent.map(view)},200);
   }catch(error){return serverError(error);}
 });
}
export async function POST(request:Request):Promise<Response>{
 return routeLog("/api/pages/deck-edit/image-library", request, async () => {
   const organization=await currentOrganization();
   const viewer=await currentIdentity();if(!isMember(viewer))return jsonError(rt("deckEditor.api.loginRequired"),401);
   try{
    const raw=await request.text();if(Buffer.byteLength(raw)>4096)return jsonError(rt("deckEditor.api.imageRequestTooLarge"),413);
    const input=reuseSchema.parse(JSON.parse(raw)),gate=await loadEditablePage(organization,viewer,input.page);if(!gate.ok)return gate.response;
    const asset=await findDeckImage(gate.page.organization,input.assetId);if(!asset)return jsonError(rt("deckEditor.api.imageNotFound"),404);
    return jsonResponse({kind:"image",...await reuseDeckImage(asset,viewer,gate.page)},201);
   }catch(error){if(error instanceof z.ZodError||error instanceof SyntaxError)return jsonError(rt("deckEditor.api.invalidImage"),400);if(error instanceof DeckImageNotFoundError)return jsonError(localizedMessage(error,requestTranslate()),404);return serverError(error);}
 });
}
