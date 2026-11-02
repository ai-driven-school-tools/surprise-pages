#!/usr/bin/env node
/** Authoring gate. No uploads; only the document directory and its own saved assets. */
import {parse} from 'parse5';
import {readFile,realpath} from 'node:fs/promises';
import {dirname,resolve,relative,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

import {pageAgentAsset,pageAgentOrigin} from './pages-publish.mjs';
/** Shared by the publication entry point; no optional bypass. */
export async function checkDeckImages(file, {savedPage=null, output, html:inputHtml}={}) {
if(savedPage&&!/^(internal|public)\/[a-z0-9_./-]+$/.test(savedPage))throw new Error('ページの名前が正しくありません');
const directory=await realpath(dirname(resolve(file))),root=fileURLToPath(new URL('../',import.meta.url)),origin=pageAgentOrigin();
let html=inputHtml??await readFile(resolve(file),'utf8');
const nodes=[];
function walk(node) {
 if(node.tagName==='section'&&node.attrs.some(a=>a.name==='data-deck-slide'))nodes.push(node);
 for(const child of node.childNodes??[])walk(child);
}
const document=parse(html,{sourceCodeLocationInfo:true});
// Only a genuinely inert text document can omit browser measurement. No CSS,
// scripts, media, resource links or arbitrary attributes are accepted here.
const textTags=new Set(['html','head','body','title','main','section','article','div','span','p','h1','h2','h3','h4','h5','h6','ul','ol','li','strong','em','b','i','br','hr','blockquote']);
function textOnly(node) {
 if(node.tagName&&(!textTags.has(node.tagName)||(node.attrs??[]).some(attr=>!['id','class','lang','dir','data-deck','data-deck-slides','data-deck-slide','data-deck-node','data-deck-id'].includes(attr.name))))return false;
 return (node.childNodes??[]).every(textOnly);
}
walk(document);
if(textOnly(document))return {ok:true,slides:nodes.length,density:2,issues:[],measurement:'inert-text-only'};
const slides=[],patches=[];
for(const [index,node] of nodes.entries()) {
 const attr=name=>node.attrs.find(a=>a.name===name)?.value;
 const id=attr('data-deck-node')??attr('data-deck-id')??`slide-${index+1}`;
 if(!/^[a-z][a-z0-9_-]{0,127}$/i.test(id)||slides.includes(id))throw new Error('各スライドに重複しない英数字の目印を付けてください');
 slides.push(id);
 if(!attr('data-deck-node')){
  const at=node.sourceCodeLocation?.startTag?.endOffset;
  if(!at)throw new Error('スライドの位置を確認できません');
  patches.push({at:at-1,text:` data-deck-node="${id}"`});
 }
}
if(!slides.length)throw new Error('スライドがありません');
for(const patch of patches.reverse())html=html.slice(0,patch.at)+patch.text+html.slice(patch.at);
const base=savedPage?`/${savedPage.startsWith('internal/')?'i':'p'}/${savedPage.slice(savedPage.indexOf('/')+1)}/`:'/internal/image-quality-local/';
html=html.replace(/<base\b[^>]*>/gi,'').replace(/<head([^>]*)>/i,`<head$1><base href="${origin}${base}">`);
const types={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.svg':'image/svg+xml','.woff2':'font/woff2','.js':'application/javascript'};
const transport=async(url)=>{
 const path=new URL(url).pathname;
 const asset=path.startsWith(base)?path.slice(base.length):null;
 const vendor=path.startsWith('/vendor/')?path.slice(1):null;
 if(asset===null&&vendor===null)return new Response(null,{status:403});
 const dir=vendor?root:directory;
 try{
  const candidate=await realpath(resolve(dir,decodeURIComponent(vendor??asset)));
  const rel=relative(dir,candidate);
  if(rel==='..'||rel.startsWith('..'+sep)||rel.startsWith(sep))return new Response(null,{status:403});
  return new Response(await readFile(candidate),{headers:{'content-type':types[extname(candidate)]??'application/octet-stream'}});
 }catch{
  if(savedPage||vendor)return pageAgentAsset(url,savedPage??'internal/image-quality-local');
  return new Response(null,{status:404});
 }
};
const {inspectAgentPreview}=await import('./page-agent-render.mjs');
const result=await inspectAgentPreview({afterHtml:html,slides,digest:'',baseVersionId:'',issues:[]},savedPage??'internal/image-quality-local',{origin,transport,capture:Boolean(output),output,viewport:{width:1328,height:900},sides:['after']});
const issues=[...result.report.issues.filter(i=>i.kind==='asset'||i.kind==='runtime'),...result.layouts.filter(slide=>slide.missing).map(slide=>({slideId:slide.id,kind:'asset',message:'描画後のスライドが見つからず、画像を検査できませんでした'}))];
return {ok:issues.length===0,slides:slides.length,density:result.imageDensity,issues,...(output?{images:result.images}: {})};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const args=process.argv.slice(2),file=args[0],pageAt=args.indexOf('--page'),shotAt=args.indexOf('--screenshots');
 if(!file) {console.error('使い方: node bin/deck-image-check.mjs 原稿.html [--page internal/ページの名前] [--screenshots 出力先]');process.exitCode=2;}
 else {const result=await checkDeckImages(file,{savedPage:pageAt<0?null:args[pageAt+1],output:shotAt<0?undefined:args[shotAt+1]});console.log(JSON.stringify(result,null,2));process.exitCode=result.ok?0:1;}
}
