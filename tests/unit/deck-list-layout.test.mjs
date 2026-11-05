import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
// スライドの一覧の並べ方（src/widget/deck/workspace/list-layout.ts）: 幅と列の数・行を改める枚・格子の矢印・覚えた列の数
const bundle=await build({entryPoints:['src/widget/deck/workspace/list-layout.ts'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
const {columnsForWidth, widthForColumns, listWidthRange, stepColumns, rowStarts, gridStep, rememberedColumns, FULL_COLUMNS, SPLIT_COLUMNS}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

test('列の数ちょうどの幅から測り直すと同じ列の数になり、その手前では 1 つ少ない', () => {
  for (const columns of SPLIT_COLUMNS) {
    assert.equal(columnsForWidth(widthForColumns(columns)), columns);
    if (columns > 1) assert.equal(columnsForWidth(widthForColumns(columns) - 1), columns - 1);
  }
  assert.equal(widthForColumns(1), 200, '1 列は今の縦一覧の幅');
  assert.equal(columnsForWidth(10000), 3, '広げても 1 枚の側に置く格子は 3 列まで');
});

test('引ける幅は縦一覧から、作業場の半分か 3 列＋1 枚ぶんの狭い方まで', () => {
  assert.deepEqual(listWidthRange(1600), {min: 200, max: Math.min(800, widthForColumns(3) + 152)});
  assert.deepEqual(listWidthRange(900), {min: 200, max: 450});
  assert.equal(listWidthRange(300).max, 200, '狭い作業場では広げられない');
});

test('- と = は隣の選択肢へ・端で止まる・選択肢に無い値からは近い側へ', () => {
  assert.equal(stepColumns(FULL_COLUMNS, 6, 1), 8);
  assert.equal(stepColumns(FULL_COLUMNS, 8, 1), 8);
  assert.equal(stepColumns(FULL_COLUMNS, 4, -1), 4);
  assert.equal(stepColumns(FULL_COLUMNS, 5, 1), 6);
  assert.equal(stepColumns(FULL_COLUMNS, 5, -1), 4);
});

test('章（子を持つ根）とその直後の根で行を改め、子と章の無い根は続けて並べる', () => {
  const entries = [
    {id: 'cover', parent: null}, {id: 'agenda', parent: null},
    {id: 'ch1', parent: null}, {id: 'a', parent: 'ch1'}, {id: 'a1', parent: 'a'}, {id: 'b', parent: 'ch1'},
    {id: 'ch2', parent: null}, {id: 'c', parent: 'ch2'},
    {id: 'end', parent: null}, {id: 'thanks', parent: null},
  ];
  assert.deepEqual([...rowStarts(entries)], ['ch1', 'ch2', 'end']);
  assert.deepEqual([...rowStarts(entries, new Set(['ch1']))], ['ch2', 'end'], '畳んだ章は 1 枚として前後と同じ行に流す');
  assert.deepEqual([...rowStarts([])], []);
  assert.deepEqual([...rowStarts([{id: 'x', parent: null}, {id: 'y', parent: null}])], [], '章の無い資料は折り返すだけ');
});

test('格子の矢印: 左右は前後の枚、上下は隣の行の一番近い列（行の長さが違っても）', () => {
  const boxes = [
    {id: '1', top: 0, left: 0}, {id: '2', top: 0, left: 100}, {id: '3', top: 0, left: 200},
    {id: '4', top: 80, left: 0},
    {id: '5', top: 160, left: 0}, {id: '6', top: 160, left: 100}, {id: '7', top: 160, left: 200},
  ];
  assert.equal(gridStep(boxes, '2', 'ArrowRight'), '3');
  assert.equal(gridStep(boxes, '3', 'ArrowRight'), '4', '行の端から次の行の頭へ（通し順）');
  assert.equal(gridStep(boxes, '1', 'ArrowLeft'), null);
  assert.equal(gridStep(boxes, '3', 'ArrowDown'), '4', '下の行が短ければその行の一番近い枚');
  assert.equal(gridStep(boxes, '4', 'ArrowDown'), '5');
  assert.equal(gridStep(boxes, '6', 'ArrowUp'), '4');
  assert.equal(gridStep(boxes, '2', 'ArrowUp'), null);
  assert.equal(gridStep(boxes, 'missing', 'ArrowUp'), null);
});

test('覚えた列の数は選択肢にあるときだけ使い、読めなければ既定', () => {
  assert.equal(rememberedColumns(() => '8', FULL_COLUMNS, 6), 8);
  assert.equal(rememberedColumns(() => '5', FULL_COLUMNS, 6), 6);
  assert.equal(rememberedColumns(() => null, FULL_COLUMNS, 6), 6);
  assert.equal(rememberedColumns(() => { throw new Error('blocked'); }, FULL_COLUMNS, 6), 6);
});
