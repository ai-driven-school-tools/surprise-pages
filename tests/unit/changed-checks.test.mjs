import assert from 'node:assert/strict';
import {test} from 'node:test';
import {checkInputs, GLOBAL_FILES, importTargets, parseLedger, pathTokens, relates, repoIndex, selectChecks, withLedger} from '../../scripts/ci/changed-checks.mjs';
import {alwaysReason, readTrace, uncovered} from '../../scripts/ci/trace-check-inputs.mjs';

const sources = {
 'tests/checks/check-a.mjs': 'import { root } from "./paths.mjs";\nconst text = read(`${root}/src/lib/access/access.ts`);\nawait build({ stdin: { contents: "import { x } from \'./src/widget/list\'" } });',
 'tests/checks/check-b.mjs': 'import "../../scripts/guard.mjs";\nfor (const folder of ["src/app"]) walk(folder);',
 'tests/checks/check-c.mjs': 'const page = read("docs/release.md");',
 'tests/checks/paths.mjs': 'export const root = new URL("../../", import.meta.url);',
 'scripts/guard.mjs': 'import { rule } from "./rules/rule.mjs"; const also = "scripts/other.mjs";',
 'scripts/rules/rule.mjs': 'export const rule = 1; // see scripts/far.mjs',
 'scripts/other.mjs': 'const more = "scripts/far.mjs";',
 'scripts/far.mjs': '',
 'src/lib/access/access.ts': 'import { db } from "@/lib/db/database";\n// 雛形は src/templates/deck.html・説明は src/lib/unrelated.ts',
 'src/lib/db/database.ts': 'export const db = 1;',
 'src/lib/unrelated.ts': '',
 'src/widget/list.ts': 'import "./shared";',
 'src/widget/shared.ts': '',
 'src/app/api/route.ts': 'import { helper } from "../../lib/helper";',
 'src/lib/helper.ts': '',
 'src/templates/deck.html': '<main>',
 'docs/release.md': '',
 'docs/other.md': '',
 'package.json': '{}',
};
const index = repoIndex(Object.keys(sources));
const read = async file => sources[file] ?? '';
const checks = ['check-a.mjs', 'check-b.mjs', 'check-c.mjs'];
const inputsOf = async () => Object.fromEntries(await Promise.all(checks.map(async check => [check, await checkInputs(check, index, read)])));

test('the text of a check, its imports, and walked folders decide what it relates to', async () => {
 const inputs = await inputsOf();
 const a = inputs['check-a.mjs'], b = inputs['check-b.mjs'];
 // named file, its import closure (through the alias), a file only its runtime reads, and code embedded as a string
 for (const file of ['src/lib/access/access.ts', 'src/lib/db/database.ts', 'src/templates/deck.html', 'src/widget/list.ts', 'src/widget/shared.ts', 'tests/checks/paths.mjs']) assert.ok(relates(a, file), file);
 // a name that only appears in a comment of src/lib/ code is not followed
 assert.equal(relates(a, 'src/lib/unrelated.ts'), false);
 assert.equal(relates(a, 'src/app/api/route.ts'), false);
 // a walked folder covers everything under it, plus what that code imports
 for (const file of ['src/app/api/route.ts', 'src/app/new-file.tsx', 'src/lib/helper.ts', 'scripts/guard.mjs', 'scripts/rules/rule.mjs', 'scripts/other.mjs']) assert.ok(relates(b, file), file);
 // text is read from the check and the scripts it names directly, not from scripts further away
 assert.equal(relates(b, 'scripts/far.mjs'), false);
 assert.deepEqual(importTargets('import a from "./a"; export {b} from \'../b\'; await import("./c.mjs"); require("./d")').sort(), ['../b', './a', './c.mjs', './d']);
 assert.ok(pathTokens('read(`${root}/src/app/(workspace)/page.tsx`)').includes('/src/app/(workspace)/page.tsx'));
});

test('unknown relations run everything; known ones run only the related checks', async () => {
 const inputs = await inputsOf();
 const select = (changed, always) => selectChecks({checks, changed, inputs, index, always});
 assert.deepEqual(select(['src/lib/db/database.ts']).files, ['check-a.mjs']);
 assert.deepEqual(select(['src/lib/db/database.ts', 'docs/release.md']).files, ['check-a.mjs', 'check-c.mjs']);
 assert.deepEqual(select(['tests/checks/check-b.mjs']).files, ['check-b.mjs']);
 // a shared helper belongs to every check that imports it
 assert.deepEqual(select(['tests/checks/paths.mjs']).files, ['check-a.mjs']);
 // fail towards running: unrelated file, deleted file, global file, missing base
 for (const changed of [['docs/other.md'], ['src/lib/db/database.ts', 'docs/other.md'], ['src/lib/removed.ts'], [GLOBAL_FILES[0]], null]) {
  assert.deepEqual(select(changed).files, checks, JSON.stringify(changed));
 }
 for (const file of ['package.json', 'pnpm-lock.yaml', 'scripts/ci/run-checks.mjs', 'tests/checks/baseline.json', 'scripts/ci/check-inputs.json']) assert.ok(GLOBAL_FILES.includes(file), file);
 assert.deepEqual(select([]).files, []);
 // a repository-wide check always runs, and does not count as "someone covers this file"
 assert.deepEqual(select(['src/lib/db/database.ts'], {'check-c.mjs': '全体を歩く'}).files, ['check-a.mjs', 'check-c.mjs']);
 assert.deepEqual(select(['docs/release.md'], {'check-c.mjs': '全体を歩く'}).files, checks);
});

test('the traced ledger adds what the text could not show, and a damaged ledger is refused', async () => {
 const inputs = await inputsOf();
 assert.equal(relates(inputs['check-c.mjs'], 'src/lib/helper.ts'), false);
 withLedger(inputs['check-c.mjs'], ['src/lib/helper.ts', 'src/app', 'src/lib/gone.ts'], index);
 assert.ok(relates(inputs['check-c.mjs'], 'src/lib/helper.ts'));
 assert.ok(relates(inputs['check-c.mjs'], 'src/app/anything.tsx'));
 assert.equal(relates(inputs['check-c.mjs'], 'src/lib/gone.ts'), false);
 for (const damaged of ['[]', '{}', '{"always":{},"extra":[]}', '{"always":{"x.mjs":"r"},"extra":{}}', '{"always":{"check-a.mjs":""},"extra":{}}', '{"always":{},"extra":{"check-a.mjs":[1]}}']) assert.throws(() => parseLedger(damaged), damaged);
 assert.deepEqual(parseLedger('{"always":{"check-a.mjs":"r"},"extra":{"check-b.mjs":["src/lib/x.ts"]}}').extra, {'check-b.mjs': ['src/lib/x.ts']});
});

test('traced reads are compared with the text, and repository-wide checks are marked', async () => {
 const trace = readTrace(['read\t/repo/src/lib/helper.ts', 'read\t/repo/docs', 'read\t/repo/docs/other.md', 'read\t/repo/node_modules/x/index.js', 'read\t/elsewhere/file', 'run\tesbuild', ''].join('\n'), '/repo');
 assert.deepEqual(trace.reads.sort(), ['docs', 'docs/other.md', 'node_modules/x/index.js', 'src/lib/helper.ts']);
 assert.equal(alwaysReason(trace), null);
 const c = await checkInputs('check-c.mjs', index, read);
 // the folder swallows the file under it; untracked reads (dependencies, build output) are not counted
 assert.deepEqual(uncovered(trace.reads, c, index), ['docs', 'src/lib/helper.ts']);
 assert.deepEqual(uncovered(['docs/release.md'], c, index), []);
 assert.ok(alwaysReason(readTrace('read\t/repo\n', '/repo')));
 assert.ok(alwaysReason(readTrace('run\tgit\n', '/repo')));
});

