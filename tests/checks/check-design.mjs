/**
 * デザインの体系（文字の目盛りと語彙表）を確かめる。
 *
 * 起きた事故はこれ。管理画面で、節の見出し（14 太字・灰色）が、その下に並ぶ行の名前
 * （16 中太・濃色）より弱く見えていた。**見出しと中身の上下が引っくり返っていた。**
 *
 * 原因は 1 か所の書き間違いではない。
 *   1. 「見出し」の語彙が 1 つしか無く、節も小見出しも同じものを使い回していた
 *   2. 「行の 1 行目」と「補足」には語彙が無く、画面ごとに手で書かれていた
 *   3. 正本（文書）が無いので、次に触る人が何を選べばいいか分からない
 *
 * だから見張るのも 3 つ。値そのもの・正本との一致・画面が実際に使っているか。
 *
 *   1. 目盛りそのもの（src/app/_components/styles.ts）
 *      … 役割ごとに語彙があり、序列（大きさの大小）が保たれているか
 *   2. 正本とコードの二方向同期（DESIGN.md ⇄ styles.ts）
 *      … 片方だけ足す・片方だけ直すができないようにする
 *   3. 画面が目盛りを使っているか（src/app/**、_components は除く）
 *      … 見出しの高さと語彙が対応し、目盛りの外の大きさを直書きしていないか
 *
 * 序列は「書き写しの一致」では見ない。text-xl / text-base のような名前を実際の
 * 大きさに読み替えて、大小で比べる。値を入れ替えられても気づけるようにするため。
 *
 * 保管庫にもネットワークにも繋がない。
 */
import { readdir, readFile } from "node:fs/promises";

import { root } from "./paths.mjs";

/**
 * 説明書き（コメント）を落としてから見る。説明文そのものを拾わないため。
 *
 * 落とすときも改行だけは残す。ここで行が詰まると、直す先として出す行番号が
 * 実際のファイルとずれて、受け取った人が別の行を開くことになる。
 */
const strip = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ""))
    .replace(/^[ \t]*\/\/.*$/gm, "");

const STYLES = await readFile(`${root}/src/app/_components/styles.ts`, "utf8");
const STYLES_CODE = strip(STYLES);
const DESIGN = await readFile(`${root}/DESIGN.md`, "utf8").catch(() => "");

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

/** 語彙の名前 → その値。文字列ひとつだけの export を拾う（改行して続くものも同じ）。 */
const tokens = new Map(
  [...STYLES_CODE.matchAll(/export const (\w+) =\s*("(?:[^"\\]|\\.)*")\s*;/g)].map((one) => [
    one[1],
    JSON.parse(one[2]),
  ]),
);

/** Tailwind の名前を実際の大きさ（px）に読み替える。大小で比べるため。 */
const SCALE = new Map([
  ["xs", 12],
  ["sm", 14],
  ["base", 16],
  ["lg", 18],
  ["xl", 20],
  ["2xl", 24],
  ["3xl", 30],
]);

/** その値が指している文字の大きさ。text-neutral-500 のような色は拾わない。 */
const sizeOf = (name) => {
  const found = /(?:^|\s)text-(xs|sm|base|lg|xl|[2-9]xl)(?:\s|$)/.exec(tokens.get(name) ?? "");
  return found === null ? null : (SCALE.get(found[1]) ?? null);
};

/** その値が持っている（と言い切れる）道具。 */
const has = (name, needle) => (tokens.get(name) ?? "").split(" ").includes(needle);

// ---------------------------------------------------------------------------
console.log("--- 1. 文字の目盛りそのもの（src/app/_components/styles.ts）---");

console.log("   まず、語彙を 1 つも取りこぼしていないこと");
console.log("      ※ 上の読み取りは二重引用符の export しか拾えない。逆合わせ（`）で書けば");
console.log("        名前も値も検査の目に入らず、正本との突き合わせを丸ごとすり抜けられる");
const declared = (STYLES_CODE.match(/^export const \w+\s*=/gm) ?? []).length;
ok("export の数と、読み取れた数", `${tokens.size} / ${declared}`, `${declared} / ${declared}`);
ok("1 つ以上ある", declared > 0, true);

console.log("\n   役割ごとに語彙が 1 つある。無い役割は、画面ごとに手で書かれる");

/**
 * 目盛りと外枠を作る語彙。役割と、そう言い切れるための要の道具。
 *
 * 数を書かない。足すたびにここの数字を直し忘れて、説明だけが古くなるため。
 */
const SCALE_TOKENS = [
  ["TITLE", "画面の名前（h1）", ["mb-2", "text-xl", "font-semibold"]],
  ["SECTION_HEADING", "節の見出し（h2）", ["mb-2", "text-base", "font-semibold"]],
  ["SECTION_NOTE", "節の説明", ["mb-4", "text-sm"]],
  ["SUBHEADING", "小見出し（h3・h4）", ["mb-2", "text-sm", "font-semibold"]],
  ["DETAIL_TITLE", "詳細面の題（h3・h4）", ["mb-2", "text-sm", "font-semibold"]],
  ["ROW_TITLE", "行の 1 行目", ["text-sm", "font-medium"]],
  ["ROW_LINK", "行の 1 行目が押せるとき", ["text-sm", "font-medium", "transition-colors"]],
  ["META", "行の 2 行目と補足", ["text-xs"]],
  ["PAGE_WIDE", "広い外枠", ["mx-auto", "max-w-5xl", "px-6", "py-12"]],
  ["PAGE_NARROW", "狭い外枠（ログイン系）", ["mx-auto", "max-w-sm", "justify-center", "px-6"]],
];

for (const [name, role, needles] of SCALE_TOKENS) {
  ok(`  語彙がある: ${name}（${role}）`, tokens.has(name), true);
  for (const needle of needles) ok(`    ${name} は ${needle} を持つ`, has(name, needle), true);
}

console.log("\n   序列（上の階層ほど大きい）。名前の書き写しではなく、実際の大きさで比べる");
const LADDER = ["TITLE", "SECTION_HEADING", "ROW_TITLE", "META"];
for (const name of LADDER) ok(`  大きさが読み取れる: ${name}`, sizeOf(name), sizeOf(name) ?? "読めない");
for (let index = 1; index < LADDER.length; index += 1) {
  const upper = LADDER[index - 1];
  const lower = LADDER[index];
  ok(
    `  ${upper} は ${lower} より大きい`,
    `${sizeOf(upper)} > ${sizeOf(lower)}`,
    `${sizeOf(upper)} > ${sizeOf(upper) > sizeOf(lower) ? sizeOf(lower) : "（もっと小さい何か）"}`,
  );
}
console.log("      ※ 小見出しは節の見出しより小さい（同じだと、節の中の札が節そのものに見える）");
ok(
  "SECTION_HEADING は SUBHEADING より大きい",
  sizeOf("SECTION_HEADING") > sizeOf("SUBHEADING"),
  true,
);

console.log("\n   節の見出しは濃い。ここを灰色にすると、下に並ぶ行の名前のほうが強くなる");
console.log("      ※ 引っくり返った上下は、これがまさに起きた事故");
ok("SECTION_HEADING に灰色の指定が無い", /text-neutral-/.test(tokens.get("SECTION_HEADING") ?? ""), false);
ok("SUBHEADING は灰色（節の見出しから 1 段引く）", has("SUBHEADING", "text-neutral-500"), true);
ok("ROW_TITLE は濃い（灰色にしない）", /text-neutral-/.test(tokens.get("ROW_TITLE") ?? ""), false);
console.log("      ※ 押せる行の名前も同じ強さ。灰色にすると、主役の名前が下の補足と同じ扱いに見える");
console.log("      ※ 見るのは素の濃さだけ。hover: と dark: の付いた濃さは、触ったときの変化なので数えない");
ok(
  "ROW_LINK は濃い（灰色にしない）",
  /(?:^|\s)text-neutral-/.test(tokens.get("ROW_LINK") ?? ""),
  false,
);
ok("ROW_LINK は ROW_TITLE と同じ大きさ", sizeOf("ROW_LINK"), sizeOf("ROW_TITLE"));
console.log("      ※ 押せる印は濃さの変化で出す。下線は赤入れ（足した文）の記号に予約してある");
ok("ROW_LINK は指を乗せると濃さが動く", has("ROW_LINK", "hover:text-neutral-600"), true);
ok("ROW_LINK は暗い側でも濃さが動く", has("ROW_LINK", "dark:hover:text-neutral-300"), true);
ok("ROW_LINK は変化を滑らかにする", has("ROW_LINK", "transition-colors"), true);
ok("ROW_LINK は下線を持たない", /underline/.test(tokens.get("ROW_LINK") ?? ""), false);
console.log("      ※ 高さは行の側が持つ。見え方に混ぜると、高さの要らない場所で使い回せない");
ok("ROW_LINK は高さを持たない", /\bpy-/.test(tokens.get("ROW_LINK") ?? ""), false);
console.log("      ※ h3 は 2 つある。選んだ 1 件の名前は主役なので濃く、並んだ行の札は灰色");
ok("DETAIL_TITLE は濃い", /text-neutral-/.test(tokens.get("DETAIL_TITLE") ?? ""), false);
ok(
  "DETAIL_TITLE と SUBHEADING は同じ大きさ（濃さだけで分ける）",
  sizeOf("DETAIL_TITLE"),
  sizeOf("SUBHEADING"),
);

console.log("\n   薄い字は必ず暗い側とセット（neutral-500 は黒地で 4.17:1 まで落ちる）");
const GRAY = ["SECTION_NOTE", "SUBHEADING", "META", "QUIET"];
for (const name of GRAY) {
  ok(`  ${name} は薄い字を使っている`, has(name, "text-neutral-500"), true);
  ok(`  ${name} に暗い側がある`, has(name, "dark:text-neutral-400"), true);
}
const grayLines = STYLES_CODE.split("\n").filter((line) => /text-neutral-500(?![-\w])/.test(line));
const grayUnpaired = grayLines.filter((line) => !line.includes("dark:text-neutral-400"));
ok("薄い字を書いている行", grayLines.length > 0, true);
ok("暗い側を書き忘れている行", grayUnpaired.length === 0 ? "なし" : grayUnpaired.join(" / ").trim(), "なし");

console.log("\n   既にある語彙は値を変えていない（画面をまたいで見た目が動く）");
ok("PAGE はふつうの幅", has("PAGE", "max-w-3xl"), true);
ok("PAGE_WIDE のほうが広い", has("PAGE_WIDE", "max-w-5xl"), true);
console.log("      ※ 塗りのボタンと打ち込み口の形は、共通の部品（src/app/globals.css）が 1 か所で持つ");
ok("塗りのボタンは 1 つだけ（PRIMARY は共通の部品を指す）", tokens.get("PRIMARY"), "ws-button ws-primary");
ok("赤い帯は帯のまま（ALERT）", has("ALERT", "bg-red-50"), true);
ok("危ない操作は文字だけ赤（DANGER に塗りが無い）", /\bbg-red-/.test(tokens.get("DANGER") ?? ""), false);
ok("一覧は線を引くだけで囲まない（LIST）", has("LIST", "divide-y"), true);
ok("打ち込み口も共通の部品を指す（FIELD）", tokens.get("FIELD"), "ws-field");
const SHEET = await readFile(`${root}/src/app/globals.css`, "utf8");
/** 共通の部品 1 つぶんの宣言（`.名前 { … }` の最初のもの）。 */
const ruleOf = (name) => new RegExp(`\\n  \\.${name} \\{([^}]*)\\}`).exec(SHEET)?.[1] ?? "";
ok("塗りは墨の色（印と同じ色）", /background: var\(--ws-text\);/.test(ruleOf("ws-primary")), true);
ok("打ち込み口の地は透ける", /background: transparent;/.test(ruleOf("ws-field")), true);
ok("押す部品の高さは 1 つの変数から取る", /min-height: var\(--ws-control\);/.test(ruleOf("ws-field")) && /--ws-control: 2rem;/.test(SHEET), true);

console.log("\n   どの語彙も下線を持たない（押せることは濃さと hover の変化で示す）");
console.log("      ※ 下線は赤入れ（足した文）の記号に予約してある。リンクの飾りに使うと形の意味が二重になる");
const underlined = [...tokens].filter(([, value]) => /underline/.test(value)).map(([name]) => name);
ok("下線を持つ語彙", underlined.length === 0 ? "なし" : underlined.join(" / "), "なし");

console.log("\n   目盛りの外の値を発明していない");
ok("リテラル（text-[13px] 等）が無い", /-\[\d/.test(STYLES_CODE), false);
ok("絵文字を使っていない", /\p{Extended_Pictographic}/u.test(STYLES), false);

// ---------------------------------------------------------------------------
console.log("\n--- 2. 正本とコードの二方向同期（DESIGN.md ⇄ styles.ts）---");
console.log("   片方だけ足す・片方だけ直すができないようにする");
ok("正本がある（DESIGN.md）", DESIGN.length > 0, true);

console.log("\n   styles.ts の語彙は全部、正本に出てくる");
const undocumented = [...tokens.keys()].filter(
  (name) => !new RegExp(`\\b${name}\\b`).test(DESIGN),
);
ok("語彙の数", tokens.size > 0, true);
ok("正本に載っていない語彙", undocumented.length === 0 ? "なし" : undocumented.join(" / "), "なし");

console.log("\n   正本の語彙表に載る名前は全部、styles.ts にある");
console.log("      ※ 見るのは語彙表の節だけ（本文で名前に触れているだけの行は数えない）");
const vocabulary = /## 6\. 部品語彙表([\s\S]*?)(?=\n## )/.exec(DESIGN)?.[1] ?? "";
ok("語彙表の節がある", vocabulary.length > 0, true);
const listed = [...vocabulary.matchAll(/^\| `(\w+)` \|/gm)].map((one) => one[1]);
ok("語彙表に並んでいる行の数", listed.length, tokens.size);
const phantom = listed.filter((name) => !tokens.has(name));
ok("実体の無い語彙", phantom.length === 0 ? "なし" : phantom.join(" / "), "なし");

console.log("\n   目盛りの表にも、文字の目盛りを作る語彙が全部載っている（外枠は除く）");
const ladderTable = /## 2\. 文字の目盛り([\s\S]*?)(?=\n## )/.exec(DESIGN)?.[1] ?? "";
ok("目盛りの節がある", ladderTable.length > 0, true);
for (const [name] of SCALE_TOKENS.filter(([one]) => !one.startsWith("PAGE"))) {
  ok(`  目盛りの表にある: ${name}`, new RegExp(`\\b${name}\\b`).test(ladderTable), true);
}

console.log("\n   正本が言っている決まり（消されたら気づけるように、逐語で置く）");
for (const phrase of [
  "見出しは中身より必ず強い",
  "新しい大きさを発明しない",
  "同じ役割には同じトークン",
  "色で階層やカテゴリを作らない",
  "灰色の文字は必ず暗い側とセット",
  "押せないボタンを置かない",
  "リンクに下線を引かない",
  "かたまりの中の間隔は、かたまりの間の間隔より必ず小さくする",
  "投稿されたページ本体",
]) {
  ok(`  ${phrase}`, DESIGN.includes(phrase), true);
}
console.log("      ※ 投稿されたページ本体は対象外（作り手の表現物に決まりを押し付けない）");
ok("正本が絵文字を使っていない", /\p{Extended_Pictographic}/u.test(DESIGN), false);

// ---------------------------------------------------------------------------
console.log("\n--- 3. 画面が目盛りを使っているか（src/app/**、_components は除く）---");
console.log("   語彙を作っても、画面が手で書いていたら何も揃わない");

/** app の下の画面（.tsx）を集める。見た目の語彙そのもの（_components）は数えない。 */
const screens = [];
const walk = async (relative) => {
  for (const entry of await readdir(`${root}/${relative}`, { withFileTypes: true })) {
    const next = `${relative}/${entry.name}`;
    if (entry.isDirectory()) {
      if (next === "src/app/_components") continue;
      await walk(next);
    } else if (entry.name.endsWith(".tsx")) {
      screens.push({ path: next, code: strip(await readFile(`${root}/${next}`, "utf8")) });
    }
  }
};
await walk("src/app");
screens.sort((left, right) => left.path.localeCompare(right.path));
ok("見る画面の数", screens.length > 0, true);
ok("見た目の語彙そのものは数に入れない", screens.some((one) => one.path.startsWith("src/app/_components/")), false);

console.log("\n   見出しの高さと語彙が対応している（h1 は TITLE、h2 は節、h3 は小見出し）");
console.log("      ※ 高さだけ正しくて語彙が手書きだと、読み上げは合っていて目には逆さに見える");
/** その名前を単体で使っているか（DETAIL_TITLE のような別の名前に含まれるのは数えない）。 */
const uses = (text, name) => new RegExp(`(?<![\\w$])${name}(?![\\w$])`).test(text);
/**
 * h3 と h4 は 2 通りある。行のかたまりの札（SUBHEADING）と、いま選んでいる 1 件の題
 * （DETAIL_TITLE）は、どちらも節の見出しの 1 段下だが、灰と濃で役割が分かれる。
 *
 * h4 を数えないでいたら、詳細面の中の小見出しが丸ごと見張りの外に落ちていた。
 * 深さが 1 つ増えるたびに検査に足す、では必ず取りこぼす。ここは h1〜h4 を全部見る。
 */
const HEADING_OF = new Map([
  ["1", ["TITLE"]],
  ["2", ["SECTION_HEADING"]],
  ["3", ["SUBHEADING", "DETAIL_TITLE"]],
  ["4", ["SUBHEADING", "DETAIL_TITLE"]],
]);
const headingMiss = [];
for (const { path, code } of screens) {
  for (const found of code.matchAll(/<h([1234])\b[^>]*>/g)) {
    const want = HEADING_OF.get(found[1]);
    if (!want.some((name) => uses(found[0], name))) {
      const line = code.slice(0, found.index).split("\n").length;
      headingMiss.push(`${path}:${line} h${found[1]} は ${want.join(" か ")} を使う`);
    }
  }
}
ok("見出しの数", [...screens.map((one) => one.code.matchAll(/<h[1234]\b/g))].length > 0, true);
ok("語彙を使っていない見出し", headingMiss.length === 0 ? "なし" : `\n     ${headingMiss.join("\n     ")}`, "なし");

console.log("\n   目盛りの外の大きさを直書きしていない");
console.log("      ※ text-sm / text-xs の直書きは当面許す（行の中の細かい使い分けまでは縛らない）");
const sizeMiss = [];
for (const { path, code } of screens) {
  for (const found of code.matchAll(/text-(?:base|lg|[2-9]?xl)(?![-\w])/g)) {
    const line = code.slice(0, found.index).split("\n").length;
    sizeMiss.push(`${path}:${line} ${found[0]}`);
  }
}
ok("直書きされた大きさ", sizeMiss.length === 0 ? "なし" : `\n     ${sizeMiss.join("\n     ")}`, "なし");

console.log("\n   外枠の幅は語彙から取る（PAGE / PAGE_WIDE / PAGE_NARROW）");
console.log("      ※ max-w-full / max-w-none は「はみ出さない」の指定なので幅の発明ではない");
const widthMiss = [];
for (const { path, code } of screens) {
  for (const found of code.matchAll(/max-w-(?!full(?![-\w]))(?!none(?![-\w]))[\w[\].%/-]+/g)) {
    const line = code.slice(0, found.index).split("\n").length;
    widthMiss.push(`${path}:${line} ${found[0]}`);
  }
}
ok("直書きされた幅", widthMiss.length === 0 ? "なし" : `\n     ${widthMiss.join("\n     ")}`, "なし");

console.log("\n   薄い字は暗い側とセット（同じ class 文字列の中に両方書く）");
const grayMiss = [];
for (const { path, code } of screens) {
  code.split("\n").forEach((text, index) => {
    if (!/text-neutral-500(?![-\w])/.test(text)) return;
    if (text.includes("dark:text-neutral-400")) return;
    grayMiss.push(`${path}:${index + 1} ${text.trim()}`);
  });
}
ok("暗い側が無い薄い字", grayMiss.length === 0 ? "なし" : `\n     ${grayMiss.join("\n     ")}`, "なし");

console.log("\n   見出しの直後に、画面が詰めを足していない");
console.log("      ※ くっつけるのは語彙の仕事、離すのは画面の仕事");
console.log("      ※ 見るのは見出しの次に来るものだけ。段落の下に添える補足は画面の持ちもの");
console.log("      ※ mt-6 以上も見ない（あれは「まとまりを離す」意味で、画面の組み立てそのもの）");
const gapMiss = [];
for (const { path, code } of screens) {
  for (const head of code.matchAll(/<h[1234]\b[^>]*>/g)) {
    // 見出しの札を閉じたすぐ後ろ。次に見た目を書いているものが「直後の要素」
    const after = head.index + head[0].length;
    const next = /className=(?:"([^"]*)"|\{`([^`]*)`\})/.exec(code.slice(after));
    if (next === null) continue;
    const found = /\bmt-[12]\b/.exec(next[1] ?? next[2]);
    if (found === null) continue;
    const line = code.slice(0, after + next.index).split("\n").length;
    gapMiss.push(`${path}:${line} ${found[0]} は上の見出しが mb- で持つ`);
  }
}
ok("見出しの直後の詰め", gapMiss.length === 0 ? "なし" : `\n     ${gapMiss.join("\n     ")}`, "なし");

console.log("\n   目盛りの外の値そのものを発明していない");
const literalMiss = [];
for (const { path, code } of screens) {
  for (const found of code.matchAll(/(?:^|[\s"'`])[\w:-]*-\[\d[^\]]*\]/g)) {
    const line = code.slice(0, found.index).split("\n").length;
    literalMiss.push(`${path}:${line} ${found[0].trim()}`);
  }
}
ok("リテラル（8px 等）の直書き", literalMiss.length === 0 ? "なし" : literalMiss.join(" / "), "なし");

console.log("\n   画面ファイルの中で局所の語彙を作っていない（2 画面で欲しくなったら styles.ts へ上げる）");
const localMiss = [];
for (const { path, code } of screens) {
  for (const found of code.matchAll(/^const (\w+) = [`"]([^`"]*(?:text-|max-w-|font-)[^`"]*)[`"]/gm)) {
    const line = code.slice(0, found.index).split("\n").length;
    localMiss.push(`${path}:${line} ${found[1]}`);
  }
}
ok("画面ファイルの中の局所の語彙", localMiss.length === 0 ? "なし" : localMiss.join(" / "), "なし");

console.log("\n   画面のどこにも下線が無い（押せることは濃さと hover の変化で示す）");
console.log("      ※ 語彙から下線を外しても、画面ファイルが直書きで引き直せば元どおりになる");
console.log("      ※ 下線は赤入れ（足した文）の記号に予約してある。リンクの飾りに使うと形の意味が二重になる");
const underlineMiss = [];
for (const { path, code } of screens) {
  for (const found of code.matchAll(/underline/g)) {
    const line = code.slice(0, found.index).split("\n").length;
    underlineMiss.push(`${path}:${line}`);
  }
}
ok("下線を引いている場所", underlineMiss.length === 0 ? "なし" : underlineMiss.join(" / "), "なし");

console.log("\n   見た目の決まり（画面ぜんぶ）");
const emoji = screens.filter((one) => /\p{Extended_Pictographic}/u.test(one.code)).map((one) => one.path);
ok("絵文字を使っている画面", emoji.length === 0 ? "なし" : emoji.join(" / "), "なし");
const rawColor = [];
for (const { path, code } of screens) {
  for (const found of code.matchAll(/(?:text|bg)-(?:red|blue|green)-\d+/g)) {
    const line = code.slice(0, found.index).split("\n").length;
    rawColor.push(`${path}:${line} ${found[0]}`);
  }
}
console.log("      ※ 赤は語彙ごしにだけ使う（DANGER / ALERT）。青と緑は画面には出さない");
ok("直書きされた機能色", rawColor.length === 0 ? "なし" : rawColor.join(" / "), "なし");

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
