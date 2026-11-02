/** Compare the same authored cover and flow under every palette. */
import {build} from 'esbuild';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
const root=fileURLToPath(new URL('../../',import.meta.url));
const [sourcePath,target]=process.argv.slice(2);
if(!sourcePath||!target)throw Error('Usage: generate-deck-gradient-study.mjs <catalogue.html> <output.html>');
const room=await mkdtemp(join(tmpdir(),'gradient-study-'));
const encode=value=>JSON.stringify(value).replaceAll('<','\\u003c');
try{
 await build({entryPoints:[join(root,'src/lib/deck/design/design.ts')],outfile:join(room,'design.mjs'),bundle:true,platform:'node',format:'esm'});
 const {DECK_PRESETS:presets,DEFAULT_APPEARANCE:base}=await import(pathToFileURL(join(room,'design.mjs')).href);
 const doc=new JSDOM(await readFile(sourcePath,'utf8')).window.document;
 const main=doc.querySelector('main[data-deck-slides]'),cover=doc.querySelector('[data-deck-id="title"]'),body=doc.querySelector('[data-deck-id="flow-causal"]');
 if(!main||!cover||!body)throw Error('The authored cover and causal flow are required');
 const authoredFocus=JSON.parse(doc.querySelector('[data-deck-focus]').textContent),slides={},focus={};
 const intro=doc.createElement('section');intro.setAttribute('data-deck-slide','');intro.setAttribute('data-deck-id','gradient-index');intro.className='dd-catalog-index';
 intro.innerHTML='<header class="dd-slide-heading"><p class="dd-overline">SURPRISE PAGES / DESIGN STYLES</p><h1 class="dd-title">色も、文字も、選ぶだけで整う。</h1></header><nav class="dd-catalog-navigation" aria-label="配色を選ぶ"></nav><footer class="dd-footer"><span>和文・英数字・配色・あしらいを、表紙と本文で比較できます。</span></footer>';
 intro.querySelector("nav").classList.toggle("dd-catalog-navigation-three",presets.length>10);
 main.replaceChildren(intro);
 for(const preset of presets){
  const link=doc.createElement('a');link.setAttribute('data-dd-slide-link',`gradient-${preset.id}-cover`);link.href=`#gradient-${preset.id}-cover`;
  const label=doc.createElement('span');label.className='dd-nav-title';label.textContent=preset.name;
  const note=doc.createElement('span');note.className='dd-nav-detail';note.textContent=preset.description;link.append(label,note);intro.querySelector('nav').append(link);
  for(const [kind,source] of [['cover',cover],['body',body]]){
   const slide=source.cloneNode(true),id=`gradient-${preset.id}-${kind}`,old=source.dataset.deckId;
   slide.id=id;slide.setAttribute('data-deck-id',id);
   slide.querySelector('.dd-overline').textContent=`${preset.name} / ${kind==='cover'?'表紙':'本文'}の見本`;
   slides[id]={...preset.appearance,intensity:kind==='body'?Math.min(28,preset.appearance.intensity):preset.appearance.intensity};
   const plan=structuredClone(authoredFocus.slides[old]);
   for(const step of plan.steps)for(const action of step.actions)for(const target of action.targets)target.slideId=id;
   plan.steps[0].title=`${preset.name} — ${kind==='cover'?'表紙':'本文'}`;
   plan.steps[0].supplement=`${preset.description}。${kind==='body'?'本文は図と文字を優先し、背景の濃さを控えています。':'「デザイン」の「完成スタイル」から選べます。'} 内容は架空の製品の例です。`;
   focus[id]=plan;main.append(slide);
  }
 }
 doc.title=`完成スタイルの見本 — ${presets.length}種類・表紙と本文`;
 doc.querySelector('[data-deck-design]').textContent=encode({version:1,document:{...base,typography:"modern",ornament:"none"},slides});
 doc.querySelector('[data-deck-focus]').textContent=encode({version:1,guidedByDefault:true,slides:focus});
 await mkdir(dirname(target),{recursive:true});await writeFile(target,'<!doctype html>\n'+doc.documentElement.outerHTML+'\n');console.log(`${presets.length} palettes / ${main.children.length} slides → ${target}`);
}finally{await rm(room,{recursive:true,force:true});}
