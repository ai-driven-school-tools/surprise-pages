import {catalogAppearance} from './deck-catalog/appearance.mjs';
import { build } from "esbuild";
import { TITLES, createCatalogContent } from "./deck-catalog/content.mjs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "surprise-deck-formats-"));
await build({ entryPoints: [`${root}src/lib/deck/design/format-catalog.ts`], outfile: `${temporary}/catalog.mjs`, bundle: true, platform: "node", format: "esm" });
const { DECK_FORMAT_CATALOG } = await import(pathToFileURL(`${temporary}/catalog.mjs`).href);

const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const json = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
const flowTitles = {
  "flow-sequence":"観察から、次の判断へ進む。", "flow-state":"確認が終わったら、公開する。",
  "flow-input-output":"利用状況を、次の案内につなぐ。", "flow-causal":"初週支援の仮説を、次の検証へ。",
  "flow-branch":"条件を満たした申請だけ進める。", "flow-converge":"三つの材料から、改善を決める。",
  "flow-parallel":"調査と設計を、同時に進める。", "flow-cycle":"実行の結果を、次の観察へ戻す。",
  "flow-swimlane":"相談から回答まで、担当を渡す。", "flow-time":"3週間で、準備から振り返りまで。",
  "flow-hierarchy":"顧客の成果を、二つの仕事で支える。", "flow-network":"共通データで、部門をつなぐ。",
  "flow-set-overlap":"必要・価値・実現性が重なる案を選ぶ。", "flow-quadrant":"効果と負荷で、次の施策を決める。",
};
const familyLabels = {role:'提案の要点',image:'記録から共有へ',chart:'利用状況を読む',table:'比較と判断',flow:'仕組みと関係',media:'体験を伝える'};
function shell(format, body, attributes = "", options = {}) {
  const sourceTitle = TITLES[format.id] ?? flowTitles[format.id];
  const title = options.hero && !sourceTitle.includes("\n") ? sourceTitle.replace("、", "、\n") : sourceTitle;
  const heading = `<h${options.hero ? 1 : 2} class="${options.hero ? "dd-display" : options.visual ? "dd-statement" : "dd-title"}" data-dd-element-id="${options.headingId ?? 'claim'}">${escapeHtml(title).replaceAll('\n','<br>')}</h${options.hero ? 1 : 2}>`;
  const overline = `<p class="dd-overline">${escapeHtml(options.context ?? (options.hero ? 'ASTER NOTE / 初回体験の改善提案' : familyLabels[format.family] ?? '判断につなぐ'))}</p>`;
  const content = options.visual
    ? `<div class="dd-body"><div class="dd-product"><div class="dd-product-copy">${overline}${heading}${body}</div>${options.visual}</div></div>`
    : `${options.hero ? '' : `<header class="dd-slide-heading">${overline}${heading}</header>`}<div class="dd-body">${options.hero ? overline + heading : ''}${body}</div>`;
  return `<section id="${format.id}" data-deck-slide data-deck-id="${format.id}" data-dd-format="${format.id}" ${attributes} class="dd-composed${options.hero ? ' dd-composed-hero' : ''}">
${content}</section>`;
}
const { roleExample, imageExample, chartExample, tableExample, mediaExample, plans } = createCatalogContent({ shell, escapeHtml, json });

const flowSources = {
  "flow-sequence": 'flowchart LR\nstart["観察する<br/>いま起きていることを見る"] edge-hypothesis@-->|仮説| try["試す<br/>小さく確かめる"]\ntry edge-result@-->|結果| decide["決める<br/>次の一手を選ぶ"]',
  "flow-state": 'flowchart LR\ndraft(["下書き<br/>内容をそろえる"]) edge-review@-->|確認へ| review(["確認中<br/>相手の目を通す"])\nreview edge-publish@-->|承認| published(["公開済み<br/>みんなが使える"])',
  "flow-input-output": 'flowchart LR\ninput["利用状況<br/>行動の記録を集める"] edge-input-process@--> process["課題を特定<br/>困っている場面を探す"]\nprocess edge-process-output@--> output["次の案内<br/>行動できる一手にする"]',
  "flow-causal": 'flowchart LR\nsupport["初週の支援<br/>迷う時間を減らす"] edge-support-value@--> value["価値を体感<br/>自分の仕事で役立つ"]\nvalue edge-value-retention@--> retention["継続につながる<br/>使い続ける理由ができる"]',
  "flow-branch": "flowchart LR\nstart[申請] edge-start-decision@--> decision{条件を満たすか}\ndecision edge-approve@-->|はい| approve[承認]\ndecision edge-revise@-->|いいえ| revise[見直す]",
  "flow-converge": "flowchart LR\nvoice[顧客の声] edge-voice-decide@--> decide[改善を決める]\ndata[利用データ] edge-data-decide@--> decide\nsupport[支援記録] edge-support-decide@--> decide",
  "flow-parallel": "flowchart LR\nstart[開始] edge-start-research@--> research[調査]\nstart edge-start-design@--> design[設計]\nresearch edge-research-sync@--> sync[統合]\ndesign edge-design-sync@--> sync",
  "flow-cycle": "flowchart LR\nobserve[観察] edge-observe-plan@--> plan[計画]\nplan edge-plan-act@--> act[実行]\nact edge-act-learn@--> learn[学習]\nlearn edge-learn-observe@--> observe",
  "flow-swimlane": "flowchart LR\nsubgraph customer[顧客]\nrequest[相談]\nconfirm[確認]\nend\nsubgraph support[支援]\ntriage[整理]\nanswer[回答]\nend\nrequest edge-request-triage@--> triage\ntriage edge-triage-answer@--> answer\nanswer edge-answer-confirm@--> confirm",
  "flow-time": "gantt\ntitle 導入支援の3週間\ndateFormat YYYY-MM-DD\nsection 顧客\n準備 :a1, 2026-09-01, 5d\n試行 :a2, after a1, 7d\nsection 支援\n振り返り :b1, after a2, 5d",
  "flow-hierarchy": "flowchart TB\nmission[顧客の成果] edge-mission-adoption@--> adoption[活用]\nmission edge-mission-support@--> support[支援]\nadoption edge-adoption-habit@--> habit[習慣化]\nsupport edge-support-response@--> response[早い応答]",
  "flow-network": "flowchart LR\nhub[共通データ] edge-hub-sales@--> sales[営業]\nhub edge-hub-support@--> support[支援]\nhub edge-hub-product@--> product[製品]\nsales edge-sales-support@--> support\nsupport edge-support-product@--> product",
};

const flowNodeIds = {
  "flow-sequence": ["start", "try", "decide"], "flow-state": ["draft", "review", "published"],
  "flow-input-output": ["input", "process", "output"], "flow-causal": ["support", "value", "retention"],
  "flow-branch": ["start", "decision", "approve", "revise"], "flow-converge": ["voice", "data", "support", "decide"],
  "flow-parallel": ["start", "research", "design", "sync"], "flow-cycle": ["observe", "plan", "act", "learn"],
  "flow-swimlane": ["request", "confirm", "triage", "answer"], "flow-time": ["a1","a2","b1"],
  "flow-hierarchy": ["mission", "adoption", "support", "habit", "response"], "flow-network": ["hub", "sales", "support", "product"],
};
function flowTargets(format) {
  const ids = flowNodeIds[format.id] ?? [];
  const source = flowSources[format.id] ?? "";
  const edges = [...source.matchAll(/\b([a-z][a-z0-9-]*)@/g)].map((found) => found[1]);
  return `<ol class="dd-flow-targets">${ids.map((id) => `<li data-dd-node-id="${id}">${escapeHtml(flowNodeLabel(format.id,id))}</li>`).join("")}${edges.map((id) => `<li data-dd-edge-id="${id}">${id.replace(/^edge-/, "").replaceAll("-", " → ")}</li>`).join("")}</ol>`;
}
function flowNodeLabel(format,id) {
  const native={user:"利用者の必要",business:"事業の価値",feasible:"実現できる",onboarding:"初週支援",campaign:"広告追加",guide:"案内改善"};
  if(format==="flow-set-overlap"||format==="flow-quadrant")return native[id]??id;
  if(format==="flow-time")return {a1:"準備",a2:"試行",b1:"振り返り"}[id]??id;
  const match=new RegExp(`\\b${id}\\s*\\(?[\\[{]([^\\]}]+)`).exec(flowSources[format]??"");
  return match?match[1].replace(/^"|"$/g,"").replace(/<br\s*\/?>/gi," · "):id;
}

function flowExample(format) {
  if (format.id === "flow-set-overlap") {
    const source = { kind: "set-overlap", ariaDescription: "利用者の必要・事業の価値・実現可能性が重なる範囲", sets: [{ id: "user", label: "必要", x: 430, y: 190, radius: 150 }, { id: "business", label: "価値", x: 610, y: 190, radius: 150 }, { id: "feasible", label: "実現性", x: 520, y: 280, radius: 150 }], regions: [{ id: "decision", label: "進める", x: 520, y: 225 }] };
    return shell(format, `<figure class="dd-flow-figure" data-dd-native-diagram data-dd-element-id="diagram"><div class="dd-flow-diagram"></div><ol class="dd-flow-targets">${source.sets.map((item) => `<li data-dd-node-id="${item.id}">${item.label}</li>`).join("")}<li data-dd-region-id="decision">進める範囲</li></ol><script type="application/json" data-dd-native-source>${json(source)}</script></figure>`);
  }
  if (format.id === "flow-quadrant") {
    const source = { kind: "quadrant", ariaDescription: "効果と実行負荷の二軸で施策を配置", xAxis: "効果", yAxis: "実行負荷", xEnds: {start:"低い",end:"高い"}, yEnds: {start:"低い",end:"高い"}, points: [{ id: "onboarding", label: "初週支援", x: 850, y: 90 }, { id: "campaign", label: "広告追加", x: 410, y: 280 }, { id: "guide", label: "案内改善", x: 760, y: 240 }] };
    return shell(format, `<figure class="dd-flow-figure" data-dd-native-diagram data-dd-element-id="diagram"><div class="dd-flow-diagram"></div><ol class="dd-flow-targets">${source.points.map((item) => `<li data-dd-node-id="${item.id}">${item.label}</li>`).join("")}</ol><script type="application/json" data-dd-native-source>${json(source)}</script></figure>`);
  }
  const source = `%%{init: {"themeVariables": {"fontSize": "20px"}}}%%\n${flowSources[format.id] ?? "flowchart LR\nstart[開始] --> process[進める]\nprocess --> output[結果]"}`;
  return shell(format, `<figure class="dd-flow-figure" data-dd-mermaid-diagram data-dd-element-id="diagram"><div class="dd-flow-diagram"><pre class="mermaid">${escapeHtml(source)}</pre></div>${flowTargets(format)}</figure>`);
}

function example(format) {
  if (format.family === "role") return roleExample(format);
  if (format.family === "image") return imageExample(format);
  if (format.family === "chart") return chartExample(format);
  if (format.family === "table") return tableExample(format);
  if (format.family === "flow") return flowExample(format);
  return mediaExample(format);
}

const slides = DECK_FORMAT_CATALOG.map(example);
const darkSlides = new Set(["title", "divider", "quote", "summary"]);
const slideAppearance = Object.fromEntries(DECK_FORMAT_CATALOG.map(format => [format.id, catalogAppearance(format.id, {dark: darkSlides.has(format.id)})]));
const design = { version: 1, document: catalogAppearance('title'), slides: slideAppearance };
const flowPlans = {
  "flow-sequence": [["観察から仮説へ", ["node:start", "edge:edge-hypothesis"]], ["結果を次の判断へ", ["node:try", "edge:edge-result", "node:decide"]]],
  "flow-state": [["確認に進む条件", ["node:draft", "edge:edge-review", "node:review"]], ["承認してから公開", ["edge:edge-publish", "node:published"]]],
  "flow-input-output": [["記録から課題を特定", ["node:input", "node:process"]], ["次に行動できる案内へ", ["node:output"]]],
  "flow-causal": [["検証するつながり", ["node:support", "node:value", "edge:edge-support-value"]], ["継続への影響は追加検証", ["node:retention", "edge:edge-value-retention"]]],
  "flow-branch": [["条件を確認", ["node:decision"]], ["満たす道と見直す道", ["edge:edge-approve", "node:approve", "edge:edge-revise", "node:revise"]]],
  "flow-converge": [["材料を別々に集める", ["node:voice", "node:data", "node:support"]], ["一つの判断へ統合", ["node:decide"]]],
  "flow-parallel": [["同時に進める二つの仕事", ["node:research", "node:design"]], ["両方をそろえて統合", ["node:sync", "edge:edge-research-sync", "edge:edge-design-sync"]]],
  "flow-cycle": [["観察して実行する", ["node:observe", "node:plan", "node:act"]], ["学習を次へ戻す", ["node:learn", "edge:edge-learn-observe"]]],
  "flow-swimlane": [["相談を支援担当へ渡す", ["node:request", "edge:edge-request-triage", "node:triage"]], ["回答を顧客が確認", ["node:answer", "edge:edge-answer-confirm", "node:confirm"]]],
  "flow-time": [["準備して試行する", ["node:a1", "node:a2"]], ["最後に振り返る", ["node:b1"]]],
  "flow-hierarchy": [["成果を支える二つの仕事", ["node:adoption", "node:support"]], ["仕事の具体的な中身", ["node:habit", "node:response"]]],
  "flow-network": [["共通データを中心に置く", ["node:hub"]], ["現場の声を製品へ戻す", ["node:support", "edge:edge-support-product", "node:product"]]],
  "flow-set-overlap": [["三つの条件をそろえる", ["node:user", "node:business", "node:feasible"]], ["重なった範囲で進める", ["region:decision"]]],
  "flow-quadrant": [["高い効果と小さな負荷", ["node:onboarding"]], ["他の施策との差を確認", ["node:campaign", "node:guide"]]],
};
const focus = { version: 1, guidedByDefault: true, slides: {} };
for (const format of DECK_FORMAT_CATALOG) {
  const authored = format.family === "flow" ? flowPlans[format.id].map(([title, references]) => ({ title, targets: references.map((value) => { const [kind, id] = value.split(":"); return { kind, id }; }) })) : plans[format.id];
  if (!authored?.length) throw new Error(`意味のある焦点が不足しています: ${format.id}`);
  focus.slides[format.id] = { steps: [{ id: "overview", title: `${format.name} — 全体を見る`, supplement: "ASTER NOTEの架空事例。製品・人物・数値はデザイン検討用の例です。", actions: [{ id: "overview", kind: "overview", targets: [] }] }, ...authored.map((step, index) => ({
    id: `decision-${index + 1}`, title: step.title, ...(step.supplement ? { supplement: step.supplement } : {}),
    actions: [{ id: `focus-${index + 1}`, kind: step.targets.some((target) => target.kind === "range") ? "range" : "emphasize", targets: step.targets.map((target) => ({ ...target, slideId: format.id })) }],
  }))] };
}
const logo = { version: 1, asset: { path: "assets/aster-logo.svg", contentType: "image/svg+xml", intrinsicWidth: 400, intrinsicHeight: 96 }, document: { placement: "hidden", size: 12, opacity: 100, offsetX: 40, offsetY: 40, nudgeX: 0, nudgeY: 0, color: "original", backplate: false }, slides: {} };

const mermaidTemplate = await readFile(`${root}src/templates/mermaid.html`, "utf8");
const mermaid = mermaidTemplate.slice(mermaidTemplate.indexOf("<script",mermaidTemplate.indexOf("-->")+3),mermaidTemplate.lastIndexOf("</script>")+9);
const designKit = await readFile(`${root}src/templates/deck-design.html`, "utf8");
const deck = await readFile(`${root}src/templates/deck.html`, "utf8");
const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ASTER NOTE — 63の完成例</title>
<!-- 架空ASTER NOTEのデザイン検討資料。素材はassets/のローカル生成物を使用。 -->
<script type="application/json" data-deck-design>${json(design)}</script>
<script type="application/json" data-deck-focus>${json(focus)}</script>
<script type="application/json" data-deck-logo>${json(logo)}</script><!--DECK_DESIGN_START-->${designKit}<!--DECK_DESIGN_END-->
<!--DECK_RUNTIME_START-->${deck}<!--DECK_RUNTIME_END-->
</head><body data-deck><main data-deck-slides>${slides.join("\n")}</main>
<!--MERMAID_START-->${mermaid}<!--MERMAID_END-->

</body></html>`;

const familyNames = { role: "資料内の役割", image: "画像", chart: "データグラフ", table: "表", flow: "関係・流れ", media: "人物・製品・媒体・演習" };
const markdown = `# スライド形式台帳\n\nこの一覧は \`src/lib/deck/design/format-catalog.ts\` から生成する。用途ごとの独立した雛形ではなく、共通の配置・表・画像・グラフ・図の部品を組み替える。\n\n${Object.entries(familyNames).map(([family, name]) => `## ${name}\n\n| 形式 | 目的 | 必要な材料 | 構図 | 強調できる対象 | 読む表示 |\n| --- | --- | --- | --- | --- | --- |\n${DECK_FORMAT_CATALOG.filter((format) => format.family === family).map((format) => `| \`${format.id}\` ${format.name} | ${format.purpose} | ${format.inputs.map((input) => `${input.name}${input.required ? "*" : ""}`).join(" / ")} | ${format.compositionVariants.join(" / ")} | ${format.focusTargets.join(" / ")} | ${format.staticReading} |`).join("\n")}`).join("\n\n")}\n`;

const outputs = [
  [`${root}tests/checks/fixtures/internal/example/deck-format-catalog.html`, html],
  [`${root}docs/guides/deck-formats.md`, markdown],
];
const outputIndex = process.argv.indexOf("--output");
if (outputIndex >= 0) {
  const target = process.argv[outputIndex + 1];
  if (!target) throw new Error("--output の保存先が必要です");
  await writeFile(target, html);
} else if (process.argv.includes("--check")) {
  for (const [path, expected] of outputs) {
    if (await readFile(path, "utf8") !== expected) throw new Error(`${path} を組み立て直してください`);
  }
} else {
  for (const [path, value] of outputs) await writeFile(path, value);
}
await rm(temporary, { recursive: true, force: true });
