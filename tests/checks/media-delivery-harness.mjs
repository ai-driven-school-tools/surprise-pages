import { build } from 'esbuild';
import {createRequire} from 'node:module';
const sharpPath=createRequire(import.meta.url).resolve('sharp');
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { root, companyDeployment } from './paths.mjs';

/** Actual asset routes/response/storage adapter; only account/DB and Blob transport are local.
 * 社内版（company）の配信の道を見る（配布版は本文が指す素材だけを返す別の道で、check-distribution.mjs が見る）。 */
export async function mediaDeliveryHarness(options={}) {
  const state={member:true,allowed:true,pageSlug:'internal/deck',visibility:'restricted',calls:[],files:new Map()};
  globalThis.__mediaRouteTest=state;
  const gate=`const s=()=>globalThis.__mediaRouteTest;const result=()=>s().allowed?{ok:true,page:{id:'page-1',organization:{id:'00000000-0000-4000-8000-000000000001',assetPrefix:''},pageSlug:s().pageSlug,visibility:s().visibility,currentVersionId:'a'.repeat(40)}}:{ok:false,reason:'restricted',page:{id:'page-1',organization:{id:'00000000-0000-4000-8000-000000000001',assetPrefix:''}}};export async function openPage(){s().calls.push({method:'gate'});return result();}export const openToolsPage=openPage;export const openAssetPage=openPage;export const openPublicPage=openPage;export const openPublicAssetPage=openPage;export async function hasPendingRequest(){return false;}`;
  const modules={
    '@/lib/access/access':gate,
    '@/lib/identity/identity':`export async function currentIdentity(){globalThis.__mediaRouteTest.calls.push({method:'identity'});return globalThis.__mediaRouteTest.member?{kind:'member',email:'reader@example.test'}:null;}export const isMember=v=>v?.kind==='member';export async function currentSessionPerson(){return null;}`,
    '@/lib/pages/store':`export function pageRefOf(slug){return {slugPrefix:slug.split('/')[0]};}export function readHtmlOf(){throw Error('unexpected HTML read');}export function readVersionNumberOf(){throw Error('unexpected version read');}export async function nestedPageSlugs(){return [];}`,
    '@/lib/revisions/revisions':`export const isVersionSha=v=>typeof v==='string'&&/^[0-9a-f]{7,40}$/.test(v);export function readFileAt(){throw Error('unexpected history HTML read');}`,
    '@/lib/access/no-access':`export const noAccessResponse=()=>new Response('forbidden',{status:403});`,
    '@/lib/access/signin-gate':`export const signInGateResponse=()=>new Response('sign in',{status:401});export const lockedCardPath=()=>'/api/og/locked';`,
    '@/lib/pages/og':`export const publicMetaFor=()=>({});export const withOgTags=html=>html;`,
    '@vercel/blob':`
      export class BlobNotFoundError extends Error{}
      export async function head(key){const s=globalThis.__mediaRouteTest;s.calls.push({method:'head',key});const f=s.files.get(key);if(!f)throw new BlobNotFoundError();return {size:f.bytes.length,etag:f.etag,contentType:f.type,uploadedAt:new Date('2026-09-14T00:00:00Z')};}
      export async function get(key,options){const s=globalThis.__mediaRouteTest;s.calls.push({method:'get',key,range:options.headers.Range,access:options.access});const f=s.files.get(key);if(!f)return null;const headers=new Headers({etag:f.etag});let first=0,last=f.bytes.length-1;if(options.headers.Range){const m=/bytes=(\\d+)-(\\d+)/.exec(options.headers.Range);first=Number(m[1]);last=Number(m[2]);headers.set('content-range','bytes '+first+'-'+last+'/'+f.bytes.length);}headers.set('content-length',String(last-first+1));let at=first;const stream=new ReadableStream({pull(c){if(at>last){c.close();return;}const end=Math.min(last+1,at+65536);c.enqueue(f.bytes.subarray(at,end));at=end;},cancel(){s.calls.push({method:'cancel',key});}},{highWaterMark:0});return {statusCode:200,headers,stream,blob:{etag:f.etag,size:last-first+1}};}
      export const list=async()=>({blobs:[],hasMore:false});`,
  };
  const temporary=await mkdtemp(join(tmpdir(),'media-routes-'));
  await build({stdin:{contents:"export {GET as internalGET,HEAD as internalHEAD} from './src/app/internal/[...slug]/route';export {GET as publicGET,HEAD as publicHEAD} from './src/app/public/[...slug]/route';export {GET as historyGET,HEAD as historyHEAD} from './src/app/history/[visibility]/[...slug]/route';"+(options.extra??''),resolveDir:root},outfile:`${temporary}/routes.mjs`,bundle:true,format:'esm',platform:'node',external:['node:*'],plugins:[companyDeployment,{name:'media-transport',setup(b){b.onResolve({filter:/^sharp$/},()=>({path:sharpPath,external:true}));b.onResolve({filter:/.*/},args=>Object.hasOwn(modules,args.path)?{path:args.path,namespace:'media-test'}:undefined);b.onLoad({filter:/.*/,namespace:'media-test'},args=>({contents:modules[args.path],loader:'js'}));}}]});
  const routes=await import(`${temporary}/routes.mjs`);
  return {state,routes};
}
