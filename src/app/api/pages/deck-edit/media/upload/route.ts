import {mediaError} from "@/lib/deck/media/api";
import {z} from "zod";
import {get} from "@vercel/blob";
import {assetKey} from "@/lib/pages/assets";
import {uploadTypeSchema,isTimedMediaUploadType,isAudioUploadType} from "@/lib/deck/media/media";
import {saveOptimizedImage,DeckImageInputError} from "@/lib/deck/media/image-optimize";
import {jsonError,jsonResponse,serverError} from "@/lib/api";
import {currentIdentity,isMember} from "@/lib/identity/identity";
import {loadEditablePage} from "@/lib/access/page-edit-access";
import {pageRefOf} from "@/lib/pages/store";
import {issueVideoLease,readVideoLease} from "@/lib/deck/media/video-lease";
import {VideoUploadConflictError,VideoUploadFormatError,storeVideoChunk,readUploadBytes,finishVideoUpload,cancelVideoUpload} from "@/lib/deck/media/video-storage";
import {videoUploadFinishSchema,videoChunkCount,DECK_VIDEO_CHUNK_BYTES,DECK_VIDEO_LEASE_MS,DECK_VIDEO_MAX_BYTES,DECK_IMAGE_UPLOAD_MAX_BYTES} from "@/lib/deck/media/video-upload";
import {recordDeckImage} from "@/lib/deck/media/image-catalog";
import { routeLog } from "@/lib/logging/server-log";
import { currentOrganization } from "@/lib/organization/scope";
import { rt } from "@/lib/i18n/request";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=300;

const handle = (request: Request) => routeLog("/api/pages/deck-edit/media/upload", request, () => run(request));
async function run(request:Request):Promise<Response>{
  const organization=await currentOrganization();
  const viewer=await currentIdentity();if(!isMember(viewer))return jsonError(rt("deckEditor.api.loginRequired"),401);
  const params=new URL(request.url).searchParams,ref=pageRefOf(params.get("page"));
  if(!ref)return jsonError(rt("deckEditor.api.invalidPage"),400);
  try{
    const gate=await loadEditablePage(organization,viewer,ref.pageSlug);if(!gate.ok)return gate.response;
    if(request.method==="POST"){
      // 画像は 10MB まで（このあと軽量化する）、動画と音声は 100MB まで（変換せずにそのまま置く）
      const parsed=z.object({size:z.number().int().positive().max(DECK_VIDEO_MAX_BYTES),type:uploadTypeSchema}).strict().refine(value=>isTimedMediaUploadType(value.type)||value.size<=DECK_IMAGE_UPLOAD_MAX_BYTES).safeParse(JSON.parse(new TextDecoder().decode(await readUploadBytes(request,4096))));
      if(!parsed.success)return jsonError(rt("deckEditor.api.mediaLimits"),400);
      // 組織の素材の容量の上限。受け取りを始める前に、申告の大きさで確かめる
      const created=Date.now(),lease={version:1,id:crypto.randomUUID(),page:ref.pageSlug,owner:viewer.email,size:parsed.data.size,type:parsed.data.type,created,expires:created+DECK_VIDEO_LEASE_MS};
      const upload=issueVideoLease({...lease,version:1});
      return jsonResponse({upload,chunkBytes:DECK_VIDEO_CHUNK_BYTES},201);
    }
    const lease=readVideoLease(request.headers.get("x-deck-upload"));
    if(!lease||lease.page!==ref.pageSlug||lease.owner!==viewer.email)return mediaError("connection",rt("deckEditor.api.uploadExpiredResend"),403);
    if(request.method==="PUT"){
      const raw=params.get("chunk")??"",index=Number(raw),hash=params.get("hash")??"";
      if(!/^\d{1,3}$/.test(raw)||!Number.isInteger(index)||index<0||index>=videoChunkCount(lease)||! /^[a-f0-9]{64}$/.test(hash))return jsonError(rt("deckEditor.api.invalidRange"),400);
      await storeVideoChunk(gate.page.organization,lease,index,hash,await readUploadBytes(request,DECK_VIDEO_CHUNK_BYTES),request.signal);
      return jsonResponse({received:index},200);
    }
    if(request.method==="DELETE"){await cancelVideoUpload(gate.page.organization,lease);return jsonResponse({cancelled:true},200);}
    const parsed=videoUploadFinishSchema.safeParse(JSON.parse(new TextDecoder().decode(await readUploadBytes(request,16384))));
    if(!parsed.success||parsed.data.hashes.length!==videoChunkCount(lease))return jsonError(rt("deckEditor.api.partsMissing"),400);
    const src=await finishVideoUpload(gate.page.organization,lease,parsed.data.hashes,request.signal);
    // 動画と音声はサーバーで変換しない（変換の計算機は有料のため）。送られたファイルをそのまま置いて返す。
    // 静止画（poster）はブラウザが最初のコマから作り、画像として別に送る
    if(isTimedMediaUploadType(lease.type))return jsonResponse({src,bytes:lease.size,originalBytes:lease.size,kind:isAudioUploadType(lease.type)?"audio":"video"},201);
    {
      const stored=await get(assetKey(gate.page.organization,ref.slugPrefix,[...ref.slug,...src.split("/")]),{access:"private",useCache:false});
      if(!stored||stored.statusCode!==200)throw new Error("画像を読み直せませんでした。再試行してください"); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返す
      const input:RequestInit & {duplex:"half"}={method:"POST",body:stored.stream,duplex:"half"};
      const bytes=await readUploadBytes(new Request("https://local.invalid",input),10*1024*1024);
      const saved=await saveOptimizedImage(gate.page.organization,ref.pageSlug,bytes,lease.type);
      await recordDeckImage(gate.page,viewer.email,saved,"upload").catch(()=>undefined);
      return jsonResponse({...saved,originalSrc:src},201);
    }
  }catch(error){if(error instanceof VideoUploadFormatError)return mediaError("invalid-file",error.message,400);if(error instanceof DeckImageInputError)return mediaError("invalid-file",error.message,400);if(error instanceof VideoUploadConflictError)return mediaError("connection",error.message,409);if(error instanceof RangeError)return mediaError("size",error.message,413);if(error instanceof SyntaxError)return jsonError(rt("deckEditor.api.unreadableUpload"),400);return serverError(error);}
}
export const POST=handle;
export const PUT=handle;
export const PATCH=handle;
export const DELETE=handle;
