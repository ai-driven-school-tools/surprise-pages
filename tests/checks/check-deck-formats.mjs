import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { root, dir } from "./paths.mjs";

let failures = 0;
function ok(label, value, expected = true) {
  const pass = JSON.stringify(value) === JSON.stringify(expected);
  if (!pass) failures += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}${pass ? "" : `: ${JSON.stringify(value)}（期待 ${JSON.stringify(expected)}）`}`);
}

async function bundle(file, name) {
  await build({ entryPoints: [`${root}/${file}`], outfile: `${dir}/format-${name}.mjs`, bundle: true, platform: "node", format: "esm" });
  return import(`${dir}/format-${name}.mjs`);
}

const catalogModule = await bundle("src/lib/deck/design/format-catalog.ts", "catalog");
const focusModule = await bundle("src/deck-design/focus-renderer.ts", "focus");
const logoModule = await bundle("src/deck-design/logo-renderer.ts", "logo");
const diagramModule = await bundle("src/deck-design/diagrams.ts", "diagrams");
const markdownModule = await bundle("src/lib/pages/markdown.ts", "markdown");
const catalog = catalogModule.DECK_FORMAT_CATALOG;
const html = await readFile(`${root}/tests/checks/fixtures/internal/example/deck-format-catalog.html`, "utf8");
const baseCss = await readFile(`${root}/src/deck-design/styles.css`, "utf8");
const css = await readFile(`${root}/src/deck-design/formats.css`, "utf8");
const chartsSource = await readFile(`${root}/src/deck-design/charts.ts`, "utf8");
const runtimeSource = await readFile(`${root}/src/deck-design/runtime.ts`, "utf8");
const reference = await readFile(`${root}/docs/guides/deck-formats.md`, "utf8");
const designGuide = await readFile(`${root}/docs/guides/deck-design.md`, "utf8");
const geometryCheck = await readFile(`${root}/tests/checks/browser/deck-design-geometry.js`, "utf8");
const fixture = new JSDOM(html).window.document;

console.log("--- 1. 形式台帳と生成物 ---");
ok("形式IDが重複しない", new Set(catalog.map((item) => item.id)).size, catalog.length);
ok("用途・入力・構図・読み表示が全形式にある", catalog.every((item) => item.purpose && item.inputs.length && item.compositionVariants.length && item.staticReading));
ok("6系統がそろう", [...new Set(catalog.map((item) => item.family))].sort(), ["chart", "flow", "image", "media", "role", "table"]);
ok("役割の形式がそろう", catalog.filter((item) => item.family === "role").length, 11);
ok("グラフの目的がそろう", catalog.filter((item) => item.family === "chart").length, 13);
ok("表の用途がそろう", catalog.filter((item) => item.family === "table").length, 10);
ok("流れと関係の用途がそろう", catalog.filter((item) => item.family === "flow").length, 14);
const renderedIds = [...fixture.querySelectorAll("section[data-dd-format]")].map((node) => node.getAttribute("data-dd-format"));
ok("台帳の全形式を1枚ずつ描く", renderedIds.sort(), catalog.map((item) => item.id).sort());
ok("リファレンスも同じ台帳から作る", catalog.every((item) => reference.includes(`\`${item.id}\``)));
execFileSync(process.execPath, [`${root}/scripts/generate/deck-format-catalog.mjs`, "--check"]);
ok("見本とリファレンスが最新", true);

console.log("--- 2. 描画に必要な読み表示 ---");
ok("全グラフがSVG描画の材料を持つ", [...fixture.querySelectorAll('[data-dd-format^="chart-"]')].every((slide) => slide.querySelector("[data-dd-chart] .dd-chart-canvas") && slide.querySelector("[data-dd-chart-source]") && slide.querySelector(".dd-chart-fallback")));
ok("数値カードは12列を3等分する", css.includes(".dd-format-grid > .dd-proof { grid-column: span 4; }"));
ok("グラフの全用途が別の材料で描かれる", new Set([...fixture.querySelectorAll("[data-dd-chart-source]")].map((node) => JSON.parse(node.textContent).purpose)).size, 13);
ok("系列IDを読み表示へ一度だけ出す", [...fixture.querySelectorAll("[data-dd-chart]")].every((figure) => {
  const source = JSON.parse(figure.querySelector("[data-dd-chart-source]").textContent);
  return source.series.every((series) => figure.querySelectorAll(`[data-dd-series-id="${series.id}"]`).length === 1);
}));
ok("期間IDが対象点すべてとつながる", [...fixture.querySelectorAll("[data-dd-range-id]")].every((range) => {
  const id = range.getAttribute("data-dd-range-id");
  return fixture.querySelectorAll(`[data-dd-range-ref="${id}"]`).length > 1;
}));
ok("Mermaid図が読み表示の対象一覧を持つ", [...fixture.querySelectorAll("[data-dd-mermaid-diagram]")].every((figure) => figure.querySelector(".mermaid") && figure.querySelector(".dd-flow-targets")));
const preparedDiagram = new JSDOM('<figure data-dd-mermaid-diagram><pre class="mermaid">%%{init: {"themeVariables":{"fontSize":"24px"}}}%%\nflowchart LR\na-->b</pre></figure>').window.document;
const authoredDiagramSource = preparedDiagram.querySelector("pre.mermaid")?.textContent ?? "";
markdownModule.keepMermaidSource(preparedDiagram);
diagramModule.prepareDeckDiagramSources(preparedDiagram);
ok("deckのMermaidはSafariで切れないSVG文字を使う", preparedDiagram.querySelector("pre.mermaid")?.textContent.includes('"themeVariables":{"fontSize":"24px"},"htmlLabels":false') && geometryCheck.includes("diagram.querySelector('foreignObject')"));
ok("作者のMermaid文を控えてから描画用設定を足す", preparedDiagram.querySelector("pre.mermaid")?.getAttribute(markdownModule.MERMAID_SOURCE_MARK) === authoredDiagramSource && runtimeSource.includes("whenDeckParsed(prepareAndStart)") && runtimeSource.indexOf("keepMermaidSource(document)") < runtimeSource.indexOf("prepareDeckDiagramSources(document)"));
ok("Mermaidの実DOM階層に幅・高さ・文字の下限を当てる", css.includes(".dd-flow-diagram > pre.mermaid") && css.includes(".dd-flow-diagram svg") && css.includes(".dd-flow-diagram :is(text,p,span) { font-size: 22px !important;"));
ok("関係図の紙色・影なし・2px線・20px線札を実DOMで確かめる", geometryCheck.includes("flowVisualIssues") && geometryCheck.includes("style.filter!=='none'") && geometryCheck.includes(".flowchart-link") && geometryCheck.includes(".edgeLabel p,.edgeLabel span"));
ok("辺も安定した目印で選べる実例がある", fixture.querySelectorAll("[data-dd-edge-id]").length > 0);
const targetKinds = ["element", "row", "column", "cell", "series", "point", "range", "region", "node", "edge"];
ok("台帳で宣言した対象種を見本が実際に持つ", catalog.every((format) => format.focusTargets.every((kind) => fixture.querySelector(`[data-dd-format="${format.id}"] [data-dd-${kind}-id]`) !== null)));
ok("保存HTMLでは同じ種類のIDを二重にしない", targetKinds.every((kind) => [...fixture.querySelectorAll("section[data-deck-slide]")].every((slide) => {
  const ids = [...slide.querySelectorAll(`[data-dd-${kind}-id]`)].map((node) => node.getAttribute(`data-dd-${kind}-id`));
  return new Set(ids).size === ids.length;
})));
ok("集合と四象限はデータ駆動のSVG", fixture.querySelectorAll("[data-dd-native-diagram] [data-dd-native-source]").length, 2);
ok("画像1・2・3・N点を実際に置く", ["image-one", "image-two", "image-three", "image-many"].map((id) => fixture.querySelector(`[data-dd-format="${id}"]`)?.querySelectorAll("img").length), [1, 2, 3, 8]);
ok("画像の説明を個別・共通・二段で置く", Boolean(fixture.querySelector('[data-dd-format="image-captioning"] .dd-caption-secondary') && fixture.querySelector('[data-dd-format="image-captioning"] .dd-shared-caption')));
ok("画像の薄さ・文字板・グラデーションを別の印で持つ", Boolean(fixture.querySelector("[data-dd-photo='faded']") && fixture.querySelector("[data-dd-backplate]") && fixture.querySelector("[data-dd-scrim]")));
ok("単画像は横幅と本文の残り高の両方に収める", /\[data-dd-format="image-one"\] \.dd-body > figure > \.dd-media-frame \{[^}]*width: auto;[^}]*max-width: 100%;[^}]*height: 100%;[^}]*max-height: 100%;/s.test(css));
ok("見出しと本文の間を16px、画像とは24px予約する", baseCss.includes(".dd-title + .dd-body { padding-top: 16px; }") && /\[data-dd-format\^="image-"\][\s\S]*> \.dd-body \{ padding-top: 24px; \}/.test(css) && geometryCheck.includes("title-media-gap"));
ok("製品画像と動画も本文の残り高を上限にする", /\.dd-product \{[^}]*height: 100%;[^}]*min-height: 0;/s.test(css) && /\[data-dd-format="video"\] \.dd-player \{[^}]*height: 100%;[^}]*min-height: 0;/s.test(css));
ok("20px未満の文字を追加しない", [...css.matchAll(/font-size:\s*([0-9]+)px/g)].every((match) => Number(match[1]) >= 20));
ok("通常の強調でも1pxと改行を再計測", geometryCheck.includes("focusDelta>1||focusLineChanges"));
ok("枚の外だけでなく入れ子の画像・見出し・脚注・ロゴの重なりも実寸で測る", geometryCheck.includes("visual-outside-body") && geometryCheck.includes("title-overlap") && geometryCheck.includes("footer-overlap") && geometryCheck.includes("logo-content-overlap"));
ok("図表内の画面上の文字寸法も測る", geometryCheck.includes("minimumLogicalPx") && geometryCheck.includes("getScreenCTM"));
ok("原寸と小画面で全枚を直す前後に撮る", designGuide.includes("1280×720の原寸と幅390px") && designGuide.includes("同じ大きさ・順番・ファイル名で全枚を再び撮る"));
ok("幅390pxはChromiumとSafari/WebKitの両方で全図を見る", designGuide.includes("Chromium系とSafari/WebKit系の両方") && designGuide.includes("文字が横帯だけ"));
ok("全枚で意味・視線・主従・余白・実寸文字を目視する", ["**意味**", "**視線**", "**主従**", "**余白**", "**文字**"].every((label) => designGuide.includes(label)) && designGuide.includes("目視の補助"));
ok("描画完了と枚IDを確かめて抜け・重複を防ぐ", designGuide.includes("書体と画像の読込、グラフと図の描画完了") && designGuide.includes("抜け・重複・直前の枚の写り込み"));
ok("数値と画像が矛盾したら不合格に戻す", designGuide.includes("数値と画像が矛盾したら必ず不合格"));
ok("焦点外の文脈も実表示で読める濃さを保つ", css.includes("--dd-focus-dim: .6") && chartsSource.includes("blur: { itemStyle: { opacity: .6 }") && geometryCheck.includes("focusDimOpacity<.59"));
ok("印刷では明示的な拡大も解除", css.includes("[data-dd-focus-zoom] { transform: none !important; }"));

console.log("--- 3. 並べ替え後の焦点と複数要素 ---");
const window = new JSDOM(`<!doctype html><body><section data-deck-slide data-deck-id="metrics"><table><colgroup><col data-dd-column-id="actual"><col data-dd-column-id="target"></colgroup><tbody><tr data-dd-row-id="revenue"><td data-dd-cell-id="actual-revenue" data-dd-column-ref="actual">128</td><td data-dd-cell-id="target-revenue" data-dd-column-ref="target">125</td></tr><tr data-dd-row-id="retention"><td data-dd-cell-id="actual-retention" data-dd-column-ref="actual">94.2</td><td data-dd-cell-id="target-retention" data-dd-column-ref="target">94.0</td></tr></tbody></table><div data-dd-range-id="forecast"><span data-dd-range-ref="forecast">10月</span><span data-dd-range-ref="forecast">11月</span></div></section></body>`, { url: "http://localhost/" }).window;
globalThis.window = window;
globalThis.document = window.document;
globalThis.CustomEvent = window.CustomEvent;
globalThis.CSS = window.CSS ?? { escape: (value) => value };
globalThis.Document = window.Document;
globalThis.Element = window.Element;
globalThis.MutationObserver = window.MutationObserver;
const slide = window.document.querySelector("section");
const body = slide.querySelector("tbody");
body.prepend(body.lastElementChild);
focusModule.applyDeckFocus({ slideId: "metrics", stepId: "compare", actions: [{ id: "actual-only", kind: "compare", targets: [{ slideId: "metrics", kind: "column", id: "actual" }] }] }, window.document);
ok("行を並べ替えても実績列の2セルだけを強調", [...slide.querySelectorAll('[data-dd-column-ref="actual"]')].map((node) => node.getAttribute("data-dd-focus-state")), ["active", "active"]);
ok("目標列は強調されない", [...slide.querySelectorAll('[data-dd-column-ref="target"]')].every((node) => node.getAttribute("data-dd-focus-state") !== "active"));
focusModule.applyDeckFocus({ slideId: "metrics", stepId: "range", actions: [{ id: "forecast-range", kind: "range", targets: [{ slideId: "metrics", kind: "range", id: "forecast" }] }] }, window.document);
ok("期間の全要素をまとめて強調", [...slide.querySelectorAll('[data-dd-range-ref="forecast"]')].map((node) => node.getAttribute("data-dd-focus-state")), ["active", "active"]);
const actualCell = slide.querySelector('[data-dd-cell-id="actual-retention"]');
actualCell.parentElement.prepend(actualCell);
ok("セル順を変えてもIDで同じ対象を解決", focusModule.resolveDeckFocusTargets(slide, { slideId: "metrics", kind: "cell", id: "actual-retention" })[0] === actualCell);
const edgeFigure = window.document.createElement("figure");
edgeFigure.setAttribute("data-dd-mermaid-diagram", "");
edgeFigure.innerHTML = '<div class="dd-flow-diagram"><svg><g class="edgePaths"><path id="mermaid-render-edge-approve" class="flowchart-link" data-id="edge-approve"></path></g><g class="edgeLabels"><g class="edgeLabel"><g class="label" data-id="edge-approve"><foreignObject><p>承認へ</p></foreignObject></g></g></g></svg></div><ol class="dd-flow-targets"><li data-dd-edge-id="edge-approve">承認へ</li></ol>';
slide.append(edgeFigure);
diagramModule.renderDeckDiagrams(window.document);
const renderedEdge = edgeFigure.querySelector("path");
ok("読み一覧の辺IDを実SVGの線へ移す", [renderedEdge?.getAttribute("data-dd-edge-id"), edgeFigure.querySelectorAll('[data-dd-edge-id="edge-approve"]').length], ["edge-approve", 1]);
focusModule.applyDeckFocus({ slideId: "metrics", stepId: "edge", actions: [{ id: "edge-focus", kind: "emphasize", targets: [{ slideId: "metrics", kind: "edge", id: "edge-approve" }] }] }, window.document);
await new Promise((resolve) => setTimeout(resolve, 0));
ok("実SVGの線をIDで強調", renderedEdge?.getAttribute("data-dd-focus-state"), "active");
ok("線の札にも同じ焦点状態を写す", edgeFigure.querySelector("[data-dd-focus-edge-label='edge-approve']")?.getAttribute("data-dd-focus-state"), "active");
ok("選択した線と札は色で強調し、文字の太さを変えない", css.includes('[data-dd-edge-id][data-dd-focus-state="active"] { stroke: var(--dd-accent) !important; stroke-width: 3px !important; }') && css.includes("fill: context-stroke !important") && !css.match(/\[data-dd-focus-edge-label\]\[data-dd-focus-state="active"\][^{]+\{[^}]*font-weight/));
ok("選択したグラフ点・線も役割色と太さで前へ出す", chartsSource.includes("borderColor: colors.accent, borderWidth: 3") && chartsSource.includes("lineStyle: { color: colors.accent, width: 4"));
ok("期間の太線は対象点だけを結び解除後に消す", geometryCheck.includes("actual!==expected||!cleared") && chartsSource.includes("datum.rangeId !== undefined && selectedRanges.has(datum.rangeId)") && chartsSource.includes("deck-focus-range-"));

console.log("--- 4. ロゴの安全域 ---");
const effective = { asset: { path: "sample-logo.svg", contentType: "image/svg+xml", intrinsicWidth: 320, intrinsicHeight: 96 }, presentation: { placement: "top-right", size: 12, opacity: 100, offsetX: 40, offsetY: 40, nudgeX: 1, nudgeY: -1, color: "original", backplate: false } };
ok("安全域がない構図では隠す", logoModule.paintDeckLogo(slide, effective), null);
ok("衝突回避の理由を残す", slide.getAttribute("data-dd-logo-collision-avoided"), "hidden");
slide.setAttribute("data-dd-logo-safe", "top-right");
const logo = logoModule.paintDeckLogo(slide, effective);
ok("安全域がある構図では同じ素材を表示", logo?.querySelector("img")?.getAttribute("src"), "sample-logo.svg");
ok("1pxの微調整を別に保持", [logo?.style.getPropertyValue("--dd-logo-nudge-x"), logo?.style.getPropertyValue("--dd-logo-nudge-y")], ["1px", "-1px"]);
window.close();
delete globalThis.window;
delete globalThis.document;
delete globalThis.CustomEvent;
delete globalThis.CSS;
delete globalThis.Document;
delete globalThis.Element;
delete globalThis.MutationObserver;

console.log(`\n${failures === 0 ? "すべて合格" : `${failures} 件 不合格`}`);
process.exitCode = failures ? 1 : 0;
