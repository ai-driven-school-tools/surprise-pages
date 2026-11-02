import { build } from "esbuild";
import { root, dir } from "./paths.mjs";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

let failures = 0;
function ok(label, actual, expected = true) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${pass ? "OK  " : "NG  "} ${label}`);
  if (!pass) failures++;
}
await build({ entryPoints: [`${root}/src/lib/deck/design/flow-layout.ts`], outfile: `${dir}/deck-flow-layout.mjs`, bundle: true, format: "esm", platform: "node" });
await build({ entryPoints: [`${root}/src/deck-design/flow-source.ts`], outfile: `${dir}/deck-flow-source.mjs`, bundle: true, format: "esm", platform: "node" });
const { layoutDeckFlow, DECK_FLOW_METRICS, wrapDeckFlowText } = await import(`${dir}/deck-flow-layout.mjs`);
const { readDeckFlowSource } = await import(`${dir}/deck-flow-source.mjs`);
const node = (id, label = id) => ({ id, label, shape: "box" });
const edge = (id, from, to, label = "") => ({ id, from, to, label });
const size = { width: 1152, height: 420, measureText: (text, fontSize) => [...text].length * fontSize };
const chain = { nodes: [node("a", "調べる"), node("b", "試す"), node("c", "決める")], edges: [edge("ab", "a", "b", "仮説"), edge("bc", "b", "c", "結果")], groups: [] };
const branch = { nodes: [node("a", "申請"), { ...node("b", "条件を満たすか"), shape: "decision" }, node("c", "承認"), node("d", "見直す")], edges: [edge("ab", "a", "b"), edge("yes", "b", "c", "はい"), edge("no", "b", "d", "いいえ")], groups: [] };
const overlap = (a, b) => Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) + .01 && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y) + .01;
function safe(result) {
  return result !== null && result.nodes.every((n, i) => n.x >= 0 && n.y >= 0 && n.x + n.width <= size.width + .01 && n.y + n.height <= size.height + .01 && result.nodes.every((other, j) => i === j || !overlap(n, other))) && result.edges.every(e => e.points.length >= 2 && e.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
}
for (const format of ["flow-sequence", "flow-state", "flow-input-output", "flow-causal"]) {
  const result = layoutDeckFlow(chain, format, "horizontal", size);
  ok(`${format}:節点が重ならず原寸で収まる`, safe(result));
  ok(`${format}:原稿のIDと条件文を維持`, result?.edges.map(e => [e.id, e.label]), chain.edges.map(e => [e.id, e.label]));
}
const horizontal = layoutDeckFlow(chain, "flow-sequence", "horizontal", size);
const vertical = layoutDeckFlow(chain, "flow-sequence", "vertical", size);
ok("横と縦の構図を実際の配置に反映", safe(vertical) && horizontal.nodes[0].x < horizontal.nodes[1].x && vertical.nodes[0].y < vertical.nodes[1].y);
const decision = layoutDeckFlow(branch, "flow-branch", "decision", size);
ok("分岐先2つと条件文を別の場所に置く", safe(decision) && decision.nodes[2].y !== decision.nodes[3].y && decision.edges.filter(e => e.label).every(e => e.labelWidth > 0 && e.labelHeight > 0));
const merged = { nodes: [node("a"), node("b"), node("c"), node("d")], edges: [edge("ad", "a", "d"), edge("bd", "b", "d"), edge("cd", "c", "d")], groups: [] };
ok("3つの入口の合流が互いに重ならない", safe(layoutDeckFlow(merged, "flow-converge", "merge", size)));
const explainedMerge = { ...merged, nodes: merged.nodes.map(item => ({ ...item, label: "利用者の声を確認\n判断するための材料" })) };
ok("3つの入口に補足があっても幅を使って原寸で収める", safe(layoutDeckFlow(explainedMerge, "flow-converge", "merge", size)));
const cyclic = { ...chain, nodes: [...chain.nodes, node("d", "学ぶ")], edges: [...chain.edges, edge("cd", "c", "d"), edge("da", "d", "a", "次へ")] };
ok("循環を有向非巡回グラフと誤認しない", safe(layoutDeckFlow(cyclic, "flow-cycle", "loop", size)));
const lanes = { ...cyclic, edges: [edge("ac", "a", "c"), edge("cd", "c", "d"), edge("db", "d", "b")], groups: [{ id: "customer", label: "顧客", nodeIds: ["a", "b"] }, { id: "support", label: "支援", nodeIds: ["c", "d"] }] };
const laneLayout = layoutDeckFlow(lanes, "flow-swimlane", "roles", size);
ok("担当を同じ段に置き段の名前を保持", safe(laneLayout) && laneLayout.groups.length === 2 && laneLayout.nodes[0].y === laneLayout.nodes[1].y && laneLayout.nodes[0].y !== laneLayout.nodes[2].y);
const longLane = layoutDeckFlow({ ...lanes, groups: [{ ...lanes.groups[0], label: "顧客サポート窓口" }, lanes.groups[1]] }, "flow-swimlane", "roles", size);
ok("長い担当名が作業の箱に重ならない", longLane !== null && longLane.groups[0].labelX + size.measureText(longLane.groups[0].label, 20) + 16 <= Math.min(...longLane.nodes.map(n => n.x)));
ok("長い日本語は文字サイズを下げずに行へ分ける", layoutDeckFlow({ ...chain, nodes: [node("a", "利用者の状況を確認する"), ...chain.nodes.slice(1)] }, "flow-sequence", "horizontal", size)?.nodes[0].lines.length > 1 && DECK_FLOW_METRICS.nodeFontSize === 32);
ok("収まらない資料を縮小で成功扱いしない", layoutDeckFlow(chain, "flow-sequence", "horizontal", { width: 220, height: 100 }), null);
ok("未知の節点への矢印を黙って捨てない", layoutDeckFlow({ ...chain, edges: [edge("bad", "a", "missing")] }, "flow-sequence", "horizontal", size), null);
ok("重複した節点IDを位置へ付け替えない", layoutDeckFlow({ ...chain, nodes: [node("a"), node("a")] }, "flow-sequence", "horizontal", size), null);
ok("未対応のグループ構造を平らにして失わない", layoutDeckFlow({ ...chain, groups: [{ id: "group", label: "重要なまとまり", nodeIds: ["a", "b"] }] }, "flow-state", "state-group", size), null);
const detailed = layoutDeckFlow({ ...chain, nodes: [node("a", "調べる\n利用者の状況を確かめる"), ...chain.nodes.slice(1)] }, "flow-sequence", "horizontal", size);
ok("明示改行の見出しと補足を別の文字階層へ配置", detailed?.nodes[0].lines.join("") === "調べる" && detailed.nodes[0].detailLines.join("") === "利用者の状況を確かめる" && detailed.nodes[0].height > horizontal.nodes[0].height);
const mixedRows = layoutDeckFlow({ ...chain, nodes: [{ ...chain.nodes[0], label: "継続につながる理由\n理由を知る" }, { ...chain.nodes[1], label: "確認する\n起きていることをすべて確認する" }, chain.nodes[2]] }, "flow-sequence", "horizontal", size);
ok("横手順は見出しと補足の最大行数で上端をそろえる", mixedRows !== null && new Set(mixedRows.nodes.map(node => `${node.y}/${node.height}/${node.titleLineSlots}/${node.detailLineSlots}`)).size === 1 && mixedRows.nodes[0].titleLineSlots === 2 && mixedRows.nodes[0].detailLineSlots === 2);
function pathCrossesBox(points, box) {
  return points.slice(1).some((b, i) => {
    const a = points[i];
    if (a.x === b.x) return a.x > box.x + .1 && a.x < box.x + box.width - .1 && Math.min(a.y, b.y) < box.y + box.height - .1 && Math.max(a.y, b.y) > box.y + .1;
    return a.y > box.y + .1 && a.y < box.y + box.height - .1 && Math.min(a.x, b.x) < box.x + box.width - .1 && Math.max(a.x, b.x) > box.x + .1;
  });
}
ok("分岐の線は無関係な節点の中を横切らない", decision.edges.every(e => decision.nodes.every(n => !pathCrossesBox(e.points, n))));
ok("矢印の条件文は節点を覆わない", decision.edges.filter(e => e.label).every(e => decision.nodes.every(n => !overlap({ x: e.labelX - e.labelWidth / 2, y: e.labelY - e.labelHeight / 2, width: e.labelWidth, height: e.labelHeight }, n))));
const longCondition = "内容を確認してから渡す";
const labelled = layoutDeckFlow({ ...chain, edges: [{ ...chain.edges[0], label: longCondition }, chain.edges[1]] }, "flow-sequence", "horizontal", size);
ok("長い条件文も間隔に合わせて折り返し全文を残す", labelled !== null && labelled.edges[0].lines.join("") === longCondition && labelled.edges[0].lines.length > 1);
function labelsClearOfEveryWire(scene) {
  return scene !== null && scene.edges.filter(edge => edge.label).every(label => scene.edges.every(wire => !pathCrossesBox(wire.points, { x: label.labelX - label.labelWidth / 2 - 23.9, y: label.labelY - label.labelHeight / 2 - 23.9, width: label.labelWidth + 47.8, height: label.labelHeight + 47.8 })));
}
ok("条件文の外縁から線まで24pxを空ける", labelsClearOfEveryWire(horizontal));
ok("分岐の条件文は自分と別の矢印の両方から離す", labelsClearOfEveryWire(decision));
function normalLead(box, port, outside, textGap = 0) {
  const near = (a, b) => Math.abs(a - b) < .01;
  return (near(port.x, box.x - textGap) && near(port.y, outside.y) && port.x - outside.x >= 23.99) ||
    (near(port.x, box.x + box.width) && near(port.y, outside.y) && outside.x - port.x >= 23.99) ||
    (near(port.y, box.y) && near(port.x, outside.x) && port.y - outside.y >= 23.99) ||
    (near(port.y, box.y + box.height) && near(port.x, outside.x) && outside.y - port.y >= 23.99);
}
const cycleScene = layoutDeckFlow(cyclic, "flow-cycle", "loop", size);
ok("矢印は箱から垂直に24px進んでから曲がる", cycleScene !== null && cycleScene.edges.every(edge => normalLead(cycleScene.nodes.find(node => node.id === edge.from), edge.points[0], edge.points[1]) && normalLead(cycleScene.nodes.find(node => node.id === edge.to), edge.points.at(-1), edge.points.at(-2))));
const mergeScene = layoutDeckFlow(merged, "flow-converge", "merge", size);
ok("同じ箱へ入る3本の矢印の先端を分散する", mergeScene !== null && new Set(mergeScene.edges.map(edge => JSON.stringify(edge.points.at(-1)))).size === 3);
ok("同じ判断から出る矢印の出発点も分散する", decision !== null && new Set(decision.edges.filter(edge => edge.from === "b").map(edge => JSON.stringify(edge.points[0]))).size === 2);
ok("箱を24px広げた外側で無関係な矢印を曲げる", cycleScene !== null && cycleScene.edges.every(edge => cycleScene.nodes.filter(node => node.id !== edge.from && node.id !== edge.to).every(node => !pathCrossesBox(edge.points, { x: node.x - 23.9, y: node.y - 23.9, width: node.width + 47.8, height: node.height + 47.8 }))));
const hierarchy = layoutDeckFlow({ ...branch, direction: "TB" }, "flow-hierarchy", "", size);
ok("階層の既定は横長の枚を生かす横向き", hierarchy !== null && hierarchy.nodes[0].x < hierarchy.nodes[1].x);
const explicitVertical = layoutDeckFlow({ ...chain, direction: "TB" }, "flow-hierarchy", "vertical", size);
ok("作者が明示した縦向き階層は維持する", explicitVertical !== null && explicitVertical.nodes[0].y < explicitVertical.nodes[1].y && explicitVertical.nodes[0].x === explicitVertical.nodes[1].x);
ok("判断の言葉を語句の切れ目で折り返す", typeof wrapDeckFlowText === "function" ? wrapDeckFlowText("条件を満たすか", 216, 32, size.measureText) : null, ["条件を", "満たすか"]);
ok("条件文と補足も末尾1文字だけを残さない", typeof wrapDeckFlowText === "function" && [20, 32].every(font => wrapDeckFlowText("共有先に見せてよい？", font * 6, font, size.measureText)?.every(line => [...line].length > 1)));
ok("文字幅に入らない長い英単語は欠けずに分割", typeof wrapDeckFlowText === "function" && wrapDeckFlowText("ABCDEFGHIJKLM", 100, 20, size.measureText)?.join("") === "ABCDEFGHIJKLM");

const vertices = new Map([["a", { id: "a", text: "申請", type: "square", labelType: "text", styles: [], classes: [], props: {} }], ["b", { id: "b", text: "判断", type: "diamond", labelType: "text", styles: [], classes: [], props: {} }]]);
const database = { getVertices: () => vertices, getEdges: () => [{ id: "approve", start: "a", end: "b", text: "はい", type: "arrow_point", labelType: "text", stroke: "normal", classes: [], isUserDefinedId: true }], getSubGraphs: () => [], getDirection: () => "LR" };
const api = db => ({ mermaidAPI: { async getDiagramFromText() { return { type: "flowchart-v2", db }; } } });
const source = "flowchart LR\na[申請] approve@-->|はい| b{判断}";
const parsed = await readDeckFlowSource(api(database), source);
ok("解析結果から作者の節点と辺の目印を継承", parsed?.nodes.map(n => [n.id, n.label, n.shape]), [["a", "申請", "box"], ["b", "判断", "decision"]]);
ok("矢印の条件文を欠落させない", parsed?.edges, [{ id: "approve", from: "a", to: "b", label: "はい" }]);
ok("未知の解析APIでは従来描画へ戻す", await readDeckFlowSource({}, source), null);
ok("不正なMap値を図として受け入れない", await readDeckFlowSource(api({ ...database, getVertices: () => new Map([["a", { id: "a", text: 42, type: "square" }]]) }), source), null);
for (const suffix of ['\nclick a "https://example.com"', "\nclassDef warning fill:red", "\nstyle a fill:red", "\nclass a warning"]) ok("作者の仕掛けと装飾を落として描き替えない", await readDeckFlowSource(api(database), source + suffix), null);
ok("HTMLラベルを平文化しない", await readDeckFlowSource(api({ ...database, getVertices: () => new Map([["a", { ...vertices.get("a"), text: "申請<strong>確認</strong>" }]]) }), source), null);
const detailedSource = await readDeckFlowSource(api({ ...database, getVertices: () => new Map([["a", { ...vertices.get("a"), text: "申請<br/>条件を確認" }], ["b", vertices.get("b")]]) }), source);
ok("安全な明示改行と補足文は欠落させない", detailedSource?.nodes[0].label, "申請\n条件を確認");
const authoredGroups = await readDeckFlowSource(api({ ...database, getSubGraphs: () => [{ id: "team", title: "担当", nodes: ["a", "b"], classes: [], labelType: "text" }] }), source);
ok("作者の担当グループと所属をそのまま継承", authoredGroups?.groups, [{ id: "team", label: "担当", nodeIds: ["a", "b"] }]);
ok("未対応の矢印の意味を失わない", await readDeckFlowSource(api({ ...database, getEdges: () => [{ ...database.getEdges()[0], type: "arrow_circle" }] }), source), null);
ok("解析中の失敗で全体を止めない", await readDeckFlowSource({ mermaidAPI: { getDiagramFromText() { throw new Error("syntax"); } } }, source), null);
// Exercise the vendored parser, not a guessed version of its returned object shape.
const vendorDom = new JSDOM("<body></body>", { runScripts: "dangerously" });
const appendScript = text => { const script = vendorDom.window.document.createElement("script"); script.textContent = text; vendorDom.window.document.head.append(script); };
appendScript(await readFile(`${root}/vendor/mermaid/mermaid.js`, "utf8"));
vendorDom.window.mermaid.initialize({ startOnLoad: false });
await build({ entryPoints: [`${root}/src/deck-design/flow-source.ts`], outfile: `${dir}/deck-flow-source-browser.js`, bundle: true, format: "iife", globalName: "DeckFlowSource" });
appendScript(await readFile(`${dir}/deck-flow-source-browser.js`, "utf8"));
const fixtureDom = new JSDOM(await readFile(`${root}/tests/checks/fixtures/internal/example/deck-format-catalog.html`, "utf8"));
for (const format of ["flow-sequence", "flow-state", "flow-input-output", "flow-causal"]) {
  const sourceElement = fixtureDom.window.document.querySelector(`section[data-dd-format="${format}"] pre.mermaid`);
  const authored = sourceElement?.textContent ?? "";
  const projected = await vendorDom.window.DeckFlowSource.readDeckFlowSource(vendorDom.window.mermaid, authored);
  const scene = projected ? layoutDeckFlow(projected, format, "", { width: 1152, height: 410 }) : null;
  ok(`${format}:台帳の実原文を固定版パーサーで解析し全3節点を配置`, scene !== null && scene.nodes.length === 3 && scene.nodes.every(node => node.detailLines.length > 0));
}
const networkSource = fixtureDom.window.document.querySelector('section[data-dd-format="flow-network"] pre.mermaid')?.textContent ?? "";
const networkGraph = await vendorDom.window.DeckFlowSource.readDeckFlowSource(vendorDom.window.mermaid, networkSource);
const networkScene = networkGraph ? layoutDeckFlow(networkGraph, "flow-network", "network", { width: 1152, height: 410 }) : null;
ok("実際の網目図で無関係な中心の箱から線を24px離す", networkScene !== null && networkScene.edges.every(edge => networkScene.nodes.filter(node => node.id !== edge.from && node.id !== edge.to).every(node => !pathCrossesBox(edge.points, { x: node.x - 23.9, y: node.y - 23.9, width: node.width + 47.8, height: node.height + 47.8 }))));
for (const section of fixtureDom.window.document.querySelectorAll('section[data-dd-format^="flow-"]')) {
  const format = section.getAttribute("data-dd-format"), pre = section.querySelector("pre.mermaid");
  if (!pre || format === "flow-time") continue;
  const graph = await vendorDom.window.DeckFlowSource.readDeckFlowSource(vendorDom.window.mermaid, pre.textContent);
  const scene = graph ? layoutDeckFlow(graph, format, "", { width: 1152, height: 410 }) : null;
  ok(`${format}:24pxの接続直線を加えても台帳の全節点と辺を保持`, scene !== null && scene.nodes.length === graph.nodes.length && scene.edges.length === graph.edges.length && scene.edges.every(edge => normalLead(scene.nodes.find(node => node.id === edge.from), edge.points[0], edge.points[1], scene.typographic ? 16 : 0) && normalLead(scene.nodes.find(node => node.id === edge.to), edge.points.at(-1), edge.points.at(-2), scene.typographic ? 16 : 0)));
}
const twoDecisions = 'flowchart LR\ndecision{今の判断に必要？}\ndecision edge-check-access@-->|はい| access{共有先に見せてよい？}\ndecision edge-keep-private@-->|いいえ| keep[自分用に残す]\naccess edge-share-now@-->|はい| share[共有する]\naccess edge-check-scope@-->|いいえ| scope[共有範囲を確認]';
const twoDecisionGraph = await vendorDom.window.DeckFlowSource.readDeckFlowSource(vendorDom.window.mermaid, twoDecisions);
const twoDecisionScene = twoDecisionGraph ? layoutDeckFlow(twoDecisionGraph, "flow-branch", "", { width: 1152, height: 410 }) : null;
ok("必要性と共有範囲の2条件分岐を全て保持して配置", twoDecisionScene !== null && twoDecisionScene.nodes.length === 5 && twoDecisionScene.edges.length === 4 && labelsClearOfEveryWire(twoDecisionScene));
ok("2条件分岐の接続線に1px未満の段差を残さない", twoDecisionScene !== null && twoDecisionScene.edges.every(edge => edge.points.slice(1).every((point, index) => Math.hypot(point.x - edge.points[index].x, point.y - edge.points[index].y) >= 1)));
ok("分岐の配線に不要な短い階段を作らない", twoDecisionScene !== null && twoDecisionScene.edges.every(edge => edge.points.length <= 5));
fixtureDom.window.close(); vendorDom.window.close();
if (failures) process.exit(1);
