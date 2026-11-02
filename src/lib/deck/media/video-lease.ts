import {createHmac,timingSafeEqual} from "node:crypto";
import {DECK_VIDEO_LEASE_MS,videoUploadLeaseSchema,type VideoUploadLease} from "./video-upload";
function sign(body:string): Buffer {
  const secret=process.env["AUTH_SECRET"];
  if(!secret)throw new Error("動画の送信を準備できません"); // i18n-keep: サーバーの設定の不足。窓口は固定の 500 の文だけを返し、この文は画面に届かない
  return createHmac("sha256",secret).update("deck-video-upload-v1\0").update(body).digest();
}
export function issueVideoLease(lease:VideoUploadLease): string {
  const body=Buffer.from(JSON.stringify(videoUploadLeaseSchema.parse(lease))).toString("base64url");
  return `${body}.${sign(body).toString("base64url")}`;
}
export function readVideoLease(raw:string|null,now=Date.now()): VideoUploadLease|null {
  if(!raw||raw.length>4096)return null;
  const parts=raw.split(".");if(parts.length!==2||!/^[A-Za-z0-9_-]+$/.test(parts[0])||!/^[A-Za-z0-9_-]{43}$/.test(parts[1]))return null;
  try{
    const signature=Buffer.from(parts[1],"base64url"),expected=sign(parts[0]);
    if(signature.length!==expected.length||!timingSafeEqual(signature,expected))return null;
    const lease=videoUploadLeaseSchema.parse(JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8")));
    return lease.created<=now+30_000&&lease.expires>now&&lease.expires-lease.created<=DECK_VIDEO_LEASE_MS?lease:null;
  }catch{return null;}
}
