import {MediaFailure,MEDIA_FAILURE_CODES} from "../../../lib/deck/media/failure";
import {uploadFileType} from "../../../lib/deck/media/media";
import {z} from "zod";
import {DECK_VIDEO_CHUNK_BYTES} from "../../../lib/deck/media/video-upload";
import { t } from "../../shared/i18n";

function aborted(signal:AbortSignal){if(signal.aborted)throw new DOMException(t("deckEditor.videoUpload.aborted"),"AbortError");}
class UploadFailure extends MediaFailure {constructor(message:string,readonly retryable:boolean,code:import("../../../lib/deck/media/failure").MediaFailureCode){super(code,message);}}
async function delay(ms:number,signal:AbortSignal):Promise<void>{
  aborted(signal);await new Promise<void>((resolve,reject)=>{const cancel=()=>{clearTimeout(timer);reject(new DOMException(t("deckEditor.videoUpload.aborted"),"AbortError"));};const timer=setTimeout(()=>{signal.removeEventListener("abort",cancel);resolve();},ms);signal.addEventListener("abort",cancel,{once:true});});
}
async function send(url:string,options:RequestInit,signal:AbortSignal):Promise<unknown>{
  for(let attempt=0;;attempt++){
    aborted(signal);
    try{
      const response=await fetch(url,{...options,credentials:"same-origin",signal});
      const json:unknown=await response.json();
      if(!response.ok){const parsed=z.object({error:z.string().optional(),message:z.string().optional(),code:z.enum(MEDIA_FAILURE_CODES).optional()}).safeParse(json);throw new UploadFailure(parsed.success?(parsed.data.error??parsed.data.message??t("deckEditor.videoUpload.sendFailed")) : t("deckEditor.videoUpload.sendFailed"),response.status===429||response.status>=500,parsed.success&&parsed.data.code?parsed.data.code:response.status===401?"auth":response.status===403||response.status===404?"permission":response.status===413?"size":response.status>=500||response.status===429?"connection":"unknown");}
      return json;
    }catch(error){aborted(signal);if(attempt>=2||(error instanceof UploadFailure&&!error.retryable))throw error instanceof UploadFailure?error:new MediaFailure("connection",t("deckEditor.videoUpload.connection"));await delay(500*2**attempt,signal);}
  }
}
/** Two small requests at most are in flight. A failed part is retried independently. */
export async function uploadMediaFile(input:{file:File;page:string;signal:AbortSignal;progress:(done:number,total:number)=>void}){
  const {file,page,signal:outerSignal}=input,type=uploadFileType(file),base=`/api/pages/deck-edit/media/upload?page=${encodeURIComponent(page)}`;
  if(!type)throw new MediaFailure("format",t("deckEditor.videoUpload.chooseMedia"));
  const start=z.object({upload:z.string(),chunkBytes:z.literal(DECK_VIDEO_CHUNK_BYTES)}).parse(await send(base,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({size:file.size,type})},outerSignal));
  const transfer=new AbortController(),abort=()=>transfer.abort();outerSignal.addEventListener("abort",abort,{once:true});if(outerSignal.aborted)abort();const signal=transfer.signal;
  let failure:unknown=null;
  const headers={"x-deck-upload":start.upload},hashes:string[]=new Array(Math.ceil(file.size/start.chunkBytes));let next=0,done=0;
  try{
    const worker=async()=>{while(next<hashes.length){const index=next++;aborted(signal);const chunk=file.slice(index*start.chunkBytes,Math.min(file.size,(index+1)*start.chunkBytes)),bytes=await chunk.arrayBuffer();aborted(signal);
      const hash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(v=>v.toString(16).padStart(2,"0")).join("");
      await send(`${base}&chunk=${index}&hash=${hash}`,{method:"PUT",headers:{...headers,"content-type":"application/octet-stream"},body:chunk},signal);hashes[index]=hash;done+=chunk.size;input.progress(done,file.size);
    }};
    // allSettled keeps another worker from writing after cleanup starts.
    const run=()=>worker().catch(error=>{failure??=error;transfer.abort();throw error;});
    await Promise.allSettled([run(),run()]);if(failure)throw failure;
    return z.object({src:z.string(),originalSrc:z.string().optional(),intrinsicWidth:z.number().optional(),intrinsicHeight:z.number().optional(),bytes:z.number(),originalBytes:z.number(),optimized:z.boolean().optional()}).parse(await send(base,{method:"PATCH",headers:{...headers,"content-type":"application/json"},body:JSON.stringify({hashes})},signal));
  }catch(error){
    // The server also removes abandoned temporary data, including closed tabs.
    try{await fetch(base,{method:"DELETE",headers,credentials:"same-origin",signal:AbortSignal.timeout(5000)});}catch{}
    throw error;
  }finally{outerSignal.removeEventListener("abort",abort);}
}

