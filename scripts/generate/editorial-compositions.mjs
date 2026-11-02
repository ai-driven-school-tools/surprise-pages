import {catalogAppearance} from './deck-catalog/appearance.mjs';
import {build} from 'esbuild';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {dirname,join} from 'node:path';import {tmpdir} from 'node:os';import {fileURLToPath,pathToFileURL} from 'node:url';
import {messageImageCopy} from './deck-catalog/message-image.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),target=process.argv[2];
if(!target)throw Error('Specify an output HTML path outside the repository');
const room=await mkdtemp(join(tmpdir(),'deck-editorial-'));
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const json=value=>JSON.stringify(value).replaceAll('<','\\u003c');
const symbols={capture:'<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="m16 3 5 5-9 9-5 1 1-5Z"/>',organize:'<path d="M20 7h-9L9 4H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/>',share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/>'};
try{
 await build({stdin:{contents:'export * from "./src/lib/deck/design/editorial-compositions";export {MESSAGE_IMAGE_COVER_EXAMPLE} from "./src/lib/deck/card/message-image";',resolveDir:root},outfile:join(room,'model.mjs'),bundle:true,platform:'node',format:'esm'});
 const {DECK_EDITORIAL_COMPOSITIONS:layouts,EDITORIAL_ITEMS:items,MESSAGE_IMAGE_COVER_EXAMPLE:identity}=await import(pathToFileURL(join(room,'model.mjs')).href);
 const photo='<figure class="dd-editorial-photo" data-dd-element-id="visual"><img src="assets/composition-office.jpg" alt="木の会議机を囲む、光の入る仕事場"></figure>';
 const coverDetails={...identity,section:'ASTER NOTE / チームの記録',subcopy:'一人の気づきを、次の判断に変える。'};
 const dividerDetails={section:'第3章 / 共有と活用',subcopy:'誰に、何を渡すと役立つだろう。'};
 const slides=layouts.map(layout=>{
  let body;
  if(layout.family!=='list'){
   body=messageImageCopy(layout.family==='cover'?'知見を、チームの力に。':'記録を、次の判断へ。',layout.family==='cover'?coverDetails:layout.id==='divider-number'?{...dividerDetails,section:'共有と活用'}:dividerDetails);
   if(layout.id==='divider-number')body='<p class="dd-chapter-number" data-dd-element-id="chapter-number" aria-label="第3章">03</p>'+body;
   if(['cover-window','cover-horizon','divider-photo'].includes(layout.id))body+=photo;
  }else{
   const tag=layout.id==='list-numbered'?'ol':'ul';
   body='<header class="dd-list-heading"><p class="dd-cover-section" data-dd-element-id="section">ASTER NOTE / 使う順番</p><h2 data-dd-element-id="title">整理と共有は、記録したあとでよい。</h2></header>';
   body+=`<div class="dd-list-body">${layout.id==='list-photo-aside'?photo:''}<${tag} class="dd-point-list">${items.map((item,index)=>`<li class="dd-point" data-dd-element-id="point-${item.id}">${layout.images===3?`<figure class="dd-point-image"><img src="${item.image}" alt="${escape(item.alt)}"></figure>`:''}${layout.id==='list-numbered'?`<p class="dd-point-number" aria-hidden="true">${String(index+1).padStart(2,'0')}</p>`:''}${layout.id==='list-symbols'?`<svg class="dd-point-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[item.id]}</svg>`:''}<div class="dd-point-copy"><h3>${escape(item.title)}</h3><p>${escape(item.description).replaceAll('\n','<br>')}</p></div></li>`).join('')}</${tag}></div>`;
  }
  return `<section id="editorial-${layout.id}" data-deck-slide data-deck-id="editorial-${layout.id}" data-dd-layout="${layout.id}" data-dd-format="${layout.format}" class="dd-editorial dd-editorial-${layout.family}">${body}</section>`;
 });
 const focus={version:1,guidedByDefault:true,slides:Object.fromEntries(layouts.map(layout=>{
  const id='editorial-'+layout.id;
  return [id,{steps:[{id:'overview',title:layout.name,supplement:layout.purpose+' 掲載の製品・組織・人物は架空の例です。',actions:[{id:'whole',kind:'overview',targets:[]}]},...(layout.family==='list'?items.map(item=>({id:'focus-'+item.id,title:item.title,supplement:item.description.replace('\n',''),actions:[{id:'focus',kind:'emphasize',targets:[{kind:'element',slideId:id,id:'point-'+item.id}]}]})):[])]}];
 }))};
 const design={version:1,document:catalogAppearance('summary'),slides:Object.fromEntries(layouts.map(layout=>['editorial-'+layout.id,catalogAppearance(layout.format,{dark:['cover-center','divider-center'].includes(layout.id),photographic:['cover-window','cover-horizon','divider-photo'].includes(layout.id)})]))};
 const [kit,runtime]=await Promise.all([readFile(join(root,'src/templates/deck-design.html'),'utf8'),readFile(join(root,'src/templates/deck.html'),'utf8')]);
 const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>表紙・章扉・箇条書きの18構図</title><script type="application/json" data-deck-design>${json(design)}</script><script type="application/json" data-deck-focus>${json(focus)}</script>${kit}${runtime}</head><body data-deck><main data-deck-slides>${slides.join('\n')}</main></body></html>\n`;
 await mkdir(dirname(target),{recursive:true});await writeFile(target,html);console.log(`18 editorial compositions → ${target}`);
}finally{await rm(room,{recursive:true,force:true});}
