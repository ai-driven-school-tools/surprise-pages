import {build} from 'esbuild';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {catalogAppearance} from './deck-catalog/appearance.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),target=process.argv[2];
if(!target)throw Error('Specify an output HTML path outside the repository');
const room=await mkdtemp(join(tmpdir(),'deck-process-'));
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const json=value=>JSON.stringify(value).replaceAll('<','\\u003c');
try{
 await build({entryPoints:[join(root,'src/lib/deck/design/process-compositions.ts')],outfile:join(room,'model.mjs'),bundle:true,platform:'node',format:'esm'});
 const {DECK_PROCESS_COMPOSITIONS:layouts,PROCESS_ITEMS:items}=await import(pathToFileURL(join(room,'model.mjs')).href);
 const slides=layouts.map(layout=>`<section id="${layout.id}" data-deck-slide data-deck-id="${layout.id}" data-dd-format="flow-sequence" data-dd-layout="${layout.id}" class="dd-composed dd-process"><header class="dd-slide-heading"><p class="dd-overline" data-dd-element-id="section">ASTER NOTE / 記録から共有まで</p><h2 class="dd-title" data-dd-element-id="title">まず記録し、あとから整理して共有する。</h2></header><ol class="dd-process-list">${items.map((item,index)=>`<li class="dd-process-step" data-dd-element-id="step-${item.id}"><figure class="dd-process-image"><img src="${escape(item.image)}" alt="${escape(item.alt)}"></figure><div class="dd-process-copy"><p class="dd-process-order" aria-label="ステップ${index+1}">${String(index+1).padStart(2,'0')}</p><h3>${escape(item.title)}</h3><p class="dd-process-detail">${escape(item.description).replaceAll('\n','<br>')}</p></div></li>`).join('')}</ol></section>`);
 const design={version:1,document:catalogAppearance('flow-sequence'),slides:{}};
 const focus={version:1,guidedByDefault:true,slides:Object.fromEntries(layouts.map(layout=>[layout.id,{steps:[{id:'overview',title:layout.name,supplement:layout.purpose+' 掲載の製品は架空の例です。',actions:[{id:'whole',kind:'overview',targets:[]}]},...items.map(item=>({id:'focus-'+item.id,title:item.title,supplement:item.description.replace('\n',''),actions:[{id:'focus',kind:'emphasize',targets:[{kind:'element',slideId:layout.id,id:'step-'+item.id}]}]}))]}]))};
 const [kit,runtime]=await Promise.all([readFile(join(root,'src/templates/deck-design.html'),'utf8'),readFile(join(root,'src/templates/deck.html'),'utf8')]);
 const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>画像で伝える3ステップ</title><script type="application/json" data-deck-design>${json(design)}</script><script type="application/json" data-deck-focus>${json(focus)}</script>${kit}${runtime}</head><body data-deck><main data-deck-slides>${slides.join('\n')}</main></body></html>\n`;
 await mkdir(dirname(target),{recursive:true});await writeFile(target,html);console.log(`${slides.length} image sequences → ${target}`);
}finally{await rm(room,{recursive:true,force:true});}
