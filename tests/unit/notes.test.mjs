import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

/*
 * メモ帳（清書のページを本文の上のまま直す）の検査。保管庫にもネットワークにも繋がない。
 *   サーバー … 送る形の本文を清書の形に組み直す（src/lib/notes/document.ts）。書けない形を断る・額縁と出典の札を引き継ぐ
 *   ブラウザ … 書ける形（ProseMirror のスキーマ）と台帳のブロックが 1 対 1 で、送る形がサーバーを通る（src/widget/editor/note-*.ts）
 *             清書の本文を黙って崩さずに直せるかの判定（src/widget/editor/note-fidelity.ts）
 */
const dir=await mkdtemp(path.join(tmpdir(),'notes-'));
test.after(()=>rm(dir,{recursive:true,force:true}));
const FIXTURE=await readFile('tests/checks/fixtures/clean-copy/current.html','utf8');

const serverOut=path.join(dir,'server.mjs');
await build({entryPoints:['src/lib/notes/document.ts'],bundle:true,platform:'node',format:'esm',outfile:serverOut,logLevel:'silent'});
const server=await import(pathToFileURL(serverOut).href);

const dom=new JSDOM('<!doctype html><html><head></head><body></body></html>');
for(const name of ['window','document','Node','HTMLElement','Element','DOMParser','navigator','MutationObserver','getComputedStyle'])
  Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:dom.window[name],configurable:true,writable:true});
const widgetEntry=path.join(dir,'widget-entry.ts');
await writeFile(widgetEntry,[
  `export * from ${JSON.stringify(path.resolve('src/widget/editor/note-schema.ts'))};`,
  `export { blockCommand } from ${JSON.stringify(path.resolve('src/widget/editor/note-block-edit.ts'))};`,
  `export { noteFaithful } from ${JSON.stringify(path.resolve('src/widget/editor/note-fidelity.ts'))};`,
  `export { NOTE_BLOCKS } from ${JSON.stringify(path.resolve('src/lib/notes/blocks.ts'))};`,
  `export { EditorState, TextSelection } from "prosemirror-state";`,
].join('\n'));
const widgetOut=path.join(dir,'widget.mjs');
await build({entryPoints:[widgetEntry],bundle:true,platform:'node',format:'esm',outfile:widgetOut,logLevel:'silent',nodePaths:[path.resolve('node_modules')]});
const widget=await import(pathToFileURL(widgetOut).href);

const mainOf=(html)=>new dom.window.DOMParser().parseFromString(html,'text/html').querySelector('main[data-clean-copy-document]');

test('送る形の本文を、清書の額縁の main の中身に組み直す（題・節・出典の札・メモの印）',()=>{
  const base=FIXTURE.replace('<!-- CONTENT_END -->','<p data-source-note class="text-xs text-ads-muted mt-20">in.md · 本文 10 字</p>\n<!-- CONTENT_END -->');
  const {html,name}=server.composeNote({title:'新しい題',body:'<p>はじめ</p><h2>節</h2><p>中身 <strong>強く</strong></p>',base});
  assert.equal(name,'新しい題');
  assert.match(html,/<title>新しい題<\/title>/);
  assert.match(html,/<main data-note-document="" data-clean-copy-document=""/);
  assert.match(html,/<h1 class="[^"]+">新しい題<\/h1>/);
  assert.match(html,/<section class="[^"]+">\n<h2 class="[^"]+">節<\/h2>/);
  assert.match(html,/<p data-source-note[^>]*>in\.md · 本文 10 字<\/p>\n<\/main>|<p data-source-note[^>]*>in\.md · 本文 10 字<\/p>\n\s*<\/main>/);
  assert.equal(html.includes('清書の見本'),false,'前の本文は残らない');
  // main の外（head・額縁の仕掛け）は直す前と同じ
  assert.equal(html.slice(0,html.indexOf('<main')),base.slice(0,base.indexOf('<main')).replace('<title>清書の見本</title>','<title>新しい題</title>').replace(/(<meta property="og:title" content=")[^"]*/,'$1新しい題'));
});

test('題が空なら、名前は本文の冒頭（最初の「。」の手前まで）',()=>{
  const {html,name}=server.composeNote({title:'',body:'<p>今日の打ち合わせ。続き</p>',base:FIXTURE});
  assert.equal(name,'今日の打ち合わせ');
  assert.equal(/<h1\b/.test(html.slice(html.indexOf('<main'))),false);
});

test('書けない形・仕掛け・よその行き先は断る',()=>{
  for(const body of [
    '<p class="x">クラス</p>','<p onclick="x()">仕掛け</p>','<script>alert(1)</script>','<iframe src="https://example.com"></iframe>',
    '<p><a href="javascript:alert(1)">x</a></p>','<p><a href="../other">相対のリンク</a></p>','<div>囲み</div>',
    '<figure data-kind="image" data-src="https://example.com/a.png" data-alt=""></figure>',
    '<figure data-kind="image" data-src="../other/a.png" data-alt=""></figure>',
    '<figure data-kind="image" data-src="/abs.png" data-alt=""></figure>',
    '<figure data-embed="vimeo" data-id="abcdefghijk"></figure>',
  ]) assert.throws(()=>server.composeNote({title:'',body,base:FIXTURE}),(error)=>error instanceof server.NoteBodyError,body);
});

test('絵は素材の口が作った名前か、ページの中の相対の道筋だけ',()=>{
  assert.equal(server.isNoteMediaPath('_deck/media-'+'a'.repeat(64)+'.webp','image'),true);
  assert.equal(server.isNoteMediaPath('images/figure-1.png','image'),true);
  assert.equal(server.isNoteMediaPath('images/../../x.png','image'),false);
  assert.equal(server.isNoteMediaPath('a.mp4','image'),false);
  const {html}=server.composeNote({title:'',body:'<figure data-kind="image" data-src="images/a.png" data-alt="図">添え書き</figure>',base:FIXTURE});
  assert.match(html,/<figure data-note-media="image"><img src="images\/a\.png" alt="図" class="[^"]+"><figcaption/);
});

test('埋め込みは本文に枠を書かず、元の動画へのリンクの箱で残す',()=>{
  const {html}=server.composeNote({title:'',body:'<figure data-embed="youtube" data-id="dQw4w9WgXcQ"></figure>',base:FIXTURE});
  assert.equal(/<iframe/.test(html),false);
  assert.match(html,/<a href="https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ" data-note-embed-frame=""/);
});

test('清書の見本は、メモ帳で崩さずに直せる（字・絵・リンクが読み直す前と同じ）',()=>{
  const main=mainOf(FIXTURE);
  const doc=widget.parseNoteMain(main);
  assert.equal(widget.noteFaithful(main,doc),true);
  assert.equal(widget.titleText(doc),'清書の見本');
});

test('書けない部分（図・脚注・ページの中のリンク）がある清書には乗らない',()=>{
  for(const extra of ['<pre class="mermaid">graph TD; A--&gt;B</pre>','<p>注<sup>1</sup></p>','<p><a href="#fn1">脚注へ</a></p>','<article data-clean-copy-source-id="a"><p>束</p></article>']){
    const main=mainOf(FIXTURE.replace('<!-- CONTENT_END -->',`${extra}\n<!-- CONTENT_END -->`));
    assert.equal(widget.noteFaithful(main,widget.parseNoteMain(main)),false,extra);
  }
});

test('清書の見本を読み直して送る形にすると、サーバーがそのまま受け取る（往復）',()=>{
  const doc=widget.parseNoteMain(mainOf(FIXTURE));
  const body=widget.bodyHtml(doc);
  const first=server.composeNote({title:widget.titleText(doc),body,base:FIXTURE});
  // 保存したページを開き直して送り直しても、同じ本文になる（直していないのに版の中身が揺れない）
  const again=widget.parseNoteMain(mainOf(first.html));
  assert.equal(server.composeNote({title:widget.titleText(again),body:widget.bodyHtml(again),base:first.html}).html,first.html);
});

test('台帳のブロックは全部、置ける・送る形がサーバーを通る',()=>{
  const S=widget.noteSchema.nodes;
  for(const block of widget.NOTE_BLOCKS){
    // 段落へ戻す操作は段落の上では何もしないので、見出しから始める
    const line=block.id==='paragraph'?S.heading.create({level:2},widget.noteSchema.text('字')):S.paragraph.create(null,widget.noteSchema.text('字'));
    const doc=S.doc.create(null,[S.title.create(),line]);
    let state=widget.EditorState.create({schema:widget.noteSchema,doc});
    state=state.apply(state.tr.setSelection(widget.TextSelection.create(state.doc,4)));
    assert.equal(widget.blockCommand(block.id)(state),true,`${block.id} を置ける`);
    if(['embed','image','video'].includes(block.id))continue;
    let next=state;
    widget.blockCommand(block.id)(state,(tr)=>{next=state.apply(tr);});
    const body=widget.bodyHtml(next.doc);
    assert.doesNotThrow(()=>server.composeNote({title:'',body,base:FIXTURE}),`${block.id}: ${body}`);
  }
});
