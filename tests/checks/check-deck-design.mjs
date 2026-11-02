import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { root, dir } from "./paths.mjs";

let fails = 0;
const ok = (label, actual, expected = true) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}${pass ? "" : `: ${JSON.stringify(actual)}（期待 ${JSON.stringify(expected)}）`}`);
};
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
async function bundle(file, name) {
  await build({ entryPoints: [`${root}/${file}`], outfile: `${dir}/dd-${name}.mjs`, bundle: true, platform: "node", format: "esm" });
  return import(`${dir}/dd-${name}.mjs`);
}
const core = await bundle("src/lib/deck/design/design.ts", "core");
const html = await bundle("src/lib/deck/design/html.ts", "html");
const domHelpers = await bundle("src/lib/deck/design/dom.ts", "dom");
const drafts = await bundle("src/widget/editor/draft.ts", "draft");
const designer = await bundle("src/widget/deck/edit/design-editor.ts", "editor");
const focusEditor = await bundle("src/widget/deck/edit/focus-editor.ts", "focus-editor");
const kit = await readFile(`${root}/src/templates/deck-design.html`, "utf8");
const cfg = { version: 1, document: core.DEFAULT_APPEARANCE, slides: {} };
const documentOf = (ids = ["opening", "evidence"], value = cfg) => `<!doctype html><html><head><title>例</title><script type="application/json" data-deck-design>${JSON.stringify(value)}</script></head><body data-deck><main data-deck-slides>${ids.map((id) => `<section data-deck-slide data-deck-id="${id}"><h2>${id}</h2><p>本文を残す</p></section>`).join("\n")}</main></body></html>`;
const original = documentOf();
const override = { version: 1, document: { accent: "#123456", decoration: "glow" }, slides: { evidence: { background: "#151719", motion: true } } };

console.log("--- 1. 型・色・引き継ぎ ---");
ok("12配色が定義を満たす", core.DECK_PRESETS.length === 12 && core.DECK_PRESETS.every((p) => core.appearanceSchema.safeParse(p.appearance).success));
const authoredVariant = { ...cfg, slides: { opening: { background: "#111111" } } };
const followed = { version: 1, document: { background: "#ffffff" }, slides: { opening: { followDocument: true, accent: "#112233" } } };
ok("全体に合わせた後に作成時の個別配色を復活させない", core.effectiveAppearance(authoredVariant, followed, "opening").background, "#ffffff");
ok("全体に合わせた後も項目ごとに指定できる", core.effectiveAppearance(authoredVariant, followed, "opening").accent, "#112233");
ok("全体より枚の指定を優先", core.effectiveAppearance(cfg, override, "evidence").background, "#151719");
ok("未指定の項目は全体を引き継ぐ", core.effectiveAppearance(cfg, override, "evidence").accent, "#123456");
for (const bad of [{ intensity: 101 }, { motion: "false" }, { background: "url(x)" }, { fontSize: 10 }, { x: -1 }, { scale: 200 }, { angle: 361 }]) {
  ok(`不正設定 ${JSON.stringify(bad)} を断る`, !core.appearancePatchSchema.safeParse(bad).success);
}
let safe = true;
for (let value = 0; value <= 255; value += 5) {
  const color = `#${value.toString(16).padStart(2, "0").repeat(3)}`;
  for (const preset of core.DECK_PRESETS) {
    if (core.appearanceColors({ ...preset.appearance, background: color, intensity: 100 }).contrast < 4.5) safe = false;
  }
}
ok("暗い背景から明るい背景まで装飾込みで読める", safe);
// Validate the combined decorative layers, including supporting copy, independently.
const lum = rgb => rgb.map(v => { const x=v/255; return x<=.04045 ? x/12.92 : ((x+.055)/1.055)**2.4; }).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0);
const ratio = (a,b) => (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
let stagesSafe=true,accentSafe=true;
for(let value=0;value<=255;value+=5)for(const preset of core.DECK_PRESETS){
 const color=`#${value.toString(16).padStart(2,"0").repeat(3)}`,colors=core.appearanceColors({...preset.appearance,background:color,intensity:100});
 const tint=colors.opacity+(1-colors.opacity)*colors.stageOpacity;
 const accent=[1,3,5].map(at=>parseInt(colors.accent.slice(at,at+2),16));
 for(const extreme of [0,255])if(ratio(accent,[0,1,2].map(()=>value*(1-tint)+extreme*tint))<4.48)accentSafe=false;
 for(const ink of [colors.text,colors.muted])for(const extreme of [0,255])if(ratio(ink.split(' ').map(Number),[0,1,2].map(()=>value*(1-tint)+extreme*tint))<4.48)stagesSafe=false;
}
ok("段階の面と背景を重ねても補足まで読める",stagesSafe);
ok("淡い配色も強調文字は読める濃さにする",accentSafe);
const saved = html.withDeckOverrides(original, override);
ok("着せ替え以外は1バイトも変えない", html.withoutDeckOverrides(saved), original);
ok("書いた設定を読める", html.readDeckDesignHtml(saved).overrides, override);
ok("解除は元の原稿に戻る", html.withDeckOverrides(saved, core.emptyOverrides()), original);
const changed = documentOf(["evidence", "new-slide"]).replaceAll("本文を残す", "更新された本文");
const merged = html.inheritDeckOverrides(saved, changed);
ok("本文は更新される", html.withoutDeckOverrides(merged), changed);
ok("並べ替えても同じ目印に引き継ぐ", html.readDeckDesignHtml(merged).overrides.slides.evidence, override.slides.evidence);
ok("新しい枚に古い個別設定を付けない", html.readDeckDesignHtml(merged).overrides.slides["new-slide"] === undefined);
ok("削除した枚の指定を外す", html.readDeckDesignHtml(html.inheritDeckOverrides(saved, documentOf(["opening"]))).overrides.slides, {});
ok("同じ取り込みを繰り返しても同じ", html.inheritDeckOverrides(merged, changed), merged);
ok("設定を失う旧形式への取り込みを断る", throws(() => html.inheritDeckOverrides(saved, "<body><p>旧形式</p></body>")));
ok("旧形式どうしは変えない", html.inheritDeckOverrides("<p>旧</p>", "<p>新</p>"), "<p>新</p>");
ok("目印の重複を断る", throws(() => html.readDeckDesignHtml(documentOf(["a", "a"]))));
ok("設定の重複を断る", throws(() => html.readDeckDesignHtml(original.replace("</head>", original.match(/<script[\s\S]*?<\/script>/)[0] + "</head>"))));
ok("未知の形式を断る", throws(() => html.readDeckDesignHtml(original.replace('"version":1', '"version":2'))));
ok("コメントの偽の設定を実体として扱わない", html.readDeckDesignHtml(original.replace("</head>", '<!--<script data-deck-appearance type="application/json">bad</script>--></head>')).overrides, core.emptyOverrides());
ok("設定の文字はタグにならない", core.jsonForHtml({ value: "</script><p>" }).includes("<"), false);
ok("書き出しと読み込みが一致", core.importAppearance(core.exportAppearance(core.DECK_PRESETS[5].appearance)), core.DECK_PRESETS[5].appearance);
ok("書き出しに本文・目印が混じらない", Object.keys(JSON.parse(core.exportAppearance(core.DEFAULT_APPEARANCE))), ["kind", "version", "appearance"]);
ok("大きすぎる設定を断る", throws(() => core.importAppearance(" ".repeat(65537))));

console.log("--- 2. 下書きと実際の調整画面 ---");
const draft = { baseVersionId: "a".repeat(40), log: [], message: "配色", savedAt: "2026-09-13T12:00:00.000Z", appearance: override };
ok("デザインだけの下書きを復元", drafts.parseDraft(drafts.serializeDraft(draft)), draft);
ok("別の版には戻さない", drafts.draftUsable(draft, "b".repeat(40), new Date(draft.savedAt)), false);
ok("3日で失効", drafts.draftUsable(draft, draft.baseVersionId, new Date("2026-09-16T12:00:00.000Z")), false);
const window = new JSDOM("<body></body>", { url: "http://localhost/" }).window;
globalThis.window = window; globalThis.document = window.document;
const master = new window.DOMParser().parseFromString(original, "text/html");
const frame = window.document.createElement("iframe"); window.document.body.append(frame);
let changes = 0;
const ui = designer.createDeckDesigner({ master, frame, pageSlug: "internal/example", changed: () => changes++, fail: (message) => { throw new Error(message); }, clearFail: () => {} });
window.document.body.append(ui.root, ui.modeButton);
frame.contentDocument.write(original);
ui.modeButton.click(); ok("デザインの操作を開く", ui.active());
ui.root.querySelector('[aria-label="配色 森"]').click();
ok("全体の配色を変えられる", ui.value().document.background, core.DECK_PRESETS[3].appearance.background);
ok("まだ保存しない", master.querySelector("[data-deck-appearance]"), null);
const select = ui.root.querySelector('select[aria-label="適用する範囲"]');
select.value = "slide"; select.dispatchEvent(new window.Event("change"));
ui.root.querySelector('[aria-label="配色 墨"]').click();
ok("1枚だけを変えられる", ui.value().slides.opening.background, "#151719");
ok("プレビューに反映", frame.contentDocument.querySelector('[data-deck-id="opening"]').style.getPropertyValue("--dd-bg"), "#151719");
[...ui.root.querySelectorAll("button")].find((button) => button.textContent === "全体に合わせる").click();
ok("個別指定を解除", ui.value().slides.opening === undefined);
ok("調整を変更として数える", ui.dirty() && changes >= 3);
ui.restore(override); ok("下書きの見た目を復元", ui.value(), override);
const domSource = domHelpers.readDeckDesign(new window.DOMParser().parseFromString(saved, "text/html"));
ok("ブラウザとサーバーが同じ設定を読む", domSource.overrides, html.readDeckDesignHtml(saved).overrides);

const focusHtml = '<!doctype html><body><section data-deck-slide data-deck-id="opening"><p data-dd-element-id="claim">結論</p></section></body>';
const focusMaster = new window.DOMParser().parseFromString(focusHtml, "text/html");
const focusFrame = window.document.createElement("iframe"); window.document.body.append(focusFrame);
focusFrame.contentDocument.write(focusHtml);
const previewEvents = [];
let focusUi = null;
focusFrame.contentDocument.addEventListener("surprise:deck-focus-preview", (event) => {
  previewEvents.push({ detail: event.detail, value: focusUi?.value() ?? null });
});
focusUi = focusEditor.createDeckFocusEditor({
  authored: { version: 1, guidedByDefault: false, slides: {} },
  overrides: { version: 1, slides: {} },
  ids: ["opening"],
  master: focusMaster,
  frame: focusFrame,
  changed: () => {},
});
window.document.body.append(focusUi.root);
[...focusUi.root.querySelectorAll("button")].find((button) => button.textContent === "手順を追加").click();
const focusKind = focusUi.root.querySelector('select[aria-label="見せ方"]');
focusKind.value = "emphasize"; focusKind.dispatchEvent(new window.Event("change"));
[...focusUi.root.querySelectorAll(".deck-focus-target")].find((button) => button.textContent === "要素：結論").click();
const afterTarget = previewEvents.at(-1);
focusUi.root.querySelector(".deck-focus-step-select").click();
const afterReselect = previewEvents.at(-1);
ok("空から足した手順は対象を選んだ時点でプレビューする", {
  stepId: afterTarget?.detail.stepId,
  target: afterTarget?.value.slides.opening.steps["step-1"].actions[0].targets[0],
}, { stepId: "step-1", target: { slideId: "opening", kind: "element", id: "claim" } });
ok("足した直後と選び直した後のプレビュー状態が同じ", afterTarget, afterReselect);

const labelHtml = [
  '<!doctype html><body><section data-deck-slide data-deck-id="opening">',
  '<figure data-dd-element-id="diagram"><pre class="mermaid">flowchart LR\n',
  'start[申請] edge-start-decision@--> decision{条件を満たすか}\n',
  'decision edge-approve@-->|はい| approve[承認]</pre>',
  '<ol><li data-dd-node-id="start">start</li><li data-dd-node-id="decision">decision</li><li data-dd-node-id="approve">approve</li>',
  '<li data-dd-edge-id="edge-start-decision">start → decision</li><li data-dd-edge-id="edge-approve">approve</li></ol>',
  '<figcaption>関係図の説明</figcaption></figure>',
  '<p data-dd-row-id="row-a">同じ名前</p><p data-dd-row-id="row-b">同じ名前</p>',
  '<table data-dd-element-id="table"><colgroup><col data-dd-column-id="actual"></colgroup><thead><tr><th data-dd-column-ref="actual">実績</th></tr></thead>',
  '<tbody><tr data-dd-point-id="east" data-dd-range-ref="second-half"><th>東日本</th><td data-dd-cell-id="cell-actual">94.2%</td></tr>',
  '<tr data-dd-point-id="west" data-dd-range-ref="second-half"><th>西日本</th><td>81%</td></tr></tbody></table>',
  '<span data-dd-range-id="second-half">second-half</span>',
  '<figure data-dd-chart><h3 class="dd-chart-title">継続率の推移</h3><div class="dd-chart-canvas" data-dd-element-id="plot" data-dd-series-id="actual"></div>',
  '<script type="application/json" data-dd-chart-source>{"series":[{"id":"actual","label":"実績","data":[{"id":"east","label":"東日本","rangeId":"second-half"},{"id":"west","label":"西日本","rangeId":"second-half"}]}]}</script>',
  '</figure>',
  '<div data-dd-element-id="private-marker"></div>',
  '</section></body>',
].join("");
const labelMaster = new window.DOMParser().parseFromString(labelHtml, "text/html");
const labelFrame = window.document.createElement("iframe"); window.document.body.append(labelFrame);
labelFrame.contentDocument.write(labelHtml);
const labelUi = focusEditor.createDeckFocusEditor({
  authored: { version: 1, guidedByDefault: false, slides: {} },
  overrides: { version: 1, slides: {} },
  ids: ["opening"],
  master: labelMaster,
  frame: labelFrame,
  changed: () => {},
});
window.document.body.append(labelUi.root);
const labels = [...labelUi.root.querySelectorAll(".deck-focus-target")].map((button) => button.textContent);
ok("図・表・グラフは本文の名前で対象を示す", [
  "図の項目：申請",
  "図の項目：条件を満たすか",
  "図のつながり：条件を満たすか → 承認（はい）",
  "要素：関係図の説明",
  "要素：表",
  "要素：継続率の推移",
  "要素：4番目",
  "表の列：実績",
  "表のセル：94.2%",
  "グラフの系列：実績",
  "グラフの点：東日本",
  "期間・範囲：東日本〜西日本",
].every((label) => labels.includes(label)));
ok("同じ名前は表示上の番号で区別", labels.filter((label) => label?.startsWith("表の行：同じ名前")), ["表の行：同じ名前（1）", "表の行：同じ名前（2）"]);
ok("通常表示に保存用IDを出さない", ["row-a", "row-b", "edge-approve", "decision"].some((id) => labelUi.root.textContent.includes(id)), false);
ok("長い対象名は高さを固定せず全文を折り返す", ["height: auto", "white-space: normal", "overflow-wrap: anywhere", "text-align: left"].every((rule) => focusEditor.DECK_FOCUS_EDITOR_STYLES.includes(rule)));
ok("狭い画面では対象ごとに押せる一行を使う", focusEditor.DECK_FOCUS_EDITOR_STYLES.includes(".deck-focus-target { width: 100%; min-height: var(--size-touch); }"));
[...labelUi.root.querySelectorAll("button")].find((button) => button.textContent === "手順を追加").click();
const labelKind = labelUi.root.querySelector('select[aria-label="見せ方"]');
labelKind.value = "emphasize"; labelKind.dispatchEvent(new window.Event("change"));
[...labelUi.root.querySelectorAll(".deck-focus-target")].find((button) => button.textContent === "表の行：同じ名前（2）").click();
labelMaster.querySelector('[data-dd-row-id="row-b"]').textContent = "変更後の名前";
labelUi.refresh();
ok("名前を変えても保存用IDは変えない", labelUi.value().slides.opening.steps["step-1"].actions[0].targets[0].id, "row-b");
ok("名前を変えると表示だけ更新", labelUi.root.textContent.includes("表の行：変更後の名前"), true);
const missingUi = focusEditor.createDeckFocusEditor({
  authored: { version: 1, guidedByDefault: false, slides: { opening: { steps: [{
    id: "missing-step",
    actions: [{ id: "missing-action", kind: "emphasize", targets: [{ slideId: "opening", kind: "element", id: "missing-secret-id" }] }],
  }] } } },
  overrides: { version: 1, slides: {} },
  ids: ["opening"],
  master: labelMaster,
  frame: labelFrame,
  changed: () => {},
});
window.document.body.append(missingUi.root);
missingUi.root.querySelector(".deck-focus-step-select").click();
ok("消えた対象の警告にも保存用IDを出さない", {
  human: missingUi.root.textContent.includes("要素：以前選んだ対象"),
  internal: missingUi.root.textContent.includes("missing-secret-id"),
}, { human: true, internal: false });
window.close(); delete globalThis.window; delete globalThis.document;

console.log("--- 3. 配布物と見本 ---");
execFileSync(process.execPath, [`${root}/scripts/build/deck-design.mjs`, "--check"]);
ok("共通部品と配布用の検査が最新", true);
for (const kind of ["presentation", "proposal", "report"]) {
  const path = `${root}/tests/checks/fixtures/internal/example/deck-design-${kind}.html`;
  const example = await readFile(path, "utf8");
  ok(`${kind} の全枚が設定に対応`, html.readDeckDesignHtml(example).ids.length, 6);
  ok(`${kind} は共通部品をそのまま含む`, example.includes(kit));
  ok(`${kind} は本文より先に見た目と起動処理を読む`, example.indexOf(kit) < example.indexOf("</head>"));
  const report = JSON.parse(execFileSync(process.execPath, [`${root}/bin/deck-design-check.mjs`, path], { encoding: "utf8" }));
  ok(`${kind} が配布用の検査を通る`, report.ok);
}
const source = await readFile(`${root}/src/lib/pages/store.ts`, "utf8");
ok("引き継いだ本文を配信キャッシュにも渡す", source.includes("warmPageHtml(page.id, versionId, html)"));
// Prevent the replacement-string $&/$`/$' expansion that can corrupt embedded bundles.
ok("共通部品は大きなグラフ部品と実行部の2本だけ", (kit.match(/<\/script>/g) ?? []).length, 2);
console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
process.exitCode = fails ? 1 : 0;
