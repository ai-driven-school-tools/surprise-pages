import {lookup} from "node:dns/promises";
import {BlockList,isIP} from "node:net";
import {request} from "node:https";
import {Transform} from "node:stream";
import {pipeline} from "node:stream/promises";
import {createWriteStream} from "node:fs";
import {mkdtemp,rm,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {mediaTypeSchema} from "./media";
import {hasVideoSignature} from "./video-upload";
import { rt } from "../../i18n/request";
export class DeckRemoteMediaError extends Error {}
const blocked=new BlockList();
for(const [network,prefix] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],["192.168.0.0",16],["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4]] satisfies [string,number][])blocked.addSubnet(network,prefix,"ipv4");
const blockedV6=new BlockList();for(const [address,prefix] of [["2001::",32],["2002::",16],["2001:db8::",32],["2001:2::",48]] satisfies [string,number][])blockedV6.addSubnet(address,prefix,"ipv6");
const publicV6=new BlockList();publicV6.addSubnet("2000::",3,"ipv6");
export function publicMediaAddress(address:string):boolean{return isIP(address)===4?!blocked.check(address,"ipv4"):isIP(address)===6&&publicV6.check(address,"ipv6")&&!blockedV6.check(address,"ipv6");}
export async function downloadRemoteMedia(value:string,options:{imageLimitBytes?:number}={}){
 const directory=await mkdtemp(join(tmpdir(),"deck-media-")),path=join(directory,"input");
 try{
  let url=new URL(value);const signal=AbortSignal.timeout(40000);
  for(let hop=0;hop<4;hop++){
   if(url.protocol!=="https:"||url.username||url.password||url.port&&url.port!=="443")throw new DeckRemoteMediaError(rt("deckEditor.upload.httpsOnly"));
   const addresses=await lookup(url.hostname,{all:true});if(!addresses.length||addresses.some(item=>!publicMediaAddress(item.address)))throw new DeckRemoteMediaError(rt("deckEditor.upload.blockedHost"));
   const address=addresses[0];
   const response=await new Promise<import('node:http').IncomingMessage>((resolve,reject)=>{
    const req=request(url,{agent:false,signal,headers:{Accept:"image/*", "Accept-Encoding":"identity"},lookup:(_host,options,callback)=>{if(options.all)callback(null,[address]);else callback(null,address.address,address.family);}},resolve);req.on("error",reject);req.end();
   });
   if([301,302,303,307,308].includes(response.statusCode??0)&&response.headers.location){response.destroy();url=new URL(response.headers.location,url);continue;}
   if(response.statusCode!==200){response.destroy();throw new DeckRemoteMediaError(rt("deckEditor.upload.accessDenied"));}
   const parsed=mediaTypeSchema.safeParse(response.headers["content-type"]?.split(";")[0]?.trim());
   if(!parsed.success){response.destroy();throw new DeckRemoteMediaError(rt("deckEditor.upload.notDirect"));}
   const limit=options.imageLimitBytes??10*1024*1024;
   if(Number(response.headers["content-length"])>limit){response.destroy();throw new RangeError(rt("deckEditor.upload.imageLimit"));}
   let size=0,prefix=Buffer.alloc(0);
   await pipeline(response,new Transform({transform(chunk:Buffer,_encoding,done){size+=chunk.length;if(prefix.length<32)prefix=Buffer.concat([prefix,chunk.subarray(0,32-prefix.length)]);if(size>limit)done(new RangeError(rt("deckEditor.upload.overLimit")));else done(null,chunk);}}),createWriteStream(path),{signal});
   if(!size||!hasVideoSignature(prefix,parsed.data))throw new DeckRemoteMediaError(rt("deckEditor.upload.unreadable"));
   return {path,size,type:parsed.data,readImage:()=>readFile(path),dispose:()=>rm(directory,{recursive:true,force:true})};
  }
  throw new DeckRemoteMediaError(rt("deckEditor.upload.tooManyRedirects"));
 }catch(error){await rm(directory,{recursive:true,force:true});if(error instanceof DeckRemoteMediaError||error instanceof RangeError)throw error;throw new DeckRemoteMediaError(rt("deckEditor.upload.fetchFailed"));}
}
