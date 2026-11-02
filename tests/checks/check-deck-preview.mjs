import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {root,dir} from './paths.mjs';

// Small trusted releases stand in for the reviewed hash catalog. The real
// extraction, hashing and replacement run unchanged against current outputs.
const previousNavigation='<script>var WIDTH = 1280; /* data-deck-ready */</script>';
const previousDesign='<script data-deck-design-runtime="3" data-deck-diagonal>/* reviewed previous design: https://pages.example.com/vendor/deck-fonts/ */</script>';
const deliveredDesign=previousDesign.replace('https://pages.example.com/vendor/deck-fonts/','/vendor/deck-fonts/');
const hash=value=>createHash('sha256').update(value).digest('hex');
await build({stdin:{contents:"export {upgradeDeckPreview} from './src/widget/deck/preview';export {navigationRuntime,designRuntime} from './src/lib/deck/preview.generated';export {withVendorScripts} from './src/lib/html/vendor-scripts';",resolveDir:root},outfile:`${dir}/deck-preview.mjs`,bundle:true,format:'esm',platform:'node',plugins:[{name:'reviewed-test-catalog',setup(builder){builder.onLoad({filter:/deck-preview-compat\.json$/},()=>({contents:JSON.stringify({navigation:[hash(previousNavigation)],design:[hash(previousDesign),hash(deliveredDesign)]}),loader:'json'}));}}]});
const {upgradeDeckPreview,navigationRuntime,designRuntime,withVendorScripts}=await import(`${dir}/deck-preview.mjs`);
const body='<main data-deck-slides><section data-deck-slide>原文と配置</section></main>';
const source=body+previousNavigation+previousDesign;
assert.equal(await upgradeDeckPreview(body+previousNavigation,true),body+navigationRuntime);
assert.equal(await upgradeDeckPreview(body+previousNavigation),body+previousNavigation);
assert.equal(await upgradeDeckPreview(body+previousNavigation.replace('data-deck-ready','data-deck-ready custom'),true),body+previousNavigation.replace('data-deck-ready','data-deck-ready custom'));
console.log('OK  発表者画面は既知の旧ナビゲーションだけ更新し、通常編集と独自コードは変えない');
// 雛形の説明書きが `<!--` を失って本文にはみ出した資料（実在）。説明の字はそのまま残し、本物の部品だけを替える。
const stray='\n<style> と <script> の 2 つを、この順のまま貼る\n';
assert.equal(await upgradeDeckPreview(body+stray+previousNavigation,true),body+stray+navigationRuntime);
assert.equal(await upgradeDeckPreview(body+stray+previousNavigation.replace('data-deck-ready','data-deck-ready custom'),true),body+stray+previousNavigation.replace('data-deck-ready','data-deck-ready custom'));
console.log('OK  説明書きがはみ出した資料でも、本物の標準部品だけを見分けて更新する');
assert.equal(await upgradeDeckPreview(source),body+navigationRuntime+designRuntime);
console.log('OK  追加属性を持つ既知の会社テーマだけ編集表示を更新し本文を保つ');
assert.equal(await upgradeDeckPreview(body+previousNavigation+deliveredDesign),body+navigationRuntime+designRuntime);
assert.equal(await upgradeDeckPreview(body+withVendorScripts(navigationRuntime+designRuntime)),body+navigationRuntime+designRuntime);
console.log('OK  配信時の素材参照に変わった既知の部品と現行の部品も認識する');
const custom=source.replace('reviewed previous design','custom design');
assert.equal(await upgradeDeckPreview(custom),custom);
assert.equal(await upgradeDeckPreview(source.replace('data-deck-diagonal','data-user-code')),source.replace('data-deck-diagonal','data-user-code'));
console.log('OK  実行処理も属性も完全一致しない資料には触れない');
const commented=`<!--${previousDesign}-->${custom}`;
assert.equal(await upgradeDeckPreview(commented),commented);
const reference=`<!--${previousNavigation}${previousDesign}-->`;
assert.equal(await upgradeDeckPreview(reference+source),reference+body+navigationRuntime+designRuntime);
console.log('OK  コメント内の標準部品を実行中の部品として認めない');
