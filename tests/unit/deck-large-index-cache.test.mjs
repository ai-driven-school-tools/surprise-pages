import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const dir=await mkdtemp(path.join(tmpdir(),'deck-large-index-'));
try {
 const out=path.join(dir,'source.mjs');await build({stdin:{contents:"export * from './src/lib/html/source-index';export {deckSettingsComparison} from './src/lib/deck/edit/source';export {updateDeckSourceDocument} from './src/widget/deck/edit/source-document';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:out});
 const m=await import(pathToFileURL(out).href);
 const html=title=>`<html><head><title>${title}</title></head><body data-deck><main data-deck-slides><section data-deck-slide data-deck-node="one" data-deck-id="one"><p>${'x'.repeat(3*1024*1024)}</p></section></main></body></html>`;
 const before=html('before'),after=html('after');m.sourceTree(before);m.sourceTree(after);
 assert.ok(m.sourceTreeEntry(before));assert.ok(m.sourceTreeEntry(after));
 const a=m.deckSettingsComparison(before),b=m.deckSettingsComparison(after);assert.ok(a&&b);assert.equal(a.body,b.body);assert.ok(a.minimal.length<500);assert.ok(b.minimal.length<500);
 const parse=value=>new JSDOM(value).window.document,doc=parse(before),body=doc.body;
 assert.equal(m.updateDeckSourceDocument(before,after,doc,parse),doc);assert.equal(doc.body,body);assert.equal(doc.title,'after');
 const changedBody=after.replace('<p>x','<p>y');m.sourceTree(changedBody);const rebuilt=m.updateDeckSourceDocument(after,changedBody,doc,parse);assert.equal(rebuilt,doc);assert.ok(rebuilt.querySelector('p').textContent.startsWith('y'));
 const changedRoot=after.replace('<html>','<html lang="ja">');m.sourceTree(after);m.sourceTree(changedRoot);assert.equal(m.updateDeckSourceDocument(after,changedRoot,doc,parse).documentElement.lang,'ja');
 const malformed='<html><head><html lang="en"><title>title</title></head><body data-deck><p>text</p></body></html>',language=malformed.replace('lang="en"','lang="ja"');
 m.sourceTree(malformed);m.sourceTree(language);const prior=parse(malformed),updated=m.updateDeckSourceDocument(malformed,language,prior,parse);assert.notEqual(updated,prior);assert.equal(updated.documentElement.lang,'ja');
 for(let i=0;i<4;i++)m.sourceTree(html(String(i)));
 assert.equal(m.sourceTreeEntry(before),undefined);
 console.log('OK  consecutive large revisions retain compact setting comparisons; older revisions remain bounded');
} finally {await rm(dir,{recursive:true,force:true});}
