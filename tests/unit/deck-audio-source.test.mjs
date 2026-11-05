/** スライドの音声を置く・始まり方を変える・取り消すが、原稿の操作として正しく往復することを確かめる（src/lib/deck/edit/source.ts）。 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:"export {applyDeckEditOperations,deckSourceOutline,prepareDeckEdit} from './src/lib/deck/edit/source';export {deckEditOperationSchema} from './src/lib/deck/edit/model';"},bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
const lib=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const deck=lib.prepareDeckEdit('<!doctype html><html><head><title>検査</title></head><body data-deck><main data-deck-slides><section data-deck-slide><h1>休憩</h1></section></main></body></html>').html;
const slide=lib.deckSourceOutline(deck)[0].id;
const src='_deck/media-11111111-2222-3333-4444-555555555555.mp3';
const insert={kind:'insert',target:slide,node:{id:'node-audio',tag:'audio',src,label:'休憩の音楽',play:'arrive',loop:true,style:{position:'absolute',left:'460px',top:'600px',width:'360px',height:'54px'}}};

test('音声を置くと、再生前に読み込まない再生バーと始まり・繰り返しの属性で入り、取り消すと消える',()=>{
  assert.equal(lib.deckEditOperationSchema.safeParse(insert).success,true);
  const placed=lib.applyDeckEditOperations(deck,[insert]);
  assert.match(placed.html,/<audio [^>]*controls preload="none" loop data-deck-play="arrive" aria-label="休憩の音楽" src="_deck\/media-[^"]+\.mp3"><\/audio>/);
  assert.equal(lib.applyDeckEditOperations(placed.html,placed.inverse).html,deck);
});

test('始まり・繰り返し・ミュートは属性の操作で付け外しでき、ほかの値と音声以外には付けられない',()=>{
  const placed=lib.applyDeckEditOperations(deck,[insert]).html;
  const click=lib.applyDeckEditOperations(placed,[{kind:'attribute',target:'node-audio',name:'data-deck-play',before:'arrive',after:'click'},{kind:'attribute',target:'node-audio',name:'loop',before:'',after:null},{kind:'attribute',target:'node-audio',name:'muted',before:null,after:''}]);
  assert.match(click.html,/data-deck-play="click"/);
  assert.doesNotMatch(click.html,/ loop[ >=]/);
  assert.match(click.html,/ muted[ >=]/);
  // 戻すと同じ属性になる（付け直した属性は末尾に並ぶ）
  const undone=lib.applyDeckEditOperations(click.html,click.inverse).html;
  assert.match(undone,/data-deck-play="arrive"/);assert.match(undone,/ loop(="")?[ >]/);assert.doesNotMatch(undone,/ muted/);
  assert.throws(()=>lib.applyDeckEditOperations(placed,[{kind:'attribute',target:'node-audio',name:'data-deck-play',before:'arrive',after:'auto'}]));
  const heading=/<h1 data-deck-node="([^"]+)"/.exec(placed)?.[1];
  assert.ok(heading);
  assert.throws(()=>lib.applyDeckEditOperations(placed,[{kind:'attribute',target:heading,name:'loop',before:null,after:''}]));
});

test('置いた音声を消して戻すと、変えた始まり・繰り返しのまま戻る',()=>{
  const placed=lib.applyDeckEditOperations(deck,[insert]).html;
  const changed=lib.applyDeckEditOperations(placed,[{kind:'attribute',target:'node-audio',name:'data-deck-play',before:'arrive',after:'click'}]).html;
  const html=/<audio[^>]*><\/audio>/.exec(changed)[0];
  const removed=lib.applyDeckEditOperations(changed,[{kind:'remove',target:'node-audio',before:html}]);
  assert.doesNotMatch(removed.html,/<audio/);
  assert.equal(lib.applyDeckEditOperations(removed.html,removed.inverse).html,changed);
});
