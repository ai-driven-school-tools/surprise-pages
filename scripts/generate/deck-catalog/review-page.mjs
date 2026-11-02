/** Build the library in presentation-use order; examples keep their stable identities. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {JSDOM} from 'jsdom';
import {CATALOG_CHAPTERS} from './chapters.mjs';
const [sourcePath,coveragePath,outputPath,compositionsPath,editorialPath,processPath]=process.argv.slice(2);
if(!sourcePath||!coveragePath||!outputPath)throw Error('Usage: review-page.mjs <catalogue.html> <coverage.json> <output.html> [compositions.html] [editorial.html] [process.html]');
const [source,coverageText]=await Promise.all([readFile(sourcePath,'utf8'),readFile(coveragePath,'utf8')]);
const document=new JSDOM(source).window.document,coverage=JSON.parse(coverageText),main=document.querySelector('main[data-deck-slides]');
if(!main||main.children.length!==63||coverage.formats?.length!==63)throw Error('The complete 63-format catalogue is required');
const examples=new Map([...main.children].map(slide=>[slide.getAttribute('data-deck-id'),slide]));
if(examples.size!==63||examples.has(null))throw Error('Every source format needs a unique stable ID');
const escape=text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const section=(id,html,className)=>{const el=document.createElement('section');el.setAttribute('data-deck-slide','');el.setAttribute('data-deck-id',id);el.id=id;el.className=className;el.innerHTML=html;return el;};
async function loadCompositions(path,expected){
 const samples=new JSDOM(await readFile(path,'utf8')).window.document;
 for(const mark of ['data-deck-design-style','data-deck-design-runtime']){
  const kit=samples.querySelector(`[${mark}]`),base=document.querySelector(`[${mark}]`);
  if(!kit||!base||kit.textContent!==base.textContent)throw Error('Rebuild both documents with the same shared design kit before combining them');
 }
 const added=[...samples.querySelectorAll('main > section[data-deck-slide]')];
 if(added.length!==expected)throw Error(`Expected ${expected} authored compositions`);
 const sampleDesign=JSON.parse(samples.querySelector('[data-deck-design]').textContent),sampleFocus=JSON.parse(samples.querySelector('[data-deck-focus]').textContent);
 const designNode=document.querySelector('[data-deck-design]'),focusNode=document.querySelector('[data-deck-focus]');
 const design=JSON.parse(designNode.textContent),focus=JSON.parse(focusNode.textContent);
 for(const slide of added){const id=slide.getAttribute('data-deck-id');if(examples.has(id))throw Error(`Duplicate composition: ${id}`);examples.set(id,document.importNode(slide,true));design.slides[id]={...sampleDesign.document,...sampleDesign.slides[id]};focus.slides[id]=sampleFocus.slides[id];}
 designNode.textContent=JSON.stringify(design).replaceAll('<','\\u003c');focusNode.textContent=JSON.stringify(focus).replaceAll('<','\\u003c');
}
if(compositionsPath)await loadCompositions(compositionsPath,10);
if(editorialPath)await loadCompositions(editorialPath,18);
if(processPath)await loadCompositions(processPath,3);
if(new Set(CATALOG_CHAPTERS.map(chapter=>chapter.id)).size!==CATALOG_CHAPTERS.length)throw Error('Chapter IDs must be unique');
const grouped=CATALOG_CHAPTERS.map(chapter=>({...chapter,slides:chapter.slides.filter(([id])=>examples.has(id))})).filter(chapter=>chapter.slides.length);
const assigned=grouped.flatMap(chapter=>chapter.slides.map(([id])=>id));
if(new Set(assigned).size!==assigned.length||assigned.length!==examples.size)throw Error('Every example must belong to exactly one chapter');
const exampleCount=examples.size,additional=exampleCount-63;
document.title=`スライド全63形式${additional?`＋${additional}構図`:''}`;
const opening=section('catalog-opening',`<div class="dd-catalog-intro"><p class="dd-overline">SURPRISE PAGES / SLIDE LIBRARY</p><h1 class="dd-display">伝わる形を、<br>ここから選ぶ。</h1><p class="dd-subtitle">表紙、見出し、本文、補足。<br>使う順番に、見本を探せる資料集。</p><p class="dd-meta">社内用 / 製品・人物・調査は架空の例</p></div><div class="dd-catalog-count"><p class="dd-overline">実際に比較できる</p><p class="dd-number">${exampleCount}<small>例</small></p><p class="dd-meta">63形式${additional?` ＋ ${additional}構図`:''}</p><a data-dd-slide-link="catalog-index" href="#catalog-index">見本を選ぶ</a></div>`,'dd-catalog-cover');
const index=section('catalog-index','<header class="dd-slide-heading"><p class="dd-overline">使う順番に探す</p><h2 class="dd-title">表紙から本文へ、順番に選ぶ。</h2></header><nav class="dd-catalog-navigation" aria-label="見本を選ぶ"></nav><footer class="dd-footer"><span>章の案内から実物へ進めます。「順に見る」で注目箇所を送れます。</span></footer>','dd-catalog-index');
function link(id,label,className){const a=document.createElement('a');a.href='#'+id;a.setAttribute('data-dd-slide-link',id);if(className)a.className=className;a.textContent=label;return a;}
function indexLink(id,label,detail){const a=link(id,'');const title=document.createElement('span');title.className='dd-nav-title';title.textContent=label;const note=document.createElement('span');note.className='dd-nav-detail';note.textContent=detail;a.append(title,note);index.querySelector('nav').append(a);}
main.replaceChildren(opening,index);
for(const [number,chapter]of grouped.entries()){
 indexLink(chapter.id,`${String(number+1).padStart(2,'0')} ${chapter.name}`,`${chapter.slides.length}例`);
 const guide=section(chapter.id,`<header class="dd-slide-heading"><p class="dd-overline">${String(number+1).padStart(2,'0')} / ${chapter.slides.length}例</p><h2 class="dd-title">${escape(chapter.name)}</h2></header><div class="dd-body"><p class="dd-guide-description">${escape(chapter.description)}</p><nav class="dd-catalog-navigation${chapter.slides.length>10?' dd-catalog-navigation-three':''}" aria-label="${escape(chapter.name)}"></nav></div><footer class="dd-footer"></footer>`,'dd-catalog-guide');
 for(const [id,label]of chapter.slides)guide.querySelector('nav').append(link(id,label));
 guide.querySelector('footer').append(link('catalog-index','目次へ'),link(grouped[number+1]?.id??'coverage-guide',`次：${grouped[number+1]?.name??'構図候補の対応表'}`));
 main.append(guide,...chapter.slides.map(([id])=>examples.get(id)));
}
indexLink('coverage-guide','10 構図候補の対応表','168候補 / 巻末');
main.append(section('coverage-guide','<header class="dd-slide-heading"><p class="dd-overline">巻末 / 構図候補の対応表</p><h2 class="dd-title">実物と、構図候補を分けて読む。</h2></header><div class="dd-body"><p class="dd-lead">ここまでは、実際に比較できる完成例。<br>続く表には、延べ168の構図候補を載せています。</p><p class="dd-meta">「表示切替あり」は制作時の設定です。閲覧中の切替ボタンを指すものではありません。</p><p class="dd-meta">「専用切替なし」は、この見本で切り替えられない候補です。全候補の実装完了を示す表ではありません。</p></div><footer class="dd-footer"></footer>','dd-catalog-guide'));
main.lastElementChild.querySelector('footer').append(link('catalog-index','目次へ'));
const variants=coverage.formats.flatMap(format=>format.variants.map(variant=>({format:format.nameJa,...variant})));
if(variants.length!==168)throw Error('All 168 composition candidates are required');
for(let start=0;start<variants.length;start+=6){
 const rows=variants.slice(start,start+6).map(item=>`<tr><td>${escape(item.format)}</td><td>${escape(item.nameJa)}</td><td>${escape(item.statusJa)}</td></tr>`).join('');
 main.append(section(`coverage-${String(start/6+1).padStart(2,'0')}`,`<p class="dd-kicker">全構図候補 / 対応状況</p><h2 class="dd-title">構図候補 ${start+1}–${Math.min(start+6,variants.length)} / ${variants.length}</h2><div class="dd-body"><table class="dd-data-table" data-dd-density="compact"><thead><tr><th>形式</th><th>構図候補</th><th>作る方法・対応範囲</th></tr></thead><tbody>${rows}</tbody></table></div><footer class="dd-footer"><span>実物の掲載と、候補の対応範囲は別の情報です。</span></footer>`,'dd-catalog-appendix'));
}
await mkdir(dirname(outputPath),{recursive:true});await writeFile(outputPath,'<!doctype html>\n'+document.documentElement.outerHTML+'\n');
console.log(`${main.children.length} slides / ${grouped.length} chapters / ${exampleCount} examples / 168 composition candidates → ${outputPath}`);
