/** 発表者画面のキーの読み替えと飛ぶ先（src/widget/deck/present/keys.ts）。 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:"export * from './src/widget/deck/present/keys';"},bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
const lib=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

test('送るキーは Keynote の発表中と同じに読み替える',()=>{
  const key=(key,shiftKey=false,typed='')=>lib.presenterKeyAction({key,shiftKey},typed);
  for(const one of ['ArrowRight','ArrowDown','PageDown','Enter',' '])assert.deepEqual(key(one),{kind:'step',direction:1});
  assert.deepEqual(key('ArrowDown',true),{kind:'jump',to:'next-slide'});
  assert.deepEqual(key('ArrowLeft'),{kind:'jump',to:'previous-slide'});
  assert.deepEqual(key('ArrowLeft',true),{kind:'step',direction:-1});
  assert.deepEqual(key('PageUp'),{kind:'step',direction:-1});
  assert.deepEqual(key('Home'),{kind:'jump',to:'home'});
  assert.deepEqual(key('z'),{kind:'jump',to:'back'});
  assert.deepEqual(key('v'),{kind:'browse'});
  assert.deepEqual(key('Escape'),{kind:'none'});
  assert.equal(key('q'),null);
});

test('番号を打って Return でその枚へ。Backspace で 1 字消し、Escape でやめる',()=>{
  assert.deepEqual(lib.presenterKeyAction({key:'1',shiftKey:false},''),{kind:'type',typed:'1'});
  assert.deepEqual(lib.presenterKeyAction({key:'2',shiftKey:false},'1'),{kind:'type',typed:'12'});
  assert.deepEqual(lib.presenterKeyAction({key:'9',shiftKey:false},'1234'),{kind:'type',typed:'1234'});
  assert.deepEqual(lib.presenterKeyAction({key:'Enter',shiftKey:false},'12'),{kind:'jump',to:{number:12}});
  assert.deepEqual(lib.presenterKeyAction({key:'Backspace',shiftKey:false},'12'),{kind:'type',typed:'1'});
  assert.deepEqual(lib.presenterKeyAction({key:'Escape',shiftKey:false},'12'),{kind:'type',typed:''});
});

test('飛ぶ先: 端・前後・番号（範囲の外は端）・Z は見てきた枚を後ろからさかのぼる',()=>{
  const keys=['a','b','c','d'],jumps=lib.presenterJumps();
  assert.deepEqual(jumps.target(keys,'b','home'),{key:'a',step:0});
  assert.deepEqual(jumps.target(keys,'b','end'),{key:'d',step:0});
  assert.deepEqual(jumps.target(keys,'b','previous-slide'),{key:'a',step:Number.MAX_SAFE_INTEGER});
  assert.equal(jumps.target(keys,'a','previous-slide'),null);
  assert.deepEqual(jumps.target(keys,'b','next-slide'),{key:'c',step:0});
  assert.deepEqual(jumps.target(keys,'a',{number:99}),{key:'d',step:0});
  assert.equal(jumps.target(keys,'a',{number:0}),null);
  jumps.remember('a');jumps.remember('c');jumps.remember('gone');
  assert.deepEqual(jumps.target(keys,'d','back'),{key:'c',step:0},'もう無い枚は飛ばす');
  assert.deepEqual(jumps.target(keys,'c','back'),{key:'a',step:0});
  assert.equal(jumps.target(keys,'a','back'),null);
});

test('一覧に出すキーの行は、どれも文言の鍵を持つ',()=>{
  assert.ok(lib.PRESENTER_KEY_MAP.length>=8);
  for(const [label,keys] of lib.PRESENTER_KEY_MAP){assert.match(label,/^deckStudio\.presenter\./);assert.match(keys,/Keys$/);}
});
