import {build} from 'esbuild';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {root} from './paths.mjs';
let failures=0;
const ok=(label,pass)=>{console.log(`${pass?'OK  ':'NG  '} ${label}`);if(!pass)failures++;};
const room=await mkdtemp(join(tmpdir(),'check-process-'));
try{
 await build({stdin:{contents:'export * from "./src/lib/deck/design/process-compositions";export {readDeckCustomization} from "./src/lib/deck/edit/customization-dom";export {DECK_FORMAT_CATALOG} from "./src/lib/deck/design/format-catalog";',resolveDir:root},outfile:join(room,'model.mjs'),bundle:true,format:'esm',platform:'node'});
 const {DECK_PROCESS_COMPOSITIONS:layouts,PROCESS_ITEMS:items,readDeckCustomization,DECK_FORMAT_CATALOG:formats}=await import(pathToFileURL(join(room,'model.mjs')).href);
 const path=join(room,'process.html');execFileSync(process.execPath,[`${root}/scripts/generate/process-compositions.mjs`,path]);
 const doc=new JSDOM(await readFile(path,'utf8')).window.document,slides=[...doc.querySelectorAll('section[data-deck-slide]')],focus=JSON.parse(doc.querySelector('[data-deck-focus]').textContent);
 ok('画像付き手順の3構図を生成',slides.length===3&&slides.every((s,i)=>s.dataset.deckId===layouts[i].id));
 ok('既存の焦点と着せ替えの契約を満たす',readDeckCustomization(doc)!==null);
 for(const slide of slides){
  const points=[...slide.querySelectorAll('ol > li')];
  ok(`${slide.id}: 一つの主張と順番を持つ3項目`,slide.querySelectorAll('h1,h2,.dd-statement,.dd-display').length===1&&points.length===3);
  ok(`${slide.id}: 各段階に固有の画像と編集できる説明`,points.every((p,i)=>p.querySelector('h3').textContent===items[i].title&&p.querySelector('img').getAttribute('src')===items[i].image&&p.querySelector('img').alt===items[i].alt&&p.querySelector('.dd-process-detail').textContent===items[i].description.replace('\n','')));
  ok(`${slide.id}: 子へ二重の焦点を付けない`,points.every(p=>p.querySelectorAll('[data-dd-element-id]').length===0));
  ok(`${slide.id}: 画像と文字の組を順に強調`,focus.slides[slide.id].steps.length===4&&focus.slides[slide.id].steps.slice(1).every((step,i)=>step.actions[0].targets[0].id==='step-'+items[i].id));
 }
 const coverage=join(room,'coverage.json');await writeFile(coverage,JSON.stringify({formats:formats.map(f=>({nameJa:f.name,variants:f.compositionVariants.map(name=>({nameJa:name,statusJa:'構図候補'}))}))}));
 const image=join(room,'image.html'),editorial=join(room,'editorial.html');
 for(const [script,target]of[['message-image-compositions',image],['editorial-compositions',editorial]])execFileSync(process.execPath,[`${root}/scripts/generate/${script}.mjs`,target]);
 const output=join(room,'all.html');execFileSync(process.execPath,[`${root}/scripts/generate/deck-catalog/review-page.mjs`,`${root}/tests/checks/fixtures/internal/example/deck-format-catalog.html`,coverage,output,image,editorial,path]);
 const all=new JSDOM(await readFile(output,'utf8')).window.document,ids=[...all.querySelectorAll('main>section')].map(s=>s.dataset.deckId);
 ok('94例を用途順に並べ既存の巻末を保つ',ids.length===134&&ids.slice(-29)[0]==='coverage-guide'&&new Set(ids).size===134);
 ok('画像の手順を図の章の先頭にまとめる',ids.slice(ids.indexOf('catalog-diagrams-guide')+1,ids.indexOf('catalog-diagrams-guide')+4).join()===layouts.map(l=>l.id).join());
 ok('統合後も全画像手順の焦点が有効',readDeckCustomization(all)!==null&&layouts.every(l=>all.querySelector(`a[data-dd-slide-link="${l.id}"]`)));
}finally{await rm(room,{recursive:true,force:true});}
if(failures)process.exitCode=1;
