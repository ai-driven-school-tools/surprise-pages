import {createHash} from "node:crypto";
import {logEvent} from "../../logging/server-log";
import {put,get,head,list,del,BlobNotFoundError,createMultipartUploader} from "@vercel/blob";
import {assetKey,shelfOf} from "../../pages/assets";
import type {OrganizationScope} from "../../organization/scope";
import {pageRefOf} from "../../pages/store";
import {videoAssetPath,videoChunkKey,videoChunkSize,videoStagingPrefix,hasVideoSignature,DECK_VIDEO_STAGING_PREFIX,DECK_VIDEO_STALE_MS,type VideoUploadLease} from "./video-upload";
import { rt } from "../../i18n/request";

export async function readUploadBytes(request:Request,limit:number):Promise<Uint8Array> {
  if(Number(request.headers.get("content-length"))>limit)throw new RangeError(rt("deckEditor.upload.dataTooLarge"));
  if(!request.body)return new Uint8Array();
  const reader=request.body.getReader(),parts:Uint8Array[]=[];let size=0;
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit){await reader.cancel();throw new RangeError(rt("deckEditor.upload.dataTooLarge"));}parts.push(part.value);}
  return Buffer.concat(parts,size);
}
function assetKeyOf(organization:OrganizationScope,lease:VideoUploadLease):string {
  const ref=pageRefOf(lease.page);if(!ref)throw new Error("ページを確認できません"); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
  return assetKey(organization,ref.slugPrefix,[...ref.slug,...videoAssetPath(lease).split("/")]);
}
export class VideoUploadConflictError extends Error {}
export class VideoUploadFormatError extends RangeError {}
/** 組織は入口がページの門を通して決めたもの。一時データも素材も、その組織の置き場の頭の下に置く。 */
export async function storeVideoChunk(organization:OrganizationScope,lease:VideoUploadLease,index:number,hash:string,bytes:Uint8Array,signal:AbortSignal):Promise<void> {
  if(bytes.length!==videoChunkSize(lease,index)||createHash("sha256").update(bytes).digest("hex")!==hash)throw new RangeError(rt("deckEditor.upload.dataMismatch"));
  if(index===0&&!hasVideoSignature(bytes,lease.type))throw new VideoUploadFormatError(rt("deckEditor.upload.imageUnreadable"));
  try{await put(videoChunkKey(shelfOf(organization),lease,index),Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength),{access:"private",contentType:"application/octet-stream",addRandomSuffix:false,allowOverwrite:false,multipart:false,abortSignal:signal});}
  catch(error){
    const found=await get(videoChunkKey(shelfOf(organization),lease,index),{access:"private",useCache:false,abortSignal:signal});
    if(!found||found.statusCode!==200)throw error;
    const reader=found.stream.getReader(),check=createHash("sha256");let size=0;
    try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>bytes.length)throw new VideoUploadConflictError(rt("deckEditor.upload.contentChanged"));check.update(part.value);}}
    finally{await reader.cancel();}
    if(size!==bytes.length||check.digest("hex")!==hash)throw new VideoUploadConflictError(rt("deckEditor.upload.contentChanged"));
  }
}
async function completed(organization:OrganizationScope,lease:VideoUploadLease):Promise<boolean> {
  try{const found=await head(assetKeyOf(organization,lease));if(found.size!==lease.size||found.contentType!==lease.type)throw new Error("保存した動画を確認できません");return true;} // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
  catch(error){if(error instanceof BlobNotFoundError)return false;throw error;}
}
/** At most one staged chunk is read at a time, with backpressure. */
function videoStream(organization:OrganizationScope,lease:VideoUploadLease,hashes:readonly string[],signal:AbortSignal):ReadableStream<Uint8Array> {
  let index=0,reader:ReadableStreamDefaultReader<Uint8Array>|null=null,size=0,hasher=createHash("sha256"),prefix=new Uint8Array();
  return new ReadableStream<Uint8Array>({
    async pull(controller){
      try{
        if(signal.aborted)throw new DOMException("Aborted","AbortError");
        while(true){
        if(!reader){
          if(index===hashes.length){controller.close();return;}
          const result=await get(videoChunkKey(shelfOf(organization),lease,index),{access:"private",useCache:false,abortSignal:signal,headers:{"Accept-Encoding":"identity"}});
          if(!result||result.statusCode!==200)throw new Error("動画の一部が届いていません。再試行してください"); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
          reader=result.stream.getReader();size=0;hasher=createHash("sha256");prefix=new Uint8Array();
        }
        const part=await reader.read();
        if(part.done){
          if(size!==videoChunkSize(lease,index)||hasher.digest("hex")!==hashes[index])throw new Error("動画の一部を確認できません。再試行してください"); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
          if(index===0&&!hasVideoSignature(prefix,lease.type))throw new Error("動画の形式を確認できません"); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
          reader.releaseLock();reader=null;index++;continue;
        }
        size+=part.value.length;if(size>videoChunkSize(lease,index))throw new Error("動画の大きさが一致しません"); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
        hasher.update(part.value);
        if(index===0&&prefix.length<32)prefix=Buffer.concat([prefix,part.value.slice(0,32-prefix.length)]);
        controller.enqueue(part.value);return;
        }
      }catch(error){await reader?.cancel().catch(()=>{});controller.error(error);}
    },
    async cancel(){await reader?.cancel();},
  },{highWaterMark:1});
}
/** The SDK's automatic uploader may queue 128MB. Use one 8MB part at a time. */
async function assembleVideo(organization:OrganizationScope,lease:VideoUploadLease,hashes:readonly string[],signal:AbortSignal):Promise<void>{
  const upload=await createMultipartUploader(assetKeyOf(organization,lease),{access:"private",contentType:lease.type,addRandomSuffix:false,allowOverwrite:false,abortSignal:signal});
  const reader=videoStream(organization,lease,hashes,signal).getReader(),buffer=Buffer.allocUnsafe(Math.min(8*1024*1024,lease.size)),parts:{etag:string;partNumber:number}[]=[];let used=0;
  const send=async()=>{parts.push(await upload.uploadPart(parts.length+1,buffer.subarray(0,used)));used=0;};
  try{
    while(true){const part=await reader.read();if(part.done)break;let at=0;
      while(at<part.value.length){const size=Math.min(buffer.length-used,part.value.length-at);buffer.set(part.value.subarray(at,at+size),used);used+=size;at+=size;if(used===buffer.length)await send();}
    }
    if(used)await send();
    await upload.complete(parts);
  }finally{await reader.cancel();}
}
export async function finishVideoUpload(organization:OrganizationScope,lease:VideoUploadLease,hashes:readonly string[],signal:AbortSignal):Promise<string> {
  if(!await completed(organization,lease)){
    try{await assembleVideo(organization,lease,hashes,signal);}
    catch(error){if(!await completed(organization,lease))throw error;}
  }
  // Failure to remove temporary data is handled by the existing daily cleanup.
  try{await del(hashes.map((_,index)=>videoChunkKey(shelfOf(organization),lease,index)));}catch{logEvent({level:"warn",event:"deck-video.cleanup-deferred"});}
  return videoAssetPath(lease);
}
export async function cancelVideoUpload(organization:OrganizationScope,lease:VideoUploadLease):Promise<void> {
  const page=await list({prefix:videoStagingPrefix(shelfOf(organization),lease),limit:1000});
  if(page.blobs.length)await del(page.blobs.map(blob=>blob.pathname));
}
/**
 * 一時データの鍵の形。頭は組織の置き場（最初の組織は空・新しい組織は `o/<組織の目印>/`）。
 * 頭の無い今の鍵も、頭の付いた鍵も同じ形で拾う。
 */
const STAGED_CHUNK=/^(?:o\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/)?_deck-uploads\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]{36}\/\d{3}$/;
/** Service-only temporary uploads are never a page asset. Final/history media are never deleted here. 組織ごとに、その組織の置き場の下だけを片付ける。 */
export async function sweepVideoUploads(organization:OrganizationScope,now=Date.now()):Promise<number> {
  const prefix=`${shelfOf(organization)}${DECK_VIDEO_STAGING_PREFIX}`;
  let cursor:string|undefined,scanned=0,removed=0;
  do{
    const page=await list({prefix,limit:1000,cursor});scanned+=page.blobs.length;
    const stale=page.blobs.filter(blob=>blob.pathname.startsWith(prefix)&&STAGED_CHUNK.test(blob.pathname)&&blob.uploadedAt.getTime()<now-DECK_VIDEO_STALE_MS);
    if(stale.length){await del(stale.map(blob=>blob.pathname));removed+=stale.length;}
    cursor=page.hasMore?page.cursor:undefined;
  }while(cursor&&scanned<5000);
  return removed;
}
