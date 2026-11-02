/**
 * ページが外から取ってきていた 3 本を、自前で配る仕掛けを確かめる。
 *
 * ほとんどのページが読み込む 3 本なので、ここが壊れると見た目が黙って崩れる。
 * とくに危ないのは **差し替え先の行き先と、配る側が受け付ける行き先がずれる**こと。
 * 片方だけ直しても手元では気づけないので、ここでは文字列を書き写さずに、
 *
 *   1. 本物の材料（tests/checks/fixtures）を実際に差し替えさせて、そこから行き先を取り出し
 *   2. app 以下を歩いて「この 3 本を配っている受け口」を見つけ、その受け持ち範囲と突き合わせ
 *   3. 見つけた受け口を本当に呼んで、返ってきた指定と中身を見る
 *
 * という順で、両側を実物どうしで突き合わせる。
 *
 * 材料は 2 枚ある。**1 枚のページが 3 本ぜんぶを読み込むとは限らない**ので
 * （図を使わないページは図の道具を読まない）、拾った行き先は 2 枚ぶんを合わせて見る。
 *
 * 書体（fonts.googleapis.com）は**触らないと決めた**ので、残っているのが正しい。
 * 消えていたら間違いなので、ここで落とす。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";

import { root, dir } from "./paths.mjs";

const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);
const { stampOf, vendorStamps, readVendorPart, VENDOR_PARTS, VENDOR_STAMP_FILE } = await import(
  `${root}/scripts/build/vendor.mjs`
);

// 配る側は「いまいる場所」から現物を数える。検査のときも同じ場所から数えさせる
process.chdir(root);

const ok = (label, actual, expected) =>
  console.log(`${String(actual) === String(expected) ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

// ---------------------------------------------------------------- 材料をそろえる

await build({
  entryPoints: [`${root}/src/lib/pages/content.ts`],
  outfile: `${dir}/vendor-content.mjs`,
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*"],
});
const { withVendorScripts, withCommentsWidget, withAssetBase, vendorSrc, VENDOR_STAMPS, VENDOR_BASE } =
  await import(`${dir}/vendor-content.mjs`);

const stampFile = JSON.parse(readFileSync(VENDOR_STAMP_FILE, "utf8"));

/** 本物の材料。ページの正本ではないが、雛形どおりの読み込みタグが入っている。 */
const fixture = readFileSync(`${root}/tests/checks/fixtures/public/guide/how-to-use.html`, "utf8");
/** 配信のときと同じ順で通したもの。ここから先はこれを見る。 */
const served = withVendorScripts(withCommentsWidget(withAssetBase(fixture, "/public/guide/how-to-use")));

/** 図を使う材料。上の 1 枚は図を読み込まないので、図の道具はこちらで見る。 */
const diagramFixture = readFileSync(`${root}/tests/checks/fixtures/internal/guide/diagrams.html`, "utf8");
const diagramServed = withVendorScripts(
  withCommentsWidget(withAssetBase(diagramFixture, "/internal/guide/diagrams")),
);
/** グラフの大きな道具はデザイン雛形だけが読む。 */
const deckDesignFixture = readFileSync(`${root}/src/templates/deck-design.html`, "utf8");
const deckDesignServed = withVendorScripts(deckDesignFixture);
/** 材料を合わせた「実際に指している行き先」。1 枚では全部そろわない。 */
const injectedHrefs = [served, diagramServed, deckDesignServed].flatMap((html) =>
  [...html.matchAll(/<script[^>]+src="(\/vendor\/[^"]+)"/gi)].map((hit) => hit[1]),
);

console.log("\n--- 置いた現物 ---");

for (const part of VENDOR_PARTS) {
  const source = readVendorPart(part);
  const license = readFileSync(`${root}/${part.licenseFile}`, "utf8");
  const kb = (source.length / 1024).toFixed(1);
  ok(`${part.name}: 空でない`, source.length > 0, true);
  // 中身は 1 バイトも削らない決め。極端に小さいのは取り込み失敗（転送のページなど）
  ok(`${part.name}: 想定の大きさ（100KB 超）`, source.length > 100 * 1024, true);
  // 上限は 1 本ずつ違う（図の道具だけ桁が 1 つ大きい）。全体で 1 つにすると見張りが緩む
  ok(`${part.name}: 想定の大きさ（${(part.maxBytes / 1024 / 1024).toFixed(0)}MB 未満）`, source.length < part.maxBytes, true);
  ok(`${part.name}: 書き出した大きさと合う`, stampFile[part.name]?.bytes, source.length);
  console.log(`     （${part.file}・${kb} KB・${part.version}）`);
  ok(`${part.name}: ライセンス表記が空でない`, license.trim().length > 0, true);
  ok(`${part.name}: ライセンス表記が ${part.license}`, license.includes(part.license), true);
  ok(`${part.name}: 版を控えてある`, /^\d+\.\d+\.\d+$/.test(part.version), true);
  ok(`${part.name}: 取り元は版を固定した URL`, part.source.includes(part.version), true);
}

console.log("\n--- 印が中身から決まるか ---");

const computed = vendorStamps();
for (const part of VENDOR_PARTS) {
  ok(`${part.name}: 書き出した印と、いまの中身の印が同じ`, stampFile[part.name]?.stamp, computed[part.name].stamp);
  ok(`${part.name}: 差し込む側も同じ印を見ている`, VENDOR_STAMPS[part.name], stampFile[part.name]?.stamp);
  ok(`${part.name}: 印は URL に出せる短い文字だけ`, /^[0-9a-f]{8,16}$/.test(stampFile[part.name]?.stamp ?? ""), true);
}
ok("中身が変われば印も変わる", stampOf("あ") === stampOf("い"), false);
ok("中身が同じなら印も同じ", stampOf("あ") === stampOf("あ"), true);
ok(
  "どの 2 本も印が取り違えられていない",
  new Set(VENDOR_PARTS.map((part) => VENDOR_STAMPS[part.name])).size,
  VENDOR_PARTS.length,
);

console.log("\n--- 差し替え後の本文に外の行き先が残っていないか ---");

ok("見た目の道具を外から取りに行かない", served.includes("cdn.tailwindcss.com"), false);
ok("絵記号を外から取りに行かない", served.includes("unpkg.com"), false);
ok("図の道具を外から取りに行かない", diagramServed.includes("cdn.jsdelivr.net"), false);
ok("グラフの道具を外から取りに行かない", deckDesignServed.includes("cdn.jsdelivr.net"), false);
ok("そもそも材料には入っていた（差し替えが効いた証拠・道具）", fixture.includes("cdn.tailwindcss.com"), true);
ok("そもそも材料には入っていた（差し替えが効いた証拠・絵記号）", fixture.includes("unpkg.com"), true);
ok("そもそも材料には入っていた（差し替えが効いた証拠・図）", diagramFixture.includes("cdn.jsdelivr.net"), true);
ok("そもそも材料には入っていた（差し替えが効いた証拠・グラフ）", deckDesignFixture.includes("echarts@6.1.0"), true);

// 図の材料は、貼るところの雛形（src/templates/mermaid.html）と同じ行き先を書いていること。
// 雛形だけ直して材料が古いままだと、差し替えが効かない書き方を配り続ける
const mermaidPart = VENDOR_PARTS.find((part) => part.name === "mermaid.js");
const mermaidTemplate = readFileSync(`${root}/src/templates/mermaid.html`, "utf8");
ok("雛形が書いている行き先は版を書かない形", mermaidTemplate.includes(`src="${mermaidPart.cdn}/`), true);
ok("材料も雛形と同じ行き先を書いている", diagramFixture.includes(`src="${mermaidPart.cdn}/`), true);

console.log("\n--- 図の雛形（貼る一式）---");

/**
 * 雛形から「ページに貼る一式」を切り出す。
 *
 * 先頭の但し書きの中に `<script>` の字が出てくるので、**但し書きの終わりから探す**。
 * 素朴に最初の `<script` を取ると、説明文を掴んで写しの突き合わせが常に落ちる。
 */
function embedBlock(html) {
  const afterNote = html.indexOf("-->") + "-->".length;
  const from = html.indexOf("<script", afterNote);
  const to = html.lastIndexOf("</script>") + "</script>".length;
  return from < 0 || to <= from ? "" : html.slice(from, to);
}

const embed = embedBlock(mermaidTemplate);
ok("雛形から一式を切り出せる", embed.startsWith("<script") && embed.endsWith("</script>"), true);
ok("切り出したのは script 2 本", embed.split("<script").length - 1, 2);
ok("切り出したのは style 1 枚", embed.split("<style").length - 1, 1);
// 写しが古いと、検査は通るのに配っている書き方は別物、が起きる。字下げごと突き合わせる
ok("材料は雛形の一式を 1 文字も変えずに写している", diagramFixture.includes(embed), true);

// 色は額縁（社内スキルの base.html）が名前で持っていればそちらを見る。
// 名前が無い素のページでは無彩色に落ちる。どちらも欠けると、額縁の側だけ色が合わなくなる
for (const token of ["--ads-text", "--ads-muted", "--ads-line", "--ads-border", "--ads-surface-2", "--ads-bg"]) {
  ok(`額縁の名前を先に見る（${token}）`, embed.includes(`"${token}"`), true);
}
ok("名前が無いときの落ち先がある", /getPropertyValue\([^)]*\)[\s\S]{0,120}\?[\s\S]{0,40}: fallback/.test(embed), true);

// 人型（棒人間）を絵記号に差し替える。図の道具には絵記号を選ばせる口が無いので、描き終えてから置き換える
ok("描き終わりを自分で掴む（任せない）", /startOnLoad:\s*false/.test(embed), true);
ok("自分で走らせている", embed.includes("mermaid.run()"), true);
ok("書き損じても絵記号の差し替えは走る", /finally\s*{/.test(embed), true);
ok("差し替える相手は順序図の人", embed.includes("g.actor-man"), true);

/*
 * 絵記号の形は、置いてある絵記号の一式（vendor/lucide）から取り出して突き合わせる。
 * 雛形には形を書き写してあるので（絵記号の一式を読み込んでいないページでも差し替わるように）、
 * 書き写し間違いと、絵記号の一式を入れ替えたときのずれを、ここで落とす。
 */
const lucideModule = { exports: {} };
const lucideSource = readVendorPart(VENDOR_PARTS.find((part) => part.name === "lucide.js")).toString("utf8");
new Function("exports", "module", lucideSource)(lucideModule.exports, lucideModule);
const userRound = lucideModule.exports.icons?.UserRound ?? [];
ok("置いてある一式から user-round を取り出せる", userRound.length > 0, true);
for (const [tag, attrs] of userRound) {
  const written = Object.entries(attrs)
    .map(([key, value]) => `${key}: "${value}"`)
    .join(", ");
  ok(`絵記号の形が一式と同じ（${tag}）`, embed.includes(`["${tag}", { ${written} }]`), true);
}
ok("絵記号の色は図の記号の色（額縁では ads-line に落ちる）", embed.includes("stroke:${line}"), true);
/*
 * 図の道具の CSS は `.actor-man circle, line` を名指しして塗りと太さ（2px）を決めている。
 * 名指しの指定は親から降ってきた指定より必ず強いので、親の g にまとめて書くと
 * 絵記号のうち丸と線だけが道具の側の見た目になる（顔の丸だけ塗られて太くなる）。
 */
ok("図の道具が丸と線を名指ししている", readVendorPart(mermaidPart).toString("utf8").includes(".actor-man circle, line"), true);
ok("描き方は形の 1 つずつに書く", /stroke\.setAttribute\("style", paint\)/.test(embed), true);
ok("親の g にまとめて書かない", /icon\.setAttribute\(\s*"style"/.test(embed), false);
// 図の道具の作りが変わった日に、消しただけで何も出ない状態にしない
ok("見つけた形が違ったら手を出さない", /if\s*\(!head \|\| limbs\.length === 0\)\s*continue/.test(embed), true);

console.log("\n--- 図の置き方（縮めない・横へ送る）---");

/*
 * ここが崩れると、狭い画面でだけ静かに読めなくなる。
 * 器に合わせて縮める既定に戻すと、図の中の字はスマホで 0.44 倍（5px）まで落ちるが、
 * 広い画面では何も起きないので、手元で見ている限り気づけない。
 */
ok("器に合わせて縮めない", /const LAYOUT = \{ useMaxWidth: false \}/.test(embed), true);
for (const kind of ["flowchart", "sequence", "state"]) {
  ok(`縮めない指定が効いている（${kind}）`, new RegExp(`${kind}: LAYOUT`).test(embed), true);
}
ok("縮めない指定が効いている（gantt）", /gantt: \{\s*\.\.\.LAYOUT,/.test(embed), true);

// 縮めない代わりの逃げ道。これが無いと、はみ出した図はただ切れる
ok("足りないときは横へ送る", /pre\.mermaid \{[\s\S]{0,200}overflow-x: auto/.test(embed), true);
ok("送りきったあとページごと動かさない", embed.includes("overscroll-behavior-x: contain"), true);
ok("収まるときは真ん中に置く", /pre\.mermaid > svg \{[\s\S]{0,200}margin-inline: auto/.test(embed), true);

// 送れることを示す印。黙って切れていると、全部見えているのか途中なのかが分からない
for (const side of ["right", "left", "both"]) {
  ok(`先があることを端で示す（${side}）`, embed.includes(`pre.mermaid[data-overflow="${side}"]`), true);
}
ok("印は帯や線ではなく図を溶かして出す", embed.includes("mask-image: linear-gradient"), true);
ok("古い側の書き方も置いてある", embed.includes("-webkit-mask-image: linear-gradient"), true);
ok("送れる向きを測って印を付ける", /pre\.dataset\.overflow = head && tail \? "both"/.test(embed), true);
ok("送れる図はキーボードでも動かせる", /pre\.setAttribute\("tabindex", "0"\)/.test(embed), true);
ok("送れない図に焦点を残さない", /pre\.removeAttribute\("tabindex"\)/.test(embed), true);
ok("画面が変わったら印を取り直す", embed.includes("ResizeObserver"), true);

// 紙の上では横へ送れない。刷るときだけは縮めるほかない
ok("刷るときは収まるまで縮める", /@media print \{[\s\S]{0,320}max-width: 100%/.test(embed), true);

console.log("\n--- 図の中の字はページの目盛りに乗せる ---");

/*
 * 図は本文の一部なので、中の字は本文と同じ物差しに乗っていないといけない。
 * 既定のままだと順序図だけ 16px（地の文と同寸）で、流れ図・状態遷移図の 14px から外れる。
 * 順序図は登場人物・やりとり・注記を個別に指定できるように見えて、
 * 上位の 1 つが 3 つとも上書きするので、そろえるならそこで決めるほかない。
 */
ok("図の中の字は text-sm", /^\s*fontSize: 14,$/m.test(embed), true);
ok("日程の帯の中と日付は text-xs", /gantt: \{[^}]*fontSize: 12/.test(embed), true);
ok("日程の区間の名前は text-sm", /const SECTION_FONT_SIZE = 14/.test(embed), true);
ok("区間の名前の大きさは 1 か所から配る", /sectionFontSize: SECTION_FONT_SIZE/.test(embed), true);
// 日付だけは目盛りの道具が 10px と書き込むので、初期化の値では動かない
ok("日付の 10px を目盛りに戻す", /\.grid \.tick text \{\s*font-size: 12px;/.test(embed), true);

console.log("\n--- 名詞は本文の字、動詞は添え字 ---");

/*
 * 図の道具は矢印に乗る札を、節点の名前と同じ 14px・同じ文字色で描く。
 * 状態遷移図は状態が 3〜4 個、札も 3〜4 個あるので、同じ強さだと札の列が状態と
 * 対等に読まれ、どれが状態でどれが動きかを字面から拾えない。1 段落とすと状態だけが
 * 浮き上がり、札は矢印に添えた注として読める。幅も縮むので隣との隙間もそのぶん開く。
 *
 * 順序図のやりとりはここに入れない。あれは矢印が主役の図で、落とすと中身が薄くなる。
 */
ok("矢印の札は text-xs", /const EDGE_FONT_SIZE = 12/.test(embed), true);
ok("札を添え字に落とす", embed.includes("function quietEdgeLabels"), true);
ok("落とすのは大きさと色の両方", /part\.style\.fontSize[\s\S]{0,80}part\.style\.color = faint/.test(embed), true);
// 道具は `#図の目印 .edgeLabel` の形で書いてくるので、こちらの style では届かない
ok("当てるのは形の 1 つずつに直に", /querySelectorAll\("\.edgeLabel, \.edgeLabel \*"\)/.test(embed), true);
ok("順序図のやりとりには当てない", /querySelectorAll\([^)]*messageText/.test(embed), false);
ok("描き終わってから走らせる（札）", /quietEdgeLabels\(svg\)/.test(embed), true);

console.log("\n--- 面＝量、線＝入れ物 ---");

/*
 * 塗りと輪郭は、どちらも「囲む」役。1 つの箱に両方持たせると道具が二重になる。
 * 長さや幅が意味を持つもの（日程の帯・順序図の呼ばれている間）だけを面で読ませ、
 * ただの入れ物（節点・登場人物）は輪郭だけにする。注記も同じ語彙（紙＋輪郭）になる。
 *
 * 面を持つ側を紙にしてしまうと帯が消えるので、ここは向きも一緒に見る。
 */
const themeValue = (key) => new RegExp(`^\\s{6}${key}: (\\w+),`, "m").exec(embed)?.[1] ?? "(無い)";
for (const key of ["primaryColor", "secondaryColor", "actorBkg"]) {
  ok(`入れ物は輪郭だけ（${key}）`, themeValue(key), "paper");
}
for (const key of ["taskBkgColor", "activationBkgColor"]) {
  ok(`量は面で読ませる（${key}）`, themeValue(key), "face");
}
// 札の下敷きは矢印を隠すためのもの。面の色だと、紙の上に灰色の粒が並ぶ
ok("札の下敷きは紙の色", themeValue("edgeLabelBackground"), "paper");

/*
 * 量を持たない印が、量を持つものより濃く出ていないか。
 * 塗りつぶした丸は面積があるぶん、輪郭 1px の部品より必ず重く見える。
 * 状態遷移図の始点（既定は半径 7）と順序図の連番（既定は文字色べた塗り）が
 * それで、囲みを軽くしたぶん、図の中でいちばん濃い点が「入口」「番号」になっていた。
 */
ok("量ではない印を落ち着かせる", embed.includes("function calmMarks"), true);
ok("始点は小さくする", /const START_RADIUS = 5/.test(embed), true);
ok("始点の色は変えない（矢印と同じ線の色で合っている）", /circle\.state-start"\)\) \{\s*mark\.setAttribute\("r"/.test(embed), true);
// 連番の丸は defs の marker の中にあり、線そのものには色が付いていない
ok("連番は marker の中の丸を塗り替える", /marker\[id\$="sequencenumber"\] circle/.test(embed), true);
ok("連番は囲みの線の色まで落とす", /disc\.style\.fill = edge/.test(embed), true);
ok("連番の数字は文字色に上げる", /label\.style\.fill = ink/.test(embed), true);
ok("描き終わってから走らせる（印）", /calmMarks\(svg\)/.test(embed), true);

console.log("\n--- 図の中の色は、ぜんぶ額縁から採る ---");

/*
 * 渡しそこねた名前があると、図の道具がその色を**自分で計算して**埋める。
 * 気づきにくいのは「明るい画面では黒っぽいので合っているように見える」ことで、
 * 図の題と日程の区間名は、渡さないと明るい画面で真っ黒（#000）・
 * 暗い画面でクリーム色になり、すぐ隣の帯の中の字と違う色で出ていた。
 */
ok("図の題と区間の名前も額縁の文字色", /titleColor: ink/.test(embed), true);

/*
 * 渡している色が、額縁から採った 6 つ（と字の指定）だけでできているか。
 * ここに生の色を 1 つ書くと、暗い画面でだけ沈む・浮くという形で出る。
 */
const themeBlock = /themeVariables: \{([\s\S]*?)\n    \},/.exec(embed)?.[1] ?? "";
const FRAME_COLORS = ["ink", "faint", "line", "edge", "face", "paper"];
const themeValues = [...themeBlock.matchAll(/^\s{6}(\w+): (.+?),\s*$/gm)].map((hit) => [hit[1], hit[2]]);
ok("色の指定を拾えている", themeValues.length > 20, true);
const strays = themeValues.filter(
  ([, value]) => !FRAME_COLORS.includes(value) && value !== "FONT" && value !== '"14px"',
);
ok("額縁から採っていない色を書いていない", strays.map(([key]) => key).join(" ") || "なし", "なし");

console.log("\n--- 日程は寸法を先に決める ---");

/*
 * 日程だけは器の幅で組み直す図で、狭い器に入れると目盛りが重なる
 * （幅 390px の器では 15 個中 14 か所が重なった）。
 * 幅を先に決めて器に合わせさせず、それでも並びきらない日付は描いてから間引く。
 *
 * ただし**段（器）を超えたままにはしない**。570 は「3 週間が並ぶ幅」でしかなく
 * 段の幅とは無関係なので、区間名が少し伸びただけで段を数 px 超えることが起きる。
 * 数 px でも超えれば横棒が出て、端が薄れ、真ん中寄せが解けて、そのページで
 * 1 枚だけ左端がずれる（段幅 728 に対して 735 で、実際に起きていた）。
 * 詰めても日付は間引きが効くので、落ちるのは刻みだけ。
 */
ok("帯と日付が並ぶ幅は決め打ち", /const GANTT_PLOT = 570/.test(embed), true);
ok("詰めてよい下限がある", /const GANTT_PLOT_MIN = \d+/.test(embed), true);
ok("器を測って上限にする", /room = Math\.min\(room, pre\.clientWidth\)/.test(embed), true);
ok("測れない器は数に入れない", /if \(pre\.clientWidth > 0\)/.test(embed), true);
ok("器は一番狭いほうに合わせる", /Math\.min\(wanted, Math\.floor\(room\)\)/.test(embed), true);
ok("下限より下では詰めずに横へ送る", /Math\.max\(frame \+ GANTT_PLOT_MIN, /.test(embed), true);
ok("日程が無いページでは器を見ない", /Number\.isFinite\(room\)\s*\?/.test(embed), true);
ok("並びきらない目盛りは間引く", embed.includes("function thinTicks"), true);
ok("間引くのは測ってから", /const boxes = ticks\.map\(\(tick\) => tick\.getBoundingClientRect\(\)\)/.test(embed), true);
ok("測れない場所では触らない", /if \(!boxes\.some\(\(box\) => box\.width > 0\)\) return/.test(embed), true);
// 字だけ消すと、意味の無い格子の線だけが残る
ok("落とすのは日付と格子の線ごと", /if \(i % step\) tick\.remove\(\)/.test(embed), true);
ok("描き終わってから走らせる", /thinTicks\(svg\)/.test(embed), true);

console.log("\n--- 日程の区間名（左の列）---");

/*
 * 図の道具は区間名を「行全体のまん中」に置く。区間ごとに色の帯を敷いてある前提の置き方で、
 * 帯を消してあるこちらでは、名前が行と行のあいだの余白に浮いて、どの行のことか指せない。
 * 列の幅も 75px の決め打ちで、日本語だと 6 文字で足りずに帯の上へはみ出す。
 * どちらも広い画面では「なんとなく変」で済んでしまい、狭い画面ではっきり崩れる。
 */
ok("区間名は先頭の行にそろえる", embed.includes("function alignSectionTitles"), true);
ok("そろえ先は行の座標から出す", /title\.setAttribute\("y", String\(top \+ height \/ 2\)\)/.test(embed), true);
ok("作りが思っているものと違ったら触らない", /runs\.length !== titles\.length\) return/.test(embed), true);

/*
 * 横は右そろえ。名前は帯を指すためにあるので、寄せる先は左の余白ではなく帯。
 * 字数の違う名前（「下ごしらえ」と「仕上げ」）の右端がそろって縁が 1 本できるぶん、
 * 区切りの線を足さずに済む。
 *
 * そろえるには 2 か所いる。道具は名前を text の中の tspan に入れ、その tspan に
 * 左端の x を書き直すので、外側の text だけ動かしても字は動かない（右端が 80 と 52 に
 * 割れたまま出た）。そろえ方も道具の CSS が名指しで持っているので、属性ではなく style。
 */
ok("区間名は右そろえ", /title\.style\.textAnchor = "end"/.test(embed), true);
ok("そろえ方は属性ではなく style に書く", /setAttribute\("text-anchor"/.test(embed), false);
ok("右端は左の列の幅から出す", /const right = ganttGutter - SECTION_X/.test(embed), true);
ok("中の tspan にも同じ右端を書く", /querySelectorAll\("tspan"\)\) part\.setAttribute\("x", String\(right\)\)/.test(embed), true);
ok("左の列の幅は測ったところから持ち回す", /ganttGutter = gutter/.test(embed), true);
// 順序図にも同じ名札（sectionTitle）の部品がある。種類で切らないと、そちらを動かしてしまう
ok("日程の手当ては日程にだけ当てる", /aria-roledescription"\) === "gantt"/.test(embed), true);

ok("左の列は名前を測って決める", embed.includes("function ganttSize"), true);
ok("測るのは出来上がりと同じ字", /font-size:\$\{SECTION_FONT_SIZE\}px/.test(embed), true);
ok("測ったら片付ける", /finally \{\s*ruler\.remove\(\);/.test(embed), true);
ok("短い名前のときは道具の既定のまま", /Math\.max\(GANTT_GUTTER, Math\.ceil\(widest\)/.test(embed), true);
ok("名前は <br> で折れる", /split\(\/<br\\s\*\\\/\?>\/i\)/.test(embed), true);

// 図の道具は 2 度目の初期化を「足す」ではなく「取り直す」。分けて呼ぶと 1 度目の色も字も既定に戻る
ok("初期化はちょうど 1 度だけ", embed.split("mermaid.initialize(").length - 1, 1);
ok("初期化は本文が出そろってから（測るのに本文が要る）", /DOMContentLoaded[\s\S]{0,400}mermaid\.initialize\(/.test(embed), true);

console.log("\n--- 書体は触らない ---");

ok("書体の指定が残っている", served.includes("https://fonts.googleapis.com/css2"), true);
ok("書体への先つなぎが残っている", served.includes('<link rel="preconnect" href="https://fonts.googleapis.com">'), true);
ok("書体の配り元への先つなぎが残っている", served.includes("https://fonts.gstatic.com"), true);
ok(
  "書体の行が材料と同じ数だけある",
  served.split("fonts.googleapis.com").length,
  fixture.split("fonts.googleapis.com").length,
);

console.log("\n--- 版を書いてある行き先には手を出さない ---");

const pinned = withVendorScripts(
  '<script src="https://cdn.tailwindcss.com/3.3.0"></script>' +
    '<script src="https://unpkg.com/lucide@0.400.0"></script>' +
    '<script src="https://cdn.tailwindcss.com?plugins=forms"></script>' +
    '<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>' +
    // 小分けを後から取りに行く形。置いてあるのはひとかたまりの 1 本なので、
    // ここに当てると「モジュールとして読み込む」約束が破れてページごと止まる
    '<script type="module" src="https://cdn.jsdelivr.net/npm/mermaid@latest/dist/mermaid.esm.min.mjs"></script>',
);
ok("版を書いた道具はそのまま外を指す", pinned.includes("https://cdn.tailwindcss.com/3.3.0"), true);
ok("版を書いた絵記号はそのまま外を指す", pinned.includes("https://unpkg.com/lucide@0.400.0"), true);
ok("道具を足す指定はそのまま外を指す", pinned.includes("https://cdn.tailwindcss.com?plugins=forms"), true);
ok("版を書いた図の道具はそのまま外を指す", pinned.includes("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"), true);
ok("小分けを取りに行く形には当てない", pinned.includes("mermaid.esm.min.mjs"), true);
ok("版を書いた行き先は 1 つも差し替えない", pinned.includes(VENDOR_BASE), false);

console.log("\n--- 差し替えが本文をこわさないか ---");

ok("2 回通しても結果が変わらない", withVendorScripts(served) === served, true);
// 比べるのは差し替える前（道具箱の札と部品の先読みを足した後）。足した札の長さを差し替えの増分と取り違えない。ゆとりは前と同じ 200 字
ok("本文の長さが増えていない（行き先が短くなるだけ）", served.length <= withCommentsWidget(withAssetBase(fixture, "/public/guide/how-to-use")).length + 200, true);
ok("読み込みタグの数が変わらない", served.split("<script").length, fixture.split("<script").length + 1);
// この 1 枚が読み込んでいるのは 2 本（図を使わないページ）。図の 1 本は下の材料で見る
ok("差し替え済みの本文には自前の行き先が 2 つ", served.split(`${VENDOR_BASE}/`).length - 1, 2);
ok("図の材料には自前の行き先が 1 つ", diagramServed.split(`${VENDOR_BASE}/`).length - 1, 1);
ok("図の材料も 2 回通して結果が変わらない", withVendorScripts(diagramServed) === diagramServed, true);
ok("何も無い本文でも落ちない", withVendorScripts(""), "");

console.log("\n--- 差し替え先と、配る受け口が一致するか ---");

/** app 以下を歩いて、この 3 本を配っている受け口（route.ts）を探す。 */
function findVendorRoutes(from, segments = []) {
  const found = [];
  for (const name of readdirSync(from).sort()) {
    const full = `${from}/${name}`;
    if (statSync(full).isDirectory()) {
      // 束ね用の括弧つきフォルダは URL に出ない
      found.push(...findVendorRoutes(full, name.startsWith("(") ? segments : [...segments, name]));
    } else if (name === "route.ts" && readFileSync(full, "utf8").includes("VENDOR_STAMPS")) {
      found.push({ file: full, segments });
    }
  }
  return found;
}

/** 受け口の受け持ち範囲に、この行き先が入るか。入るなら受け取る値を返す。 */
function matchRoute(segments, wanted) {
  const params = {};
  let at = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    const optionalRest = /^\[\[\.\.\.(.+)\]\]$/.exec(segment);
    const rest = /^\[\.\.\.(.+)\]$/.exec(segment);
    const one = /^\[(.+)\]$/.exec(segment);
    if (optionalRest !== null || rest !== null) {
      const taken = wanted.slice(at);
      if (rest !== null && taken.length === 0) return null;
      if (i !== segments.length - 1) return null;
      const key = (optionalRest ?? rest)[1];
      if (taken.length > 0) params[key] = taken;
      return params;
    }
    if (one !== null) {
      if (at >= wanted.length) return null;
      params[one[1]] = wanted[at];
      at += 1;
      continue;
    }
    if (wanted[at] !== segment) return null;
    at += 1;
  }
  return at === wanted.length ? params : null;
}

const routes = findVendorRoutes(`${root}/src/app`);
ok("この 3 本を配っている受け口はちょうど 1 つ", routes.length, 1);

const route = routes[0];
const toSegments = (href) => href.split("/").filter((part) => part.length > 0);

// 差し替え後の本文から拾った行き先（文字列を書き写さない）。材料 2 枚ぶんを合わせる
ok("材料から行き先を 3 つ拾える", injectedHrefs.length, VENDOR_PARTS.length);

for (const part of VENDOR_PARTS) {
  const href = vendorSrc(part.name);
  const params = route === undefined ? null : matchRoute(route.segments, toSegments(href));
  ok(`${part.name}: 本文がこの行き先を指している`, injectedHrefs.includes(href), true);
  ok(`${part.name}: 行き先に印が入っている`, href.includes(VENDOR_STAMPS[part.name]), true);
  ok(`${part.name}: 行き先が受け口の受け持ちに入る`, params !== null, true);
  ok(`${part.name}: 受け口が受け取る名前が合う`, params?.name, part.name);
  ok(`${part.name}: 印なしも同じ受け口の受け持ちに入る`, matchRoute(route.segments, toSegments(`${VENDOR_BASE}/${part.name}`)) !== null, true);
  ok(`${part.name}: 行き先はスラッシュ始まり（<base> に引きずられない）`, href.startsWith("/"), true);
  console.log(`     （${href}）`);
}

console.log("\n--- 配るときの持たせ方 ---");

await build({
  entryPoints: [route.file],
  outfile: `${dir}/vendor-route.mjs`,
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*"],
  alias: { "@": `${root}/src` },
});
const { GET } = await import(`${dir}/vendor-route.mjs`);

const call = async (href, params) =>
  GET(new Request(`https://example.test${href}`), { params: Promise.resolve(params) });

const cache = (response) => response.headers.get("cache-control") ?? "";
const maxAge = (response) => Number(/max-age=(\d+)/.exec(cache(response))?.[1] ?? -1);

for (const part of VENDOR_PARTS) {
  const href = vendorSrc(part.name);
  const stamp = VENDOR_STAMPS[part.name];
  const shipped = readVendorPart(part).toString("utf8");

  const stamped = await call(href, matchRoute(route.segments, toSegments(href)));
  const bare = await call(`${VENDOR_BASE}/${part.name}`, { name: part.name });
  const wrong = await call(`${VENDOR_BASE}/${part.name}/deadbeef0000`, { name: part.name, stamp: ["deadbeef0000"] });

  ok(`${part.name}: 印つき: 配れる`, stamped.status, 200);
  ok(`${part.name}: 印つき: 中身が置いてある現物と同じ`, (await stamped.clone().text()) === shipped, true);
  ok(`${part.name}: 印つき: 1 年以上持たせる`, maxAge(stamped) >= 31536000, true);
  ok(`${part.name}: 印つき: immutable が付く`, cache(stamped).includes("immutable"), true);
  ok(`${part.name}: 印つき: public（配信網に載る）`, cache(stamped).includes("public"), true);
  ok(`${part.name}: 印つき: JavaScript として配る`, stamped.headers.get("content-type")?.includes("javascript"), true);
  ok(`${part.name}: 印つき: 中身の当てずっぽうを禁じる`, stamped.headers.get("x-content-type-options"), "nosniff");
  ok(`${part.name}: 印つき: 中身から決まる印を使っている`, stamp.length > 0, true);

  ok(`${part.name}: 印なし: いまも配れる`, bare.status, 200);
  ok(`${part.name}: 印なし: 中身は印つきと同じ`, (await bare.clone().text()) === shipped, true);
  ok(`${part.name}: 印なし: 持たせるのは 1 時間まで`, maxAge(bare) > 0 && maxAge(bare) <= 3600, true);
  ok(`${part.name}: 印なし: immutable は付けない`, cache(bare).includes("immutable"), false);

  ok(`${part.name}: 印違い: 黙って死なせず配る`, wrong.status, 200);
  ok(`${part.name}: 印違い: 長期に焼き付けない`, cache(wrong).includes("immutable"), false);
}

const unknown = await call(`${VENDOR_BASE}/whatever.js`, { name: "whatever.js" });
const tooDeep = await call(`${VENDOR_BASE}/tailwind.js/a/b`, { name: "tailwind.js", stamp: ["a", "b"] });
ok("知らない名前は配らない", unknown.status, 404);
ok("知らない名前は焼き付けさせない", unknown.headers.get("cache-control"), "no-store");
ok("深すぎる行き先は配らない", tooDeep.status, 404);

console.log("\n--- モジュールの変数に置いてよいものだけか ---");

const routeSource = readFileSync(route.file, "utf8");
const handlerAt = routeSource.indexOf("export async function GET");
const topLevel = handlerAt < 0 ? routeSource : routeSource.slice(0, handlerAt);

ok("読み込みは 1 度きり（handler の中でファイルを開かない）", /readFile/.test(routeSource.slice(handlerAt)), false);
ok("モジュールの変数に読み込んである", /^const VENDOR_SOURCES/m.test(topLevel), true);
// 利用者ごとに変わるものは、同時に走る別の要求と混ざるのでモジュールの変数に置けない
for (const forbidden of ["cookies(", "headers()", "auth(", "currentIdentity", "getSession"]) {
  ok(`利用者ごとに変わるものを持ち込まない（${forbidden}）`, topLevel.includes(forbidden), false);
}
ok("同時に走ることへの釘刺しが書いてある", /全員に同じもの/.test(routeSource), true);
ok("Fluid Compute の注意が書いてある", /Fluid Compute/.test(routeSource), true);

console.log("\n--- 関数バンドルに現物が乗るか ---");

const nextConfig = readFileSync(`${root}/next.config.ts`, "utf8");
ok("同梱の指定に現物の置き場が入っている", /outputFileTracingIncludes[\s\S]*vendor/.test(nextConfig), true);

const packageJson = JSON.parse(readFileSync(`${root}/package.json`, "utf8"));
ok("組み立てのたびに印を取り直す", packageJson.scripts.build.includes("scripts/build/vendor.mjs"), true);
ok("手元で立てるときも印を取り直す", packageJson.scripts.dev.includes("scripts/build/vendor.mjs"), true);

console.log("\n--- 差し込みの費用 ---");

// 1 ページ配るたびに通る処理なので、増やした手間が本当に小さいか測る。
// 差し込み一式（<base>・コメント部品・行き先の差し替え）で 1 ページあたり何マイクロ秒か。
const rounds = 200;
const measure = (fn) => {
  for (let i = 0; i < 20; i += 1) fn();
  const from = process.hrtime.bigint();
  for (let i = 0; i < rounds; i += 1) fn();
  return Number(process.hrtime.bigint() - from) / rounds / 1000;
};
const withoutUs = measure(() => withCommentsWidget(withAssetBase(fixture, "/public/guide/how-to-use")));
const withUs = measure(() => withVendorScripts(withCommentsWidget(withAssetBase(fixture, "/public/guide/how-to-use"))));
const addedUs = withUs - withoutUs;
console.log(
  `     （差し替え無し ${withoutUs.toFixed(0)}µs → 有り ${withUs.toFixed(0)}µs・増えたぶん ${addedUs.toFixed(0)}µs）`,
);
ok("増えたぶんは 1 ページあたり 1ms 未満", addedUs < 1000, true);
ok("差し込み一式でも 1 ページあたり 5ms 未満", withUs < 5000, true);
