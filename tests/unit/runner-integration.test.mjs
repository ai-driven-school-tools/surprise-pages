import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);

test('runner fails for missing, empty, crashed and reduced checks without rewriting inventory',async()=>{
  const temp=await mkdtemp(path.join(tmpdir(),'pages-runner-test-'));
  try {
    // 本物と同じ置き方（scripts/ci/ の番人と tests/checks/ の検査表）で写す
    await mkdir(path.join(temp,'scripts/ci'),{recursive:true});
    await mkdir(path.join(temp,'tests/checks'),{recursive:true});
    await cp(new URL('../../scripts/ci/run-checks.mjs',import.meta.url),path.join(temp,'scripts/ci/run-checks.mjs'));
    await cp(new URL('../../scripts/ci/check-results.mjs',import.meta.url),path.join(temp,'scripts/ci/check-results.mjs'));
    const inventory=JSON.stringify({'check-a.mjs':{items:2,sections:0}});
    const baseline=path.join(temp,'tests/checks/baseline.json');
    const check=path.join(temp,'tests/checks/check-a.mjs');
    const run=()=>exec(process.execPath,[path.join(temp,'scripts/ci/run-checks.mjs'),'--update'],{timeout:10000});
    await writeFile(baseline,inventory);
    // Missing file also fails when someone asks to update the inventory.
    await assert.rejects(run());
    for (const source of ["console.log('no tests')", "throw new Error('simulated crash')",
      "console.log('OK one')", "console.log('OK one');console.log('NG two')"]) {
      await writeFile(check,source);
      await assert.rejects(run());
      assert.equal(await readFile(baseline,'utf8'),inventory);
    }
    await writeFile(check,"console.log('OK one');console.log('OK two');console.log('OK three')");
    await run();
    assert.equal(JSON.parse(await readFile(baseline,'utf8'))['check-a.mjs'].items,3);
    await writeFile(baseline,'{broken');
    await assert.rejects(run());
  } finally {await rm(temp,{recursive:true,force:true});}
});
