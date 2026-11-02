import {test} from 'node:test';
import assert from 'node:assert/strict';
import {failureLines} from '../../scripts/ci/check-results.mjs';

test('a failed item is named in the report, with the lines that explain it', () => {
  const stdout = ['--- 1. 節 ---', 'OK   通った項目: 1（期待: 1）', 'NG   落ちた項目: 2（期待: 3）', '  直し方: こうする', 'OK   次の項目: true（期待: true）', 'NG  もう 1 つ落ちた: x'].join('\n');
  assert.deepEqual(failureLines(stdout), ['NG   落ちた項目: 2（期待: 3）', '  直し方: こうする', 'NG  もう 1 つ落ちた: x']);
});
test('passing output yields nothing, and a long list is cut with a count of the rest', () => {
  assert.deepEqual(failureLines('OK   a\nOK   b\n'), []);
  const many = Array.from({length: 30}, (_, index) => `NG   項目 ${index}`).join('\n');
  const lines = failureLines(many, 5);
  assert.equal(lines.length, 6);
  assert.match(lines.at(-1), /ほか 25 件/);
});
test('one item cannot flood the report: its explanation is limited to a few lines and each line to a fixed width', () => {
  const stdout = ['NG   長い項目: ' + 'x'.repeat(2000), ...Array.from({length: 20}, (_, index) => `  説明 ${index}`), 'OK   次'].join('\n');
  const lines = failureLines(stdout);
  assert.ok(lines.length <= 5);
  assert.ok(lines.every(line => line.length <= 400));
});
