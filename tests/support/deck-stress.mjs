import {build} from 'esbuild';
import {writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import assert from 'node:assert/strict';

let api;
async function compiled() {
  if (!api) {
    const result=await build({stdin:{contents:"export {newDeckDocument} from './src/lib/deck/new-document';export {authorSlide} from './src/lib/deck/authoring';export {prepareDeckEdit} from './src/lib/deck/edit/source';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
    api=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
  }
  return api;
}

/** Authored content, local raster images and real charts. No production data or
 * hidden padding. The same profile is used by browser and scaling checks. */
export async function deckStressSample(directory, count=300, dense=false) {
  const {newDeckDocument,authorSlide,prepareDeckEdit}=await compiled();
  const initial=await newDeckDocument({firstSlide:null});
  const focus={version:1,guidedByDefault:false,slides:{'stress-0':{steps:[{id:'overview',title:'全体を確認',actions:[{id:'all',kind:'overview',targets:[]}]}]}}};
  const raw=initial.replace('</head>',`<script type="application/json" data-deck-focus>${JSON.stringify(focus)}</script></head>`);
  const slides=[];
  for(let i=0;i<count;i++) {
    const kind=i>0&&i<=Math.ceil(count*0.04)?'chart':i>Math.ceil(count*0.04)&&i<=Math.ceil(count*0.09)?'table':'text';
    let slide=authorSlide(kind,`stress-${i}`);
    const isDense=dense&&i===0;
    const detail=Array.from({length:isDense?120:24},(_,j)=>`<p data-deck-node="detail-${i}-${j}" style="position:absolute;left:${48+j%(isDense?12:6)*(isDense?98:196)}px;top:${(isDense?440:240)+Math.floor(j/(isDense?12:6))*(isDense?22:72)}px;width:${isDense?92:180}px;font-size:20px">${isDense?`項目${j+1}`:`比較${j+1}対象の特徴を確認する`}</p>`).join('');
    const image=i<Math.ceil(count*2/3)?`<img data-deck-node="image-${i}" src="stress-image-${i%8}.png" loading="lazy" decoding="async" width="160" height="90" alt="検査用の図版 ${i}" style="position:absolute;right:40px;top:100px;width:160px;height:90px">`:'';
    const complex=isDense?`<div style="position:absolute;left:48px;top:140px;width:560px;height:260px">${authorSlide('chart','dense-chart').match(/<figure[\s\S]*?<\/figure>/)?.[0]??''}</div><div style="position:absolute;left:656px;top:140px;width:560px;height:260px">${authorSlide('table','dense-table').match(/<table[\s\S]*?<\/table>/)?.[0]??''}</div>`:'';
    if(kind==='text')slide=slide.replace(/(<section[^>]*>)[\s\S]*?(<aside data-deck-notes>)/,`$1<h1 style="position:absolute;left:48px;top:48px">編集速度の検査 ${i+1}</h1>${detail}${image}${complex}$2`);
    else slide=slide.replace('<aside data-deck-notes>',image+'<aside data-deck-notes>');
    slide=slide.replace('<aside data-deck-notes>','<aside data-deck-notes>検査用の発表者ノート。'+ 'この説明は検査用に生成した文章です。保存、取り消し、再表示によって内容が変わらないことを確認します。'.repeat(12));
    slides.push(slide);
  }
  const html=prepareDeckEdit(raw.slice(0,raw.lastIndexOf('<main data-deck-slides>'))+`<main data-deck-slides>${slides.join('')}</main></body></html>`).html;
  const profile={count,bytes:Buffer.byteLength(html),nodes:(html.match(/data-deck-node=/g)||[]).length,images:(html.match(/<img\b/g)||[]).length,charts:(html.match(/data-dd-chart=/g)||[]).length,tables:(html.match(/<table\b/g)||[]).length,dense};
  if(count===300){assert.ok(profile.bytes>=1.8*1024*1024,JSON.stringify(profile));assert.ok(profile.nodes>=6300);assert.ok(profile.images>=200);assert.ok(profile.charts>=12);assert.ok(profile.tables>=15);}
  assert.ok(profile.bytes<5*1024*1024);
  await mkdir(directory,{recursive:true});
  for(let i=0;i<8;i++)await sharp({create:{width:1280,height:720,channels:3,background:{r:70+i*15,g:100,b:130}}}).png().toFile(path.join(directory,`stress-image-${i}.png`));
  const file=path.join(directory,`stress-${count}${dense?'-dense':''}.html`);
  await writeFile(file,html);return {file,profile};
}
