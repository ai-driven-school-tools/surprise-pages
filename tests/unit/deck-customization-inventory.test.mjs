import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const dir=await mkdtemp(path.join(tmpdir(),'deck-inventory-'));
try {
 const out=path.join(dir,'inventory.mjs');await build({entryPoints:['src/lib/deck/edit/customization-dom.ts'],bundle:true,platform:'node',format:'esm',outfile:out});
 const {readDeckCustomization}=await import(pathToFileURL(out).href);
 const read=(body)=>readDeckCustomization(new JSDOM(`<body data-deck><main data-deck-slides>${body}</main></body>`).window.document);
 const slide=(id,body)=>`<section data-deck-slide data-deck-id="${id}">${body}</section>`;
 const value=read(slide('one','<p data-dd-element-id="shared" data-dd-node-id="shared">one</p>')+slide('two','<p data-dd-element-id="shared">two</p>'));
 assert.ok(value);assert.equal([...value.inventory.values()].reduce((sum,ids)=>sum+ids.size,0),3);
 assert.equal(read(slide('one','<p data-dd-element-id="same"></p><span data-dd-element-id="same"></span>')),null);
 assert.equal(read(slide('one','<p data-dd-node-id="invalid id"></p>')),null);
 assert.equal(read(slide('one','')+slide('one','')),null);
 // Validation still runs even without authored focus settings.
 assert.equal(read(slide('one','<p data-dd-cell-id=""></p>')),null);
 console.log('OK  combined inventory scan preserves IDs, per-kind duplicates and invalid-setting rejection');
} finally {await rm(dir,{recursive:true,force:true});}
