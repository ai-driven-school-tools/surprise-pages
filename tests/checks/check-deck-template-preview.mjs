import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {root,dir} from './paths.mjs';

/**
 * 「仕上がりの見本」の描き方の約束。
 *
 * 見本の描画は、共有の描画器（iframe）1 つで 1 枚ずつ描いて写しを配る。ここで守るのは、
 * 描く前の取り寄せ（書体・ロゴ・グラフの道具）と描く作業を**別々の予算**で測ること。
 * 同じ 8 秒で測っていたときは、会社テーマの書体（3〜6MB）が間に合わないだけで描画器ごと
 * 捨てられ、途中まで届いていた書体も一緒に消えて、押し直すたびに 0 から取り直していた。
 */
let fails=0;
async function test(label,fn){try{await fn();console.log('OK  '+label);}catch(e){fails++;console.log('NG  '+label+': '+e.stack);}}
const preview=await readFile(`${root}/src/widget/deck/edit/template-preview.ts`,'utf8');
const picker=await readFile(`${root}/src/widget/deck/edit/library-picker.ts`,'utf8');
await build({stdin:{contents:`export {TEMPLATE_PREVIEW_TIMEOUT,TEMPLATE_PREVIEW_PREPARE_TIMEOUT,TEMPLATE_PREVIEW_NOTICE_DELAY} from './src/widget/deck/edit/template-preview';export * from './src/lib/deck/design/browser-templates';`,resolveDir:root},outfile:`${dir}/deck-template-preview.mjs`,bundle:true,format:'esm',platform:'node'});
const m=await import(`${dir}/deck-template-preview.mjs`);

await test('書体は描画器ではなく、見本を置く画面の文書に読み込む（描画器を捨てても取り寄せが消えない）',()=>{
  assert.match(preview,/const owner\s*=\s*host\.ownerDocument/);
  assert.match(preview,/prepareDeckFonts\(owner,/);
  assert.doesNotMatch(preview,/prepareDeckFonts\(doc,/);
  // 画面の文書に入った書体を、描画器の文書へ渡してから描く
  assert.match(preview,/for\(const font of owner\.fonts\)if\(isDeckFont\(font\)&&!installed\.has\(font\)\)doc\.fonts\.add\(font\)/);
});
await test('描画器の立ち上げは書体なし（実行部の 2 秒の取り寄せと、その静かな代替書体を避ける）',()=>{
  const bootstrap=preview.match(/const config=JSON\.stringify\(\{version:1,document:\{\.\.\.job\.appearance,typography:'system'\},slides:\{\}\}\)/);
  assert.ok(bootstrap,'立ち上げの設定は typography を system にする');
  // 本当の書体は、描く直前に設定へ書き戻す
  assert.match(preview,/setting\.textContent=JSON\.stringify\(\{version:1,document:job\.appearance,slides:\{\}\}\)/);
});
await test('取り寄せの予算は描く予算より長く、別々に測る',()=>{
  assert.ok(m.TEMPLATE_PREVIEW_PREPARE_TIMEOUT>=5*m.TEMPLATE_PREVIEW_TIMEOUT,`${m.TEMPLATE_PREVIEW_PREPARE_TIMEOUT} vs ${m.TEMPLATE_PREVIEW_TIMEOUT}`);
  assert.match(preview,/prepareDeckFonts\(owner,\[job\.appearance\.typography\],TEMPLATE_PREVIEW_PREPARE_TIMEOUT\)/);
  assert.match(preview,/'グラフの道具を読み込めません'/);
  assert.match(preview,/AbortSignal\.timeout\(TEMPLATE_PREVIEW_PREPARE_TIMEOUT\)/);
  assert.match(preview,/return await bounded\(work,TEMPLATE_PREVIEW_TIMEOUT,signal,/);
});
await test('描画器を捨てるのは描画器そのものの失敗だけ（取り寄せの失敗では残す）',()=>{
  assert.match(preview,/if\(error instanceof RendererFailure\)reset\(\);/);
  const drainCatch=preview.slice(preview.indexOf('async function drain()'),preview.indexOf('function request('));
  assert.equal((drainCatch.match(/reset\(\)/g)??[]).length,1);
});
await test('待っている理由をカードが言う（黙って「準備中」のままにしない）',async()=>{
  assert.ok(m.TEMPLATE_PREVIEW_NOTICE_DELAY>0&&m.TEMPLATE_PREVIEW_NOTICE_DELAY<m.TEMPLATE_PREVIEW_TIMEOUT);
  assert.match(preview,/listener\.notice\?\.\(t\('decks\.templatePreview\.loadingFonts'\)\)/);
  // 札の文は辞書（日本語が正本）から引く。理由を言う文そのものは変えない
  assert.match(await readFile(`${root}/src/lib/i18n/messages/ja/decks.ts`,'utf8'),/loadingFonts: "書体を読み込んでいます…"/);
  assert.match(preview,/notice:text=>\{if\(thisTicket!==ticket\|\|removed\|\|holder\.dataset\.previewState!=='loading'\)return;holder\.textContent=text;\}/);
});
await test('見本の一覧は、分類ごとに何のための形かを 1 行添え、基本の 8 種類は札の下に目的を書く',()=>{
  for(const group of m.BROWSER_TEMPLATE_CATEGORIES)assert.ok(group.description&&group.description.length>10,group.id);
  for(const item of m.BROWSER_TEMPLATES){
    if(item.kind==='basic')assert.ok(item.summary&&item.summary.length>4,item.id);
    else assert.equal(item.summary,null,item.id);
  }
  assert.match(picker,/el\('p','dp-group-note',grouped\(group\)\.description\)/);
  // 名前・説明・添え字は、その人の言語で（基本の型は辞書の鍵から）
  assert.match(picker,/const named=\(item:BrowserTemplate\)=>browserTemplateText\(item,t\);/);
  assert.match(picker,/\{const summary=named\(item\)\.summary;if\(summary\)card\.append\(el\('span','dp-summary',summary\)\);\}/);
  // 添え字は補足の目盛り（12px・灰）で、名前（13px・中太）より必ず弱い
  assert.match(picker,/\.dp-summary \{[^}]*font-size:var\(--font-sm\)[^}]*\}/);
  assert.match(picker,/\.dp-group-note \{[^}]*font-size:var\(--font-sm\)[^}]*\}/);
  assert.match(picker,/\.dp-card strong \{[^}]*font-size:var\(--font-base\)[^}]*font-weight:var\(--weight-medium\)/);
});
if(fails)process.exit(1);
