import {createHash} from "node:crypto";
import {z} from "zod";
import {getDb,orgDb} from "../../db/database";
import type {OrganizationScope} from "../../organization/scope";
import {openPage} from "../../access/access";
import {readAsset} from "../../pages/assets";
import {imageDimensions} from "../../html/image-dimensions";
import {saveOptimizedImage} from "./image-optimize";
import {pageRefOf,type StoredPage} from "../../pages/store";
import type {Member} from "../../identity/identity";
import { LocalizedError } from "../../i18n/errors";

const rowSchema=z.object({id:z.uuid(),page_id:z.uuid(),page_slug:z.string(),owner_email:z.email(),src:z.string(),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),content_type:z.string().startsWith("image/"),bytes:z.coerce.number().int().positive(),width:z.number().int().positive(),height:z.number().int().positive(),origin:z.enum(["upload","url","search","reuse","existing"]),source_page_url:z.string().nullable(),source_name:z.string().nullable(),title:z.string().nullable(),parent_id:z.string().uuid().nullable(),created_at:z.string(),last_used_at:z.string()});
/** 見られない・無い画像（窓口は 404）。文の字面ではなく型で見分ける。 */
export class DeckImageNotFoundError extends LocalizedError {}
export type DeckImageAsset=z.infer<typeof rowSchema>;
export type ImageOrigin=DeckImageAsset["origin"];
export type SavedImage={src:string;contentType:string;intrinsicWidth:number;intrinsicHeight:number;bytes:number};
export type ImageSource={sourcePageUrl?:string|null;sourceName?:string|null;title?:string|null;parentId?:string|null};

function stableId(pageId:string,src:string):string{
 const bytes=createHash("sha256").update("deck-image-asset-v1\0").update(pageId).update("\0").update(src).digest().subarray(0,16);
 bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;const value=bytes.toString("hex");
 return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;
}
function fingerprint(src:string):string{return /media-([a-f0-9]{64})\./.exec(src)?.[1]??createHash("sha256").update(src).digest("hex");}
export async function recordDeckImage(page:StoredPage,owner:string,image:SavedImage,origin:ImageOrigin,source:ImageSource={}):Promise<DeckImageAsset>{
 const now=new Date().toISOString(),value={id:stableId(page.id,image.src),page_id:page.id,page_slug:page.pageSlug,owner_email:owner.toLowerCase(),src:image.src,fingerprint:fingerprint(image.src),content_type:image.contentType,bytes:image.bytes,width:image.intrinsicWidth,height:image.intrinsicHeight,origin,source_page_url:source.sourcePageUrl??null,source_name:source.sourceName??null,title:source.title??null,parent_id:source.parentId??null,last_used_at:now};
 const saved=await getDb().rpc("record_deck_image",{p_row:value});
 if(saved.error||!Array.isArray(saved.data)||!saved.data[0])throw new Error("画像の索引を保存できませんでした");return rowSchema.parse(saved.data[0]); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
}
export async function knownDeckImageSources(page:StoredPage,sources:string[]):Promise<Set<string>>{
 const known=new Set<string>();
 for(let at=0;at<sources.length;at+=100){const result=await orgDb(page.organization).from("deck_image_assets").select("src").eq("page_id",page.id).in("src",sources.slice(at,at+100));if(result.error)throw new Error("画像の索引を読み取れませんでした");for(const row of z.array(z.object({src:z.string()})).parse(result.data))known.add(row.src);} // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
 return known;
}
export async function findDeckImage(organization:OrganizationScope,id:string):Promise<DeckImageAsset|null>{
 const result=await orgDb(organization).from("deck_image_assets").select("*").eq("id",id).maybeSingle();if(result.error)throw new Error("画像の索引を読み取れませんでした");return result.data?rowSchema.parse(result.data):null; // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
}
export async function listDeckImages(viewer:Member,page:StoredPage,limit=40):Promise<{current:DeckImageAsset[];recent:DeckImageAsset[]}>{
 const db=orgDb(page.organization);
 const [currentRows,recentRows]=await Promise.all([
  db.from("deck_image_assets").select("*").eq("page_id",page.id).order("last_used_at",{ascending:false}).limit(limit),
  db.from("deck_image_uses").select("asset_id").eq("owner_email",viewer.email.toLowerCase()).order("last_used_at",{ascending:false}).limit(limit*3)
 ]);
 if(currentRows.error||recentRows.error)throw new Error("最近の画像を読み取れませんでした"); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
 const usage=z.array(z.object({asset_id:z.uuid()})).parse(recentRows.data);
 const lookup=usage.length?await db.from("deck_image_assets").select("*").in("id",usage.map(row=>row.asset_id)):{data:[],error:null};
 if(lookup.error)throw new Error("最近の画像を読み取れませんでした"); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
 const found=z.array(rowSchema).parse(lookup.data),current=z.array(rowSchema).parse(currentRows.data),candidates=usage.flatMap(use=>{const row=found.find(item=>item.id===use.asset_id);return row&&row.page_id!==page.id?[row]:[];}),recent:DeckImageAsset[]=[];
 const access=new Map<string,boolean>();
 for(const row of candidates){
  let allowed=access.get(row.page_slug);if(allowed===undefined){allowed=(await openPage(page.organization,viewer,row.page_slug)).ok;access.set(row.page_slug,allowed);}
  if(allowed)recent.push(row);if(recent.length>=limit)break;
 }
 return {current,recent};
}
export async function imageBytes(organization:OrganizationScope,asset:DeckImageAsset,viewer:Member):Promise<{bytes:Buffer;contentType:string}>{
 const gate=await openPage(organization,viewer,asset.page_slug);if(!gate.ok)throw new DeckImageNotFoundError("deckEditor.api.imageNotFound");
 const ref=pageRefOf(asset.page_slug);if(!ref)throw new DeckImageNotFoundError("deckEditor.api.imageNotFound");
 const hit=await readAsset(organization,ref.slugPrefix,[...ref.slug,...asset.src.split("/")]);if(!hit||hit.size>10*1024*1024)throw new Error("その画像を読み取れませんでした"); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
 const stream=await hit.open(null,new AbortController().signal),reader=stream.getReader(),chunks:Uint8Array[]=[];let length=0;
 try{for(;;){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>10*1024*1024)throw new Error("画像は10MBまでです");chunks.push(next.value);}}finally{await reader.cancel();} // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
 return {bytes:Buffer.concat(chunks),contentType:hit.contentType};
}
export async function reuseDeckImage(asset:DeckImageAsset,viewer:Member,target:StoredPage){
 const input=await imageBytes(target.organization,asset,viewer),saved=await saveOptimizedImage(target.organization,target.pageSlug,input.bytes,input.contentType);
 const recorded=await recordDeckImage(target,viewer.email,saved,"reuse",{sourcePageUrl:asset.source_page_url,sourceName:asset.source_name,title:asset.title,parentId:asset.id}).catch(()=>null);
 return {...saved,catalogId:recorded?.id,title:asset.title??"画像"}; // i18n-keep: 再利用する画像の既定の題名。置くと原稿の代替テキストになる
}
export async function registerExistingDeckImage(page:StoredPage,owner:string,src:string,title:string|null):Promise<void>{
 const ref=pageRefOf(page.pageSlug);if(!ref)return;const hit=await readAsset(page.organization,ref.slugPrefix,[...ref.slug,...src.split("/")]);if(!hit||hit.size>10*1024*1024)return;
 const stream=await hit.open(null,new AbortController().signal),reader=stream.getReader(),chunks:Uint8Array[]=[];let length=0;
 try{for(;;){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>10*1024*1024)return;chunks.push(next.value);}}finally{await reader.cancel();}
 const bytes=Buffer.concat(chunks),size=imageDimensions(bytes,hit.contentType);if(!size)return;
 await recordDeckImage(page,owner,{src,contentType:hit.contentType,intrinsicWidth:size.width,intrinsicHeight:size.height,bytes:length},"existing",{title});
}
