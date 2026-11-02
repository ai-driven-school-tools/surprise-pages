import {build} from 'esbuild';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {root} from './paths.mjs';
import {messageImageCopy} from '../../scripts/generate/deck-catalog/message-image.mjs';
let failed=0;
const ok=(label,value)=>{console.log(`${value?'OK  ':'NG  '} ${label}`);if(!value)failed++;};
const room=await mkdtemp(join(tmpdir(),'check-compositions-'));
try{
 await build({stdin:{contents:'export * from "./src/lib/deck/card/message-image";export * from "./src/lib/deck/design/format-catalog";export { readDeckCustomization } from "./src/lib/deck/edit/customization-dom";',resolveDir:root},outfile:join(room,'model.mjs'),bundle:true,platform:'node',format:'esm'});
 const {DECK_MESSAGE_IMAGE_COMPOSITIONS:layouts,MESSAGE_IMAGE_EXAMPLE:example,DECK_FORMAT_CATALOG:formats,readDeckCustomization}=await import(pathToFileURL(join(room,'model.mjs')).href);
 const sample=join(room,'compositions.html');
 execFileSync(process.execPath,[`${root}/scripts/generate/message-image-compositions.mjs`,sample]);
 const doc=new JSDOM(await readFile(sample,'utf8')).window.document;
 const slides=[...doc.querySelectorAll('main > section[data-deck-slide]')];
 ok('実装した10構図を重複なく生成する',slides.length===10&&new Set(slides.map(slide=>slide.getAttribute('data-dd-layout'))).size===10);
 for(const slide of slides){const id=slide.getAttribute('data-dd-layout');ok(`${id}:同じ一文と画像を一つずつ保持`,slide.querySelectorAll('h1').length===1&&slide.querySelectorAll('img').length===1&&slide.querySelector('h1').textContent===example.message&&slide.querySelector('img').getAttribute('src')===example.image);}
 ok('本文は一文と写真に絞り、表紙は5つの任意項目を編集できる',slides.every(slide=>slide.getAttribute('data-dd-format')==='image-one'?slide.textContent===example.message:slide.querySelectorAll('p[data-dd-element-id^="cover-"]').length===5));
 const empty=new JSDOM(messageImageCopy(example.message,{section:' ',organization:'',name:undefined})).window.document;
 ok('省略した表紙情報の空欄や発表者の箱を残さない',empty.querySelectorAll('p,.dd-cover-identity').length===0&&empty.querySelector('h1').textContent===example.message);
 for(const key of ['section','subcopy','organization','affiliation','name']){
  const partial=new JSDOM(messageImageCopy(example.message,{[key]:'組織 <A> & 発表者'})).window.document;
  ok(`${key}だけでも意味を保ちHTMLを文字として扱う`,partial.querySelectorAll('p').length===1&&partial.querySelector('p').textContent==='組織 <A> & 発表者'&&partial.querySelectorAll('.dd-cover-identity').length===(['organization','affiliation','name'].includes(key)?1:0));
 }
 ok('すべての構図に用途と切り取りの説明がある',layouts.every(layout=>layout.name&&layout.purpose&&layout.crop));
 ok('単体でもデザインと公開補足の設定が有効',readDeckCustomization(doc)!==null);
 const coverage={formats:formats.map(format=>({nameJa:format.name,variants:format.compositionVariants.map(name=>({nameJa:name,statusJa:'構図候補'}))}))};
 const coveragePath=join(room,'coverage.json'),output=join(room,'review.html');await writeFile(coveragePath,JSON.stringify(coverage));
 const original=`${root}/tests/checks/fixtures/internal/example/deck-format-catalog.html`;
 execFileSync(process.execPath,[`${root}/scripts/generate/deck-catalog/review-page.mjs`,original,coveragePath,output,sample]);
 const combined=new JSDOM(await readFile(output,'utf8')).window.document;
 const all=[...combined.querySelectorAll('main > section[data-deck-slide]')];
 ok('全分類の案内と10構図を含む113枚を生成',all.length===113);
 ok('63形式の目印を重複や欠落なく保つ',formats.every(format=>all.filter(slide=>slide.getAttribute('data-deck-id')===format.id).length===1));
 ok('一文の章へ目次から移動できる',combined.querySelector('[data-deck-id="catalog-index"] a[data-dd-slide-link="compositions-guide"]')!==null);
 ok('10構図を名前から直接選べる',combined.querySelectorAll('.dd-catalog-guide nav a[data-dd-slide-link^="composition-"]').length===10);
 ok('結合後も目印と公開補足が有効',readDeckCustomization(combined)!==null);
}finally{await rm(room,{recursive:true,force:true});}
if(failed)process.exitCode=1;
