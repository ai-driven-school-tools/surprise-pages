/**
 * スライドの編集画面の「並べる」部品の計算（描かずに確かめられる分）。画面を通した確かめは tests/checks/browser/deck-arrange.mjs。
 * レイヤーの木と並べ替えの段取り・前面へ／背面へ・吸い付き・まとめた拡大・図形の持ち手・右クリックのメニューの並び・選んだ字だけの見た目。
 */
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { root, dir } from './paths.mjs';
let fails = 0;
function ok(label, actual, expected = true) { const pass = JSON.stringify(actual) === JSON.stringify(expected); console.log(`${pass ? 'OK  ' : 'NG  '} ${label}`); if (!pass) { fails++; console.log('   ', JSON.stringify(actual)); } }
async function load(entry, name) {
  await build({ entryPoints: [`${root}/${entry}`], outfile: `${dir}/${name}.mjs`, bundle: true, format: 'esm', platform: 'neutral' });
  return import(`${dir}/${name}.mjs`);
}
const tree = await load('src/widget/deck/edit/layer-tree.ts', 'layer-tree');
const order = await load('src/widget/deck/edit/layer-order.ts', 'layer-order');
const snap = await load('src/widget/deck/canvas-snap.ts', 'canvas-snap');
const multi = await load('src/widget/deck/canvas-multi-resize.ts', 'canvas-multi-resize');
const shape = await load('src/widget/deck/canvas-shape-box.ts', 'canvas-shape-box');
const menu = await load('src/widget/deck/edit/element-menu.ts', 'element-menu');

// レイヤーの木: 上ほど前面。z-index が DOM の順に勝つ
const node = (id, extra = {}) => ({ id, parent: null, groups: [], kind: 'text', label: id, locked: false, listed: true, band: 1, z: 0, applies: false, dom: 0, ...extra });
const nodes = [node('a', { dom: 0 }), node('b', { dom: 1 }), node('c', { dom: 2, band: 3, z: 5, applies: true })];
ok('上ほど前面（z-index の正は位置指定の無い要素より前）', tree.layerRows(nodes).map((row) => row.key), ['c', 'b', 'a']);
const drop = tree.planLayerDrop(nodes, 'a', 'c', 'before');
ok('いちばん後ろを先頭の上へ落とすと z-index を振り直す', drop.styles.filter((style) => style.property === 'z-index').map((style) => [style.id, style.value]), [['b', '1'], ['c', '2'], ['a', '3']]);
ok('位置指定の無い要素には relative を足す', drop.styles.filter((style) => style.property === 'position').map((style) => style.id), ['b', 'a']);
ok('別の入れ物への移動は断る', tree.planLayerDrop([...nodes, node('d', { parent: 'box', dom: 3 }), node('box', { dom: 4, kind: 'box' })], 'd', 'a', 'before'), { error: 'deckEditor.layers.otherBox' });
ok('自分の上へは落とせない', tree.planLayerDrop(nodes, 'a', 'a', 'before'), { error: 'deckEditor.layers.cannotMove' });
const fold = [node('box', { kind: 'box' }), node('x', { parent: 'box', dom: 1 })];
ok('入れ物の中の要素は 1 段下に並ぶ', tree.layerRows(fold).map((row) => [row.key, row.depth]), [['box', 0], ['x', 1]]);

// 前面へ・背面へ: 重なっている相手より 1 つ上へ。重ならない相手は見ない
const box = (id, parentId, rect, extra = {}) => ({ id, parentId, z: null, applies: false, context: false, rect, ...extra });
const boxes = [box('s', null, { left: 0, top: 0, right: 100, bottom: 100 }, { context: true }), box('a', 's', { left: 0, top: 0, right: 50, bottom: 50 }), box('b', 's', { left: 10, top: 10, right: 60, bottom: 60 }, { z: 3, applies: true, context: true }), box('far', 's', { left: 80, top: 80, right: 90, bottom: 90 }, { z: 9, applies: true, context: true })];
ok('前面へは重なっている相手より 1 つ上', order.planLayerOrder(boxes, ['a'], 'front'), [{ id: 'a', property: 'position', value: 'relative' }, { id: 'a', property: 'z-index', value: '4' }]);
ok('背面へは相手を自分より上へ出す', order.planLayerOrder(boxes, ['b'], 'back'), [{ id: 'a', property: 'position', value: 'relative' }, { id: 'a', property: 'z-index', value: '4' }]);

// 吸い付き: 5px 以内ならスライドの中央に合わせ、スライドの線は破線（slide）
const targets = snap.snapTargets({ left: 0, top: 0, width: 1000, height: 500 }, [{ left: 100, top: 100, width: 50, height: 40 }]);
const moved = snap.snapMove({ left: 448, top: 300, width: 100, height: 20 }, targets);
ok('動かすとスライドの中央に吸い付く', [moved.dx, moved.guides.x], [2, 500]);
ok('スライドの線は slide、部品の線は part', moved.guides.lines.map((line) => line.kind), ['slide']);
ok('離れていれば吸い付かない', snap.snapMove({ left: 300, top: 300, width: 100, height: 20 }, targets).dx, 0);
ok('部品の端に合わせると相手を示す', snap.snapMove({ left: 152, top: 300, width: 100, height: 20 }, targets).guides.refs?.length, 1);
ok('辺を引くと同じ幅にそろえる', snap.snapEdges({ left: 600, top: 300, width: 48, height: 30 }, { x: 1, y: 0 }, targets).box.width, 50);

// まとめた拡大: 反対の角を止め、同じ比で大きくし、位置関係を保つ
const parts = [{ left: 0, top: 0, width: 100, height: 50, scale: 1, origin: { x: 0, y: 0 } }, { left: 200, top: 100, width: 100, height: 50, scale: 1, origin: { x: 0, y: 0 } }];
const area = multi.selectionBox(parts);
const factor = multi.scaleFactor(area, { x: 1, y: 1 }, { x: 150, y: 0 });
ok('右下を横に 150 引くと 1.5 倍', factor, 1.5);
ok('左上は止まり、2 つ目は比の分だけずれる', multi.scaleParts(parts, multi.scaleAnchor(area, { x: 1, y: 1 }), factor), [{ shift: { x: 0, y: 0 }, scale: 1.5 }, { shift: { x: 100, y: 50 }, scale: 1.5 }]);
ok('中央の原点は 0 0 に直した分もずらす', multi.scaleParts([{ ...parts[0], origin: { x: 50, y: 25 }, scale: 2 }], { x: 0, y: 0 }, 1)[0].shift, { x: -50, y: -25 });
ok('transform-origin の語を px に直す', multi.transformOriginPoint('right bottom', { width: 200, height: 100 }), { x: 200, y: 100 });

// 図形の持ち手: 引いた辺だけを動かし、左・上は translate に足す
ok('右の辺は幅だけ', shape.resizeFromHandle({ width: 100, height: 50 }, { x: 1, y: 0 }, { x: 30, y: 20 }, false), { width: 130, height: 50, shift: { x: 0, y: 0 } });
ok('左の辺は左へずらす', shape.resizeFromHandle({ width: 100, height: 50 }, { x: -1, y: 0 }, { x: -30, y: 0 }, false), { width: 130, height: 50, shift: { x: -30, y: 0 } });
ok('Shift の角は縦横の比を保つ', shape.resizeFromHandle({ width: 100, height: 50 }, { x: 1, y: 1 }, { x: 100, y: 10 }, true), { width: 200, height: 100, shift: { x: 0, y: 0 } });
ok('裏返らず 16px で止まる', shape.resizeFromHandle({ width: 100, height: 50 }, { x: 1, y: 0 }, { x: -500, y: 0 }, false).width, 16);

// 右クリックのメニュー: いまできない操作は出さない
const actions = (state) => menu.elementMenuSections({ count: 1, locked: false, grouped: false, canPaste: false, ...state }).flat().map((row) => row.action);
ok('何も選んでいなければすべて選択だけ', actions({ count: 0 }), ['select-all']);
ok('固定した要素は写すと解除だけ', actions({ locked: true }), ['copy', 'unlock']);
ok('1 つならグループ化も等間隔も出さない', ['group', 'distribute-horizontal', 'ungroup'].some((action) => actions({}).includes(action)), false);
ok('3 つ以上で等間隔、2 つ以上でグループ化', ['group', 'distribute-horizontal'].every((action) => actions({ count: 3 }).includes(action)), true);
ok('削除はいちばん下', actions({ count: 2 }).at(-1), 'delete');
const runs = [];
menu.runElementMenuAction('left', { command: (value) => runs.push(['command', value]), align: (value) => runs.push(['align', value]), distribute: (value) => runs.push(['distribute', value]), reorder: (value) => runs.push(['reorder', value]), lock: (value) => runs.push(['lock', value]), selectAll: () => runs.push(['all']) });
menu.runElementMenuAction('front', { command: (value) => runs.push(['command', value]), align: (value) => runs.push(['align', value]), distribute: (value) => runs.push(['distribute', value]), reorder: (value) => runs.push(['reorder', value]), lock: (value) => runs.push(['lock', value]), selectAll: () => runs.push(['all']) });
ok('メニューの行を揃え・重なり順へつなぐ', runs, [['align', 'left'], ['reorder', 'front']]);

// 選んだ字だけの見た目: 字の番号で範囲を言い、またいだ所ごとに囲む。同じ字を直すときは入れ子にしない
const dom = new JSDOM('<p data-deck-node="p">前の<strong data-deck-node="b">太字</strong>後ろ</p>');
const textStyle = await load('src/widget/deck/edit/text-style.ts', 'text-style');
const paragraph = dom.window.document.querySelector('p');
let id = 0;
const ids = textStyle.styleDeckTextRange(paragraph, 1, 3, [['color', '#cc3300']], () => `n-${++id}`);
ok('またいだ所ごとに囲む', ids, ['n-1', 'n-2']);
ok('字は変えずに span で囲む', paragraph.innerHTML, '前<span data-deck-node="n-1" style="color: rgb(204, 51, 0);">の</span><strong data-deck-node="b"><span data-deck-node="n-2" style="color: rgb(204, 51, 0);">太</span>字</strong>後ろ');
ok('同じ字をもう一度直すと前の囲みに付け直す', textStyle.styleDeckTextRange(paragraph, 1, 2, [['font-weight', '700']], () => `n-${++id}`), ['n-1']);
const range = dom.window.document.createRange(); range.setStart(paragraph.lastChild, 0); range.setEnd(paragraph.lastChild, 2);
ok('選んだ範囲を箱の中の字の番号にする', textStyle.deckTextOffsets(paragraph, range), { start: 4, end: 6 });

if (fails) { console.error(`${fails} 件失敗`); process.exit(1); }
