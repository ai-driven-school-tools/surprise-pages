import {build} from 'esbuild';import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import {JSDOM} from 'jsdom';import {root} from './paths.mjs';
let failed=0;const ok=(label,pass)=>{console.log(`${pass?'OK  ':'NG  '} ${label}`);if(!pass)failed++;};const room=await mkdtemp(join(tmpdir(),'check-editorial-'));
try{
 await build({stdin:{contents:'export * from "./src/lib/deck/design/editorial-compositions";export {DECK_FORMAT_CATALOG} from "./src/lib/deck/design/format-catalog";export {readDeckCustomization} from "./src/lib/deck/edit/customization-dom";',resolveDir:root},outfile:join(room,'model.mjs'),bundle:true,platform:'node',format:'esm'});
 const {DECK_EDITORIAL_COMPOSITIONS:layouts,EDITORIAL_ITEMS:items,DECK_FORMAT_CATALOG:formats,readDeckCustomization}=await import(pathToFileURL(join(room,'model.mjs')).href);
 const editorial=join(room,'editorial.html'),image=join(room,'image.html');
 for(const [script,path]of [['editorial-compositions',editorial],['message-image-compositions',image]])execFileSync(process.execPath,[`${root}/scripts/generate/${script}.mjs`,path]);
 const doc=new JSDOM(await readFile(editorial,'utf8')).window.document;
 ok('表紙5・章扉4・箇条書き9の18構図を生成',doc.querySelectorAll('.dd-editorial-cover').length===5&&doc.querySelectorAll('.dd-editorial-divider').length===4&&doc.querySelectorAll('.dd-editorial-list').length===9);
 ok('設定と各要素の安定した目印が有効',readDeckCustomization(doc)!==null);
 const focus=JSON.parse(doc.querySelector('[data-deck-focus]').textContent);
 for(const layout of layouts.filter(l=>l.family==='list')){
  const slide=doc.querySelector(`[data-deck-id="editorial-${layout.id}"]`),points=[...slide.querySelectorAll('.dd-point-list > li')];
  ok(`${layout.id}: 3項目と固有画像・説明を保持`,points.length===3&&points.every((point,i)=>point.querySelector('h3').textContent===items[i].title&&point.querySelector('p:not([aria-hidden])').textContent===items[i].description.replace('\n',''))&&slide.querySelectorAll('img').length===layout.images);
  ok(`${layout.id}: 画像と説明をまとめて段階表示`,focus.slides['editorial-'+layout.id].steps.length===4&&focus.slides['editorial-'+layout.id].steps.slice(1).every((step,i)=>step.actions[0].targets[0].id==='point-'+items[i].id));
 }
 ok('各項目は画像と文章を一つの焦点対象にする',doc.querySelectorAll('.dd-point [data-dd-element-id]').length===0);
 ok('3画像の構図は各項目に別の画像と代替文を持つ',[...doc.querySelectorAll('.dd-editorial-list')].filter(s=>s.querySelectorAll('img').length===3).every(s=>new Set([...s.querySelectorAll('img')].map(i=>i.getAttribute('src'))).size===3&&[...s.querySelectorAll('img')].every(i=>i.getAttribute('alt'))));
 const coverage=join(room,'coverage.json');await writeFile(coverage,JSON.stringify({formats:formats.map(f=>({nameJa:f.name,variants:f.compositionVariants.map(name=>({nameJa:name,statusJa:'構図候補'}))}))}));
 const base=`${root}/tests/checks/fixtures/internal/example/deck-format-catalog.html`,oldPath=join(room,'old.html'),allPath=join(room,'all.html');
 execFileSync(process.execPath,[`${root}/scripts/generate/deck-catalog/review-page.mjs`,base,coverage,oldPath,image]);
 execFileSync(process.execPath,[`${root}/scripts/generate/deck-catalog/review-page.mjs`,base,coverage,allPath,image,editorial]);
 const old=new JSDOM(await readFile(oldPath,'utf8')).window.document,all=new JSDOM(await readFile(allPath,'utf8')).window.document;
 const oldIDs=[...old.querySelectorAll('main>section')].map(s=>s.dataset.deckId),allIDs=[...all.querySelectorAll('main>section')].map(s=>s.dataset.deckId);
 ok('追加構図を含めても既存例を欠かさず分類順を保つ',allIDs.length===131&&allIDs.filter(id=>oldIDs.includes(id)).join()===oldIDs.join());
 ok('新しい3分類を実物へのリンクで比較できる',['covers','dividers','lists'].map(name=>all.querySelectorAll(`[data-deck-id="editorial-${name}-guide"] nav a`).length).join(',')==='9,7,11');
 const papers=[...all.querySelectorAll('main>section[data-deck-slide]')];
 const indexes=selector=>papers.flatMap((p,i)=>p.matches(selector)?[i]:[]);
 const covers=indexes('[data-dd-format="title"]'),dividers=indexes('[data-dd-format="divider"]'),body=indexes('[data-dd-format]:not([data-dd-format="title"]):not([data-dd-format="divider"]):not([data-dd-format="profile"])');
 ok('全表紙と全章扉を本文より前にまとめる',Math.max(...covers)<Math.min(...dividers)&&Math.max(...dividers)<Math.min(...body));
 ok('構図候補の対応表29枚は巻末にまとめる',allIDs.slice(-29)[0]==='coverage-guide'&&allIDs.at(-1)==='coverage-28');
 ok('統合後も全焦点手順が有効',readDeckCustomization(all)!==null);
}finally{await rm(room,{recursive:true,force:true});}if(failed)process.exitCode=1;
