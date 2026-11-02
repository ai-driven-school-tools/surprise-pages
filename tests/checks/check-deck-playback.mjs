import {build} from 'esbuild';import {JSDOM} from 'jsdom';import {root,dir} from './paths.mjs';import assert from 'node:assert/strict';
await build({stdin:{contents:"export * from './src/lib/deck/playback';export * from './src/lib/deck/media/video-source';export {pageToMarkdown} from './src/lib/pages/markdown';",resolveDir:root},outfile:dir+'/deck-playback.mjs',bundle:true,format:'esm',platform:'neutral'});
const {installDeckPlayback,releaseDeckVideo,activateDeckVideo,authoredMediaSource,writeMediaSource,pageToMarkdown}=await import(dir+'/deck-playback.mjs');
const dom=new JSDOM('<body data-deck><main data-deck-slides><section data-deck-slide><video src="movie.mp4" poster="poster.jpg" controls playsinline preload="none"></video><video controls playsinline preload="none"><source src="second.webm" type="video/webm"></video></section></main></body>',{pretendToBeVisual:true});
dom.window.HTMLMediaElement.prototype.pause=function(){};dom.window.HTMLMediaElement.prototype.load=function(){};
const [video,childVideo]=dom.window.document.querySelectorAll('video'),source=video.cloneNode(true),childSource=childVideo.cloneNode(true);
const ok=(name,value)=>{assert.ok(value,name);console.log('OK  '+name);};
releaseDeckVideo(video);ok('停止中は動画本体を参照せず、元の参照を保つ',video.getAttribute('src')===null&&authoredMediaSource(video)==='movie.mp4'&&video.getAttribute('poster')==='poster.jpg');
releaseDeckVideo(video);activateDeckVideo(video);ok('繰り返し停止して再開しても同じ標準HTMLに戻る',video.isEqualNode(source));
releaseDeckVideo(video);writeMediaSource(video,'updated.mp4');ok('停止中の同期で動画を勝手に読み始めない',video.getAttribute('src')===null&&authoredMediaSource(video)==='updated.mp4');
const markdown=pageToMarkdown({root:dom.window.document,title:'動画',url:'https://example.test/internal/demo',comments:[]});ok('停止中でも動画の参照を書き出せる',markdown.includes('[動画] updated.mp4'));
activateDeckVideo(video);ok('再開時には同期された参照を使う',video.getAttribute('src')==='updated.mp4');
releaseDeckVideo(childVideo);ok('sourceで書いた動画も停止中の参照を残す',authoredMediaSource(childVideo.querySelector('source'))==='second.webm'&&childVideo.querySelector('source').getAttribute('src')===null);
activateDeckVideo(childVideo);ok('sourceで書いた動画も属性と順番を保って戻る',childVideo.isEqualNode(childSource));

let visible=true;video.getBoundingClientRect=()=>({x:0,y:visible?0:2000,left:0,right:100,top:visible?0:2000,bottom:visible?100:2100,width:100,height:100});
installDeckPlayback(dom.window.document);visible=false;dom.window.document.dispatchEvent(new dom.window.Event('scroll'));visible=true;video.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));visible=false;dom.window.document.dispatchEvent(new dom.window.Event('scroll'));ok('再生せず操作をやめても、画面外では参照を再び外す',video.getAttribute('src')===null&&authoredMediaSource(video)==='updated.mp4');

let plays=0;video.play=()=>{plays++;return Promise.resolve();};visible=true;video.dispatchEvent(new dom.window.MouseEvent('pointerdown',{button:0,bubbles:true}));const click=new dom.window.MouseEvent('click',{bubbles:true,cancelable:true});video.dispatchEvent(click);ok('停止していた動画は一度のクリックで再生する',plays===1&&click.defaultPrevented);visible=false;dom.window.document.dispatchEvent(new dom.window.Event('scroll'));visible=true;const key=new dom.window.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true});video.dispatchEvent(key);const up=new dom.window.KeyboardEvent('keyup',{key:' ',bubbles:true,cancelable:true});video.dispatchEvent(up);ok('停止していた動画はSpaceでも一度だけ再生する',plays===2&&key.defaultPrevented&&up.defaultPrevented);

visible=false;dom.window.document.dispatchEvent(new dom.window.Event('scroll'));visible=true;video.controls=false;video.dispatchEvent(new dom.window.MouseEvent('pointerdown',{button:0,bubbles:true}));video.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true}));video.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));ok('編集中の動画を選択しても再生や読み込みを始めない',plays===2&&video.getAttribute('src')===null);dom.window.close();
