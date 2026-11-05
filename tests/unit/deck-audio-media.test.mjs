/** 音声の形式と中身の頭、発表での始まり方（src/lib/deck/media/media.ts・video-upload.ts・play.ts）。 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:"export {uploadFileType,isAudioUploadType} from './src/lib/deck/media/media';export {hasVideoSignature} from './src/lib/deck/media/video-upload';export {deckPlayMode,deckPlayAttributeAllowed} from './src/lib/deck/media/play';"},bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
const lib=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

test('音声は MP3・M4A だけを受け、ブラウザの別名と拡張子も読む',()=>{
  assert.equal(lib.uploadFileType({type:'audio/mpeg',name:'a.mp3'}),'audio/mpeg');
  assert.equal(lib.uploadFileType({type:'audio/x-m4a',name:'a.m4a'}),'audio/mp4');
  assert.equal(lib.uploadFileType({type:'',name:'song.M4A'}),'audio/mp4');
  assert.equal(lib.uploadFileType({type:'',name:'song.mp3'}),'audio/mpeg');
  assert.equal(lib.uploadFileType({type:'audio/wav',name:'a.wav'}),null);
  assert.equal(lib.isAudioUploadType('audio/mp4'),true);
});

test('音声の中身の頭を確かめる（拡張子だけでは通さない）',()=>{
  const bytes=(...values)=>Uint8Array.from(values);
  const text=value=>Uint8Array.from([...value].map(char=>char.charCodeAt(0)));
  assert.equal(lib.hasVideoSignature(text('ID3\u0004\u0000\u0000\u0000'),'audio/mpeg'),true);
  assert.equal(lib.hasVideoSignature(bytes(0xff,0xfb,0x90,0x64),'audio/mpeg'),true);
  assert.equal(lib.hasVideoSignature(text('<html>'),'audio/mpeg'),false);
  assert.equal(lib.hasVideoSignature(text('\u0000\u0000\u0000 ftypM4A \u0000\u0000\u0000\u0000'),'audio/mp4'),true);
  assert.equal(lib.hasVideoSignature(text('RIFF\u0000\u0000\u0000\u0000WAVEfmt '),'audio/mp4'),false);
});

test('発表での始まりの既定と、編集の操作で付けてよい値',()=>{
  const node=(localName,attrs={})=>({localName,getAttribute:name=>attrs[name]??null});
  assert.equal(lib.deckPlayMode(node('audio')),'arrive');
  assert.equal(lib.deckPlayMode(node('video')),null,'動画は今までどおり再生ボタンで');
  assert.equal(lib.deckPlayMode(node('video',{'data-deck-play':'click'})),'click');
  assert.equal(lib.deckPlayAttributeAllowed('audio','data-deck-play','click'),true);
  assert.equal(lib.deckPlayAttributeAllowed('audio','data-deck-play','auto'),false);
  assert.equal(lib.deckPlayAttributeAllowed('p','loop',''),false);
  assert.equal(lib.deckPlayAttributeAllowed('audio','loop','yes'),false);
  assert.equal(lib.deckPlayAttributeAllowed('audio','muted',null),true);
  assert.equal(lib.deckPlayAttributeAllowed('p','alt','x'),true,'ほかの属性は見ない');
});
