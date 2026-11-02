/** Local-only actual editor + API + PostgreSQL harness. No production credentials. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {createDeckEditHarness} from '../../tests/checks/deck-edit-harness.mjs';
import {root} from '../../tests/checks/paths.mjs';
import {resolve, dirname} from 'node:path';
import sharp from 'sharp';
const previewImage=await sharp({create:{width:640,height:360,channels:3,background:'#407080'}}).png().toBuffer();
const h=await createDeckEditHarness({extra:`export {POST as uploadLogo} from './src/app/api/pages/logo/route'; export {GET as imageLibrary, POST as reuseImage} from './src/app/api/pages/deck-edit/image-library/route'; export {GET as libraryPreview} from './src/app/api/pages/deck-edit/image-library/preview/route';`});
const sourcePath=process.env.DECK_EDIT_SAMPLE ?? `${root}/tests/checks/fixtures/internal/example/deck-design-presentation.html`;
const html=process.env.DECK_EDIT_NEW==='1'?await h.api.newDeckDocument():await readFile(sourcePath,'utf8');
await h.seed(html);
// 管理者かは所属の役割で決まる。2 人目の共同編集者を最初の組織（最初の組織）の admin にする
await h.pg.query(`insert into organization_members(organization_id,email,role,added_by) values ('00000000-0000-4000-8000-000000000001',$1,'admin',$2) on conflict (organization_id,email) do update set role='admin'`,['second@example.test',h.owner.email]);
const buildClient=()=>build({stdin:{contents:`
import {openPageEditor} from './src/widget/editor/editor';
import {STYLES} from './src/widget/shared/styles';
const host=document.createElement('surprise-comments');const shadow=host.attachShadow({mode:'open'});
const style=document.createElement('style');style.textContent=STYLES;shadow.append(style);document.body.append(host);
const trigger=document.createElement('button');trigger.textContent='この資料を編集';trigger.style.cssText='position:fixed;right:24px;top:24px;pointer-events:auto';shadow.append(trigger);
trigger.onclick=()=>openPageEditor({pageSlug:'internal/example/design',host:shadow,notify:console.log,fail:console.error});
if(new URL(location.href).searchParams.get('edit')==='1')trigger.click();
`,resolveDir:root},bundle:true,write:false,format:'iife',platform:'browser'});
const clientBundle=await buildClient();
const vendors={'mermaid.js':'mermaid/mermaid.js','echarts.js':'echarts/echarts.js','lucide.js':'lucide/lucide.js','tailwind.js':'tailwindcss/tailwind.js'};
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/client.js'){res.setHeader('Content-Type','text/javascript');res.end(clientBundle.outputFiles[0].text);return;}
    if(url.pathname.startsWith('/vendor/deck-fonts/')){
      const file=url.pathname.slice('/vendor/deck-fonts/'.length),fonts=JSON.parse(await readFile(`${root}/vendor/deck-fonts/manifest.json`,'utf8'));
      if(!fonts.some(font=>font.file===file)){res.writeHead(404);res.end();return;}
      res.setHeader('Content-Type','font/woff2');res.end(await readFile(`${root}/vendor/deck-fonts/${file}`));return;
    }
    if(url.pathname.startsWith('/vendor/')){
      const file=vendors[url.pathname.split('/')[2]];if(!file){res.writeHead(404);res.end();return;}
      res.setHeader('Content-Type','text/javascript');res.end(await readFile(`${root}/vendor/${file}`));return;
    }
    if(url.pathname.startsWith('/api/')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks);
      const request=new Request(`http://127.0.0.1:${server.address().port}${req.url}`,{method:req.method,headers:req.headers,...(bytes.length?{body:bytes}:{})});
      const viewer=req.headers.cookie?.includes('deck-test-user=second')?{...h.owner,email:'second@example.test',name:'共同編集者'}:h.owner;
      let fn;
      if(url.pathname==='/api/pages/logo')fn=h.api.uploadLogo;
      else if(url.pathname==='/api/pages/agent')fn=req.method==='GET'?h.api.agentCapabilities:h.api.agent;
      else if(url.pathname==='/api/pages/deck-edit/create')fn=h.api.createDeck;
      else if(url.pathname==='/api/pages/deck-edit')fn=h.api[req.method];
      else if(url.pathname==='/api/pages/deck-edit/media/upload')fn=({POST:h.api.mediaStart,PUT:h.api.mediaChunk,PATCH:h.api.mediaFinish,DELETE:h.api.mediaCancel})[req.method];
      else if(url.pathname==='/api/pages/deck-edit/media/jobs')fn=req.method==='GET'?h.api.mediaJobs:h.api.mediaJobAction;
      else if(url.pathname==='/api/pages/deck-edit/media/import')fn=h.api.mediaImport;
      else if(url.pathname==='/api/pages/deck-edit/image-library')fn=req.method==='GET'?h.api.imageLibrary:h.api.reuseImage;
      else if(url.pathname==='/api/pages/deck-edit/image-library/preview')fn=h.api.libraryPreview;
      else if(url.pathname==='/api/pages/deck-edit/assets')fn=h.api.upload;
      else if(url.pathname==='/api/pages/deck-edit/video')fn=({POST:h.api.videoStart,PUT:h.api.videoChunk,PATCH:h.api.videoFinish,DELETE:h.api.videoCancel})[req.method];
      else if(url.pathname==='/api/pages/edit'){
        fn=req.method==='GET'?h.api.readLegacy:h.api.saveLegacy;
      }
      if(!fn){res.writeHead(404);res.end();return;}
      const result=await h.as(viewer,()=>fn(request));
      if(process.env.DECK_TEST_MEDIA_WORKFLOW==='1')for(const args of (globalThis.__deckMediaStarts??[]).splice(0))void h.api.runMediaWorkflow(...args).catch(error=>console.error('Local workflow failed',error));
      res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
    }
    if(url.pathname.startsWith('/internal/example/design/')){
      const rel=url.pathname.slice('/internal/example/design/'.length);
      const asset=await h.api.readAsset(h.organization,'internal',['example','design',...rel.split('/')]);
      if(asset){res.setHeader('Content-Type',asset.contentType);res.end(Buffer.from(await new Response(await asset.open(null,new AbortController().signal)).arrayBuffer()));return;}
      // Optional sample assets only from the explicitly supplied sample directory.
      if(process.env.DECK_EDIT_SAMPLE && !rel.includes('..') && !rel.startsWith('/')){
        try{const bytes=await readFile(resolve(process.env.DECK_EDIT_ASSETS_ROOT??dirname(sourcePath),rel));res.setHeader('Content-Type',h.api.assetContentType(rel)??'application/octet-stream');res.end(bytes);return;}catch{}
      }
      res.writeHead(404);res.end();return;
    }
    if(url.pathname==='/mock-search-thumb.png'){res.setHeader('Content-Type','image/png');res.end(previewImage);return;}
    if(url.pathname==='/' || url.pathname==='/reader'){
      const rows=await h.pg.query('select html from page_revisions order by version_number desc limit 1');
      const body=rows.rows[0].html;
      res.setHeader('Content-Type','text/html; charset=utf-8');
      if(url.searchParams.get('who')==='second')res.setHeader('Set-Cookie','deck-test-user=second; Path=/; SameSite=Lax');
      // Same production asset/vendor transforms, plus a local-only launch button.
      const transformed=h.api.withSafeAnchorIds(h.api.withVendorScripts(h.api.withAssetBase(body,'/internal/example/design')));
      res.end(transformed.replace('</body>',`${url.pathname==='/reader'?'':'<script src="/client.js"></script>'}</body>`));return;
    }
    res.writeHead(404);res.end();
  }catch(error){console.error(error);res.writeHead(500);res.end('Local harness error');}
});
server.listen(Number(process.env.PORT??4178),'127.0.0.1',()=>console.log(`Deck editor preview http://127.0.0.1:${server.address().port} (second user: /?who=second)`));
