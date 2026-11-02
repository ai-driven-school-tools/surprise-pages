import {catalogAppearance} from './deck-catalog/appearance.mjs';
import {build} from 'esbuild';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {messageImageCopy} from './deck-catalog/message-image.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const target=process.argv[2];
if(!target)throw Error('Specify an output HTML path outside the repository');
const room=await mkdtemp(join(tmpdir(),'deck-compositions-'));
try{
 await build({stdin:{contents:'export * from "./src/lib/deck/card/message-image";',resolveDir:root},outfile:join(room,'model.mjs'),bundle:true,platform:'node',format:'esm'});
 const {DECK_MESSAGE_IMAGE_COMPOSITIONS:layouts,MESSAGE_IMAGE_EXAMPLE:example,MESSAGE_IMAGE_COVER_EXAMPLE:cover}=await import(pathToFileURL(join(room,'model.mjs')).href);
 const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const json=value=>JSON.stringify(value).replaceAll('<','\\u003c');
 const slides=layouts.map(layout=>`<section id="composition-${layout.id}" data-deck-slide data-deck-id="composition-${layout.id}" data-dd-format="${layout.format}" data-dd-layout="${layout.id}" class="dd-message-image">${messageImageCopy(example.message,layout.format==='image-one'?{}:cover)}<figure class="dd-message-image-visual" data-dd-element-id="visual"><img src="${escape(example.image)}" alt="${escape(example.alt)}"></figure></section>`);
 const design={version:1,document:catalogAppearance('image-one'),slides:Object.fromEntries(layouts.map(layout=>['composition-'+layout.id,catalogAppearance(layout.format,{photographic:['photo-bleed','photo-panel'].includes(layout.id)})]))};
 const focus={version:1,guidedByDefault:true,slides:Object.fromEntries(layouts.map((layout,index)=>[`composition-${layout.id}`,{steps:[{id:'overview',title:`${String(index+1).padStart(2,'0')} ${layout.name} — ${layout.use}`,supplement:`${layout.use}向け。${layout.purpose}\n${layout.crop}`,actions:[{id:'whole',kind:'overview',targets:[]}]}]}]))};
 const kit=await readFile(join(root,'src/templates/deck-design.html'),'utf8');
 const runtime=await readFile(join(root,'src/templates/deck.html'),'utf8');
 const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>同じ一文と写真の10構図</title><script type="application/json" data-deck-design>${json(design)}</script><script type="application/json" data-deck-focus>${json(focus)}</script>${kit}${runtime}</head><body data-deck><main data-deck-slides>${slides.join('\n')}</main></body></html>\n`;
 await mkdir(dirname(target),{recursive:true});await writeFile(target,html);
 console.log(`10 compositions / one shared message / one shared image → ${target}`);
}finally{await rm(room,{recursive:true,force:true});}
