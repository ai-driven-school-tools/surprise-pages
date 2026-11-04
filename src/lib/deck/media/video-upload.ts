import {uploadTypeSchema,UPLOAD_EXTENSIONS} from "./media";
import { deckMediaAssetPath } from "../edit/assets";
import { z } from "zod";

/** Keep every browser request below the hosting platform's request-body ceiling. */
export const DECK_VIDEO_CHUNK_BYTES = 2 * 1024 * 1024;
export const DECK_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
/** 画像として送れる大きさの上限（画像はこのあとサーバーで軽量化する）。 */
export const DECK_IMAGE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const DECK_VIDEO_STAGING_PREFIX = "_deck-uploads/";
export const DECK_VIDEO_LEASE_MS = 2 * 60 * 60 * 1000;
export const DECK_VIDEO_STALE_MS = 24 * 60 * 60 * 1000;
export const videoUploadLeaseSchema = z.object({version:z.literal(1),id:z.uuid(),page:z.string().min(1).max(1000),owner:z.string().min(1).max(320),size:z.number().int().positive().max(DECK_VIDEO_MAX_BYTES),type:uploadTypeSchema,created:z.number().int().positive(),expires:z.number().int().positive()}).strict();
export type VideoUploadLease = z.infer<typeof videoUploadLeaseSchema>;
export const videoUploadFinishSchema = z.object({hashes:z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(Math.ceil(DECK_VIDEO_MAX_BYTES/DECK_VIDEO_CHUNK_BYTES))}).strict();
export function videoChunkCount(lease: Pick<VideoUploadLease,"size">): number {return Math.ceil(lease.size/DECK_VIDEO_CHUNK_BYTES);}
export function videoChunkSize(lease: Pick<VideoUploadLease,"size">,index:number): number {return Math.min(DECK_VIDEO_CHUNK_BYTES,lease.size-index*DECK_VIDEO_CHUNK_BYTES);}
/**
 * 一時データの置き場。`shelf` は組織の置き場の頭（src/lib/pages/assets.ts の `shelfOf`・最初の組織は空）。
 * このファイルはブラウザの道具箱も読むので、素材の口（src/lib/pages/assets.ts）は読み込まず、頭は呼ぶ側から受け取る。
 */
export function videoStagingPrefix(shelf: string, lease: VideoUploadLease): string {return `${shelf}${DECK_VIDEO_STAGING_PREFIX}${new Date(lease.created).toISOString().slice(0,10)}/${lease.id}/`;}
export function videoChunkKey(shelf:string,lease:VideoUploadLease,index:number): string {return `${videoStagingPrefix(shelf,lease)}${String(index).padStart(3,"0")}`;}
export function videoAssetPath(lease:VideoUploadLease): string {return deckMediaAssetPath(lease.id,UPLOAD_EXTENSIONS[lease.type]);}
/** Check the container, not merely an extension supplied by the browser. */
export function hasVideoSignature(bytes: Uint8Array,type:VideoUploadLease["type"]): boolean {
  const text=String.fromCharCode(...bytes.slice(0,32));
  if(type==="video/webm")return bytes.length>=4&&bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3;
  if(type==="video/mp4")return bytes.length>=16&&text.slice(4,8)==="ftyp";
  if(type==="image/png")return bytes[0]===137&&text.slice(1,4)==="PNG";
  if(type==="image/jpeg")return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(type==="image/gif")return text.startsWith("GIF87a")||text.startsWith("GIF89a");
  if(type==="image/webp")return text.startsWith("RIFF")&&text.slice(8,12)==="WEBP";
  return text.slice(4,8)==="ftyp"&&/avif|avis/.test(text.slice(8));
}
