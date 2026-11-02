import sharp from "sharp";
import {createHash} from "node:crypto";
import {put,head} from "@vercel/blob";
import {assetKey} from "../../pages/assets";
import type {OrganizationScope} from "../../organization/scope";
import {pageRefOf} from "../../pages/store";
import {DECK_EDIT_IMAGE_MAX_BYTES,deckMediaAssetPath} from "../edit/assets";
import {MEDIA_EXTENSIONS,mediaTypeSchema} from "./media";
import { rt } from "../../i18n/request";
export class DeckImageInputError extends Error {}
export async function optimizeDeckImage(bytes:Uint8Array,type:string){
 try{
  if(!bytes.length||bytes.length>DECK_EDIT_IMAGE_MAX_BYTES)throw new RangeError(rt("deckEditor.upload.imageOver"));
  const parsed=mediaTypeSchema.parse(type);if(!parsed.startsWith("image/"))throw new Error("画像を選んでください"); // i18n-keep: 内部の失敗。窓口は固定の文（読み取れない画像）か 500 の文だけを返し、この文は画面に届かない
  const metadata=await sharp(bytes,{animated:true,limitInputPixels:80_000_000}).metadata();
  if(!metadata.width||!metadata.height)throw new Error("画像を読み取れません。別の画像を選んでください"); // i18n-keep: 内部の失敗。窓口は固定の文（読み取れない画像）か 500 の文だけを返し、この文は画面に届かない
  // Multi-frame images keep their animation; never silently flatten them.
  if((metadata.pages??1)>1)return {bytes,type:parsed,extension:MEDIA_EXTENSIONS[parsed],width:metadata.width,height:metadata.pageHeight??metadata.height,originalBytes:bytes.length};
  const optimized=await sharp(bytes,{limitInputPixels:80_000_000}).rotate().resize({width:2560,height:2560,fit:"inside",withoutEnlargement:true}).webp({quality:88,effort:4}).toBuffer({resolveWithObject:true});
  if(optimized.data.length>=bytes.length&&(!metadata.orientation||metadata.orientation===1))return {bytes,type:parsed,extension:MEDIA_EXTENSIONS[parsed],width:metadata.width,height:metadata.height,originalBytes:bytes.length};
  return {bytes:optimized.data,type:"image/webp",extension:"webp",width:optimized.info.width,height:optimized.info.height,originalBytes:bytes.length};
 }catch(error){if(error instanceof RangeError)throw error;throw new DeckImageInputError(rt("deckEditor.upload.imageResolution"));}
}
export async function saveOptimizedImage(organization:OrganizationScope,page:string,bytes:Uint8Array,type:string){
  const ref=pageRefOf(page);if(!ref)throw new Error("追加先が見つかりません"); // i18n-keep: 内部の失敗。窓口は固定の文（読み取れない画像）か 500 の文だけを返し、この文は画面に届かない
  const result=await optimizeDeckImage(bytes,type),src=deckMediaAssetPath(createHash("sha256").update(result.bytes).digest("hex"),result.extension);
  const key=assetKey(organization,ref.slugPrefix,[...ref.slug,...src.split("/")]);
  try{await put(key,Buffer.from(result.bytes),{access:"private",contentType:result.type,addRandomSuffix:false,allowOverwrite:false});}
  catch(error){const stored=await head(key);if(stored.size!==result.bytes.length||stored.contentType!==result.type)throw error;}
  return {src,contentType:result.type,intrinsicWidth:result.width,intrinsicHeight:result.height,originalBytes:result.originalBytes,bytes:result.bytes.length,optimized:result.bytes!==bytes};
}
