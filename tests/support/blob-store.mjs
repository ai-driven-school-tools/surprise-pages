/** Test-only private Blob transport. Aliased only in the disposable copied app. */
import {mkdir,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
function directory(){const value=process.env.PAGES_TEST_ASSETS;if(!value)throw Error('Disposable asset directory required');return value;}
const file=key=>join(directory(),createHash('sha256').update(key).digest('hex')+'.json');
export class BlobNotFoundError extends Error {}
export async function head(key){try{const value=JSON.parse(await readFile(file(key),'utf8'));return {...value,uploadedAt:new Date(value.uploadedAt),size:Buffer.from(value.bytes,'base64').length};}catch(error){if(error.code==='ENOENT')throw new BlobNotFoundError();throw error;}}
export async function put(key,body,options){
 if(options.access!=='private')throw Error('Tests permit private assets only');
 await mkdir(directory(),{recursive:true});const bytes=body instanceof ReadableStream?Buffer.from(await new Response(body).arrayBuffer()):Buffer.from(body);
 const record={pathname:key,contentType:options.contentType,bytes:bytes.toString('base64'),etag:'"'+createHash('sha256').update(bytes).digest('hex')+'"',uploadedAt:new Date().toISOString()};
 await writeFile(file(key),JSON.stringify(record),{flag:options.allowOverwrite?'w':'wx'});return {pathname:key};
}
export async function get(key,options){
 if(options.access!=='private')throw Error('Tests permit private assets only');
 let metadata;try{metadata=await head(key);}catch(error){if(error instanceof BlobNotFoundError)return null;throw error;}
 const bytes=Buffer.from(metadata.bytes,'base64'),match=/^bytes=(\d+)-(\d+)$/.exec(options.headers?.Range??'');
 const data=match?bytes.subarray(Number(match[1]),Number(match[2])+1):bytes;
 const headers=new Headers({'etag':metadata.etag,'content-length':String(data.length)});
 if(match)headers.set('content-range',`bytes ${match[1]}-${match[2]}/${bytes.length}`);
 return {statusCode:200,headers,blob:metadata,stream:new ReadableStream({start(controller){controller.enqueue(data);controller.close();}})};
}
export async function list({prefix='',cursor,limit=1000}={}){
 await mkdir(directory(),{recursive:true});const all=[];
 for(const name of await readdir(directory())){const entry=JSON.parse(await readFile(join(directory(),name),'utf8'));if(entry.pathname.startsWith(prefix))all.push({...entry,size:Buffer.from(entry.bytes,'base64').length,uploadedAt:new Date(entry.uploadedAt)});}
 all.sort((a,b)=>a.pathname.localeCompare(b.pathname));const start=Number(cursor??0);return {blobs:all.slice(start,start+limit),hasMore:start+limit<all.length,cursor:String(start+limit)};
}
export async function del(keys){for(const key of Array.isArray(keys)?keys:[keys])await rm(file(key),{force:true});}
export async function createMultipartUploader(key,options){
 if(options.access!=='private')throw Error('Tests permit private assets only');
 const parts=new Map();
 return {async uploadPart(partNumber,body){const bytes=Buffer.from(body),etag=createHash('sha256').update(bytes).digest('hex');parts.set(partNumber,{bytes,etag});return {etag,partNumber};},
  async complete(sequence){const chunks=[];for(let i=0;i<sequence.length;i++){const item=sequence[i],part=parts.get(item.partNumber);if(item.partNumber!==i+1||!part||part.etag!==item.etag)throw Error('Multipart sequence does not match');chunks.push(part.bytes);}return put(key,Buffer.concat(chunks),options);}};
}
export async function copy(from,to,options){const value=await head(from);return put(to,Buffer.from(value.bytes,'base64'),{...options,contentType:options.contentType??value.contentType});}
