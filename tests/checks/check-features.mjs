/**
 * 機能の台帳（src/lib/settings/features.ts）と実物がずれていないか。
 *
 * 配布版で閉じるはずの口が開いたままになる事故は、口を足した人が「配布版では
 * どうするか」を判断し忘れたときに起きる。忘れても落ちるように、ここで数える。
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { build } from "esbuild";
import { root, dir } from "./paths.mjs";

const out = `${dir}/features.cjs`;
await build({ stdin: { contents: `export * from "${root}/src/lib/settings/features";`, resolveDir: root, loader: "ts" }, bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "silent" });
const ledger = createRequire(import.meta.url)(out);

let failures = 0;
function check(label, test) {
  try { test(); console.log(`OK  ${label}`); }
  catch (error) { failures++; console.log(`NG  ${label}: ${error.message}`); }
}

function walk(directory, keep) {
  const found = [];
  for (const name of readdirSync(directory)) {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) { if (name !== "node_modules") found.push(...walk(full, keep)); }
    else if (keep(full)) found.push(full);
  }
  return found;
}
const relative = (file) => path.relative(root, file).split(path.sep).join("/");
const routeFile = (folder) => ["route.ts", "route.tsx"].map((name) => `${root}/${folder}/${name}`).find(existsSync);

const features = Object.entries(ledger.FEATURES);
// 配布用リポジトリの中では会社専用のファイルが無いのが正しい状態。
const distributed = JSON.parse(readFileSync(`${root}/deployment.json`, "utf8")).edition === "personal";
const companyOnly = features.flatMap(([, feature]) => feature.companyOnly ?? []);
const isCompanyOnly = (file) => companyOnly.some((blocked) => file === blocked || file.startsWith(`${blocked}/`));
const listed = features.flatMap(([name, feature]) => feature.routes.map((route) => ({ name, route })));
const actual = walk(`${root}/src/app/api`, (file) => /\/route\.tsx?$/.test(file)).map((file) => relative(path.dirname(file))).sort();

console.log("--- 口の載せ忘れ ---");
check("API の口はどれも台帳に載っている", () => {
  const missing = actual.filter((route) => !listed.some((one) => one.route === route));
  assert.deepEqual(missing, [], `台帳に無い口: ${missing.join(", ")}`);
});
check("台帳の口はどれも実物がある", () => {
  const stale = listed.filter((one) => !actual.includes(one.route) && !(distributed && isCompanyOnly(one.route))).map((one) => one.route);
  assert.deepEqual(stale, [], `実物の無い口: ${stale.join(", ")}`);
});
check("1 つの口は 1 つの機能にだけ属する", () => {
  const twice = listed.map((one) => one.route).filter((route, index, all) => all.indexOf(route) !== index);
  assert.deepEqual(twice, []);
});

/**
 * 関門のファイルの中で、関門（featureEnabled / featureAvailable）を通る関数の名前。自分で関門を呼ぶ関数と、そういう関数を呼ぶ関数（同じファイルの中で辿る）。
 * 書き出した関数だけを返す（入口が呼べるのは書き出した関数だけ）。
 */
function gatedFunctions(file, name) {
  const source = readFileSync(`${root}/${file}`, "utf8");
  const bodies = new Map();
  const starts = [...source.matchAll(/^(export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gm)];
  starts.forEach((match, index) => {
    const end = index + 1 < starts.length ? starts[index + 1].index : source.length;
    bodies.set(match[2], { exported: Boolean(match[1]), body: source.slice(match.index, end) });
  });
  const gated = new Set([...bodies].filter(([, one]) => gate(name).test(one.body)).map(([fn]) => fn));
  for (let changed = true; changed;) {
    changed = false;
    for (const [fn, one] of bodies) {
      if (gated.has(fn)) continue;
      if ([...gated].some((other) => new RegExp(`\\b${other}\\(`).test(one.body.slice(one.body.indexOf("{"))))) { gated.add(fn); changed = true; }
    }
  }
  return new Set([...gated].filter((fn) => bodies.get(fn)?.exported));
}

console.log("--- 配布版で閉じる口 ---");
// 版の関門（featureEnabled / featureAvailable）か、組織の設定まで見る関門（featureEnabledFor / openFeature）
const gate = (name) => new RegExp(`(?:feature(Enabled|Available)\\(|(?:featureEnabledFor|openFeature)\\(\\s*[\\w.]+\\s*,)\\s*["']${name}["']\\s*\\)`);
for (const [name, feature] of features) {
  if (feature.personal) continue;
  for (const route of feature.routes) {
    if (distributed && isCompanyOnly(route)) continue;
    check(`${name}: ${route} は台帳の関門を通る`, () => {
      const file = routeFile(route);
      assert.ok(file, "route が見つからない");
      const source = readFileSync(file, "utf8");
      if (feature.guardedBy) {
        const guard = feature.guardedBy.replace(/\.ts$/, "");
        assert.ok(source.includes(`@/${guard}"`) || source.includes(`@/${guard}'`), `${feature.guardedBy} を読み込んでいない`);
        assert.match(readFileSync(`${root}/${feature.guardedBy}`, "utf8"), gate(name), `${feature.guardedBy} が関門を通らない`);
        // 読み込むだけでなく、関門を通る関数（関門を自分で呼ぶか、そういう関数を呼ぶもの）を実際に呼んでいる
        const gated = gatedFunctions(feature.guardedBy, name);
        const imported = new Set([...source.matchAll(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']@/${guard}["']`, "g"))].flatMap((match) => match[1].split(",").map((one) => one.trim().replace(/^type\\s+/, "").split(/\\s+as\\s+/).pop())));
        const called = [...gated].filter((fn) => imported.has(fn) && new RegExp(`\\b${fn}\\(`).test(source));
        assert.ok(called.length > 0, `${feature.guardedBy} の関門を通る関数（${[...gated].join("・")}）を呼んでいない`);
      } else assert.match(source, gate(name));
    });
  }
}

console.log("--- 判定の向き ---");
const saved = process.env.PAGES_EDITION;
process.env.PAGES_EDITION = "personal";
for (const [name, feature] of features) {
  check(`配布版で ${name} は${feature.personal ? "使える" : "閉じる"}`, () => assert.equal(ledger.featureAvailable(name), feature.personal));
}
// 止める設定を持つ機能は、配布版でも使える手元の AI の編集口だけ（HTML 動画は外した）
check("止める設定は作る口だけを止め、閲覧の可否は変えない", () => {
  process.env.PAGES_AGENT_EDITING = "off";
  assert.equal(ledger.featureAvailable("page-agent"), true);
  assert.equal(ledger.featureEnabled("page-agent"), false);
  delete process.env.PAGES_AGENT_EDITING;
  assert.equal(ledger.featureEnabled("page-agent"), true);
});
if (!distributed) check("社内版ではどの機能もある", () => {
  process.env.PAGES_EDITION = "company";
  for (const [name] of features) assert.equal(ledger.featureAvailable(name), true, name);
});
if (saved === undefined) delete process.env.PAGES_EDITION; else process.env.PAGES_EDITION = saved;

console.log("--- 版を直に読むファイル ---");
/**
 * 振る舞いそのものが版で違うので `isPersonalEdition()` を直に読むファイルと、その理由。
 * 機能のあるなしをここで決めない（それは src/lib/settings/features.ts の役目）。減る方向にだけ動かす。
 */
const EDITION_BEHAVIOR_FILES = {
  "src/lib/settings/site-settings.ts": "判定の正本",
  "src/lib/settings/features.ts": "この台帳",
  "src/lib/db/database.ts": "本人の保存先かを接続のたびに確かめる",
  "src/lib/pages/cache.ts": "配布版だけ HTML に実行の制限を掛ける",
  "src/lib/html/document-security.ts": "配布版だけ保存時に仕掛けを検査する",
  "src/lib/pages/private-page.ts": "過去版と素材を認証付きの入口から配る",
  "src/app/public/[...slug]/route.ts": "公開ページの過去版と素材を認証付きの入口へ回す",
  "src/lib/access/rules.ts": "本人と招待相手だけの権限",
  "src/lib/access/gates.ts": "配布版の資料は既定で本人と招待相手だけに開く",
  "src/lib/access/roster.ts": "配布版の管理者は設置した本人だけ",
  "src/lib/pages/store.ts": "新しい資料を既定で本人だけに閉じる",
  "src/app/api/comments/route.ts": "公開ページの社外の人に道具箱を出さない",
  "src/lib/organization/scope.ts": "配布版は組織が 1 つだけの設置なので、要求の組織は常に最初の組織（関所のヘッダを読まない）",
  "src/lib/pages/content.ts": "道具箱に配布版の印を渡す",
  "src/lib/pages/local-preview.ts": "配布版では手元の仮の人を作らない",
  "src/app/cli/[name]/route.ts": "配る投稿コマンドに本人のサイトを焼き込む",
  "src/app/_components/workspace.tsx": "一覧の言い方",
};
const sources = [
  ...walk(`${root}/src/app`, (file) => /\.tsx?$/.test(file)),
  ...walk(`${root}/src/lib`, (file) => /\.tsx?$/.test(file) && !file.includes(".generated.")),
  ...walk(`${root}/src/widget`, (file) => /\.tsx?$/.test(file)),
  ...["src/auth.ts", "src/proxy.ts", "next.config.ts"].map((name) => `${root}/${name}`).filter(existsSync),
];
const readers = sources.filter((file) => /\bisPersonalEdition\s*\(/.test(readFileSync(file, "utf8"))).map(relative).sort();
const allowed = Object.keys(EDITION_BEHAVIOR_FILES).sort();
check("機能の可否を版で直に決めるファイルが増えていない", () => {
  const extra = readers.filter((file) => !allowed.includes(file));
  assert.deepEqual(extra, [], `台帳を通さずに版を読むファイル: ${extra.join(", ")}`);
});
check("一覧に載っているのに版を読まなくなったファイルは一覧から外す", () => {
  const unused = allowed.filter((file) => !readers.includes(file));
  assert.deepEqual(unused, []);
});
check("一覧のどのファイルにも理由がある", () => {
  for (const [file, why] of Object.entries(EDITION_BEHAVIOR_FILES)) assert.ok(why.trim().length > 0, file);
});

console.log("--- 会社専用のファイル ---");
// このリポジトリは配布版を焼き込んだうえで、複数組織の土台（運営の画面・組織の宛先へのログインの受け渡し）を残している。
// 会社専用の印は配布用リポジトリへ書き出すとき（scripts/export-distribution.mjs）に外す目印。書き出した先では全部無く、
// 土台を残したこのリポジトリでは全部ある。どちらでも配布版では機能の関門で閉じる（下の「会社専用は配布版で閉じる機能にだけ付ける」）
check("実物の deployment.json は配布版（personal）を焼き込んである", () => assert.equal(distributed, true));
check("会社専用のファイルは全部あるか全部無いか（書き出しの途中で一部だけ残っていない）", () => {
  const present = companyOnly.filter((file) => existsSync(`${root}/${file}`));
  assert.ok(present.length === 0 || present.length === companyOnly.length, `一部だけある: ${present.join(", ")}`);
});
check("会社専用は配布版で閉じる機能にだけ付ける", () => {
  for (const [name, feature] of features) if (feature.companyOnly) assert.equal(feature.personal, false, name);
});

console.log("--- 環境変数 ---");
const catalog = JSON.parse(readFileSync(`${root}/src/lib/settings/environment.json`, "utf8")).variables;
const catalogNames = catalog.map((one) => one.name);
const serverSources = sources.filter((file) => !relative(file).startsWith("src/widget/"));
const readNames = new Set();
for (const file of serverSources) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)|process\.env\[\s*"([A-Z][A-Z0-9_]+)"\s*\]|\benv\(\s*"([A-Z][A-Z0-9_]+)"\s*\)/g)) readNames.add(match[1] ?? match[2] ?? match[3]);
  for (const line of text.split("\n")) if (/\benv\(|process\.env/.test(line)) for (const match of line.matchAll(/"((?:SLACK|PAGES|AUTH|GITHUB|GH|VERCEL|LOCAL)_[A-Z0-9_]+)"/g)) readNames.add(match[1]);
}
check("コードが読む環境変数はどれも一覧に載っている", () => {
  const missing = [...readNames].filter((name) => !catalogNames.includes(name)).sort();
  assert.deepEqual(missing, [], `一覧に無い名前: ${missing.join(", ")}`);
});
check("一覧の名前は重ならない", () => assert.equal(new Set(catalogNames).size, catalogNames.length));
check("一覧の機能名はどれも台帳にある", () => {
  for (const one of catalog) assert.ok(one.feature in ledger.FEATURES, `${one.name}: ${one.feature}`);
});
check("一覧の種類と説明が揃っている", () => {
  for (const one of catalog) {
    assert.ok(["both", "personal", "company", "local", "platform"].includes(one.scope), one.name);
    assert.ok(one.purpose.trim().length > 0, one.name);
    if (one.required) assert.ok(one.scope === "both" || one.scope === "personal", `${one.name} は配布版で入れられない`);
  }
});
check("止める設定はどれも一覧に載っている", () => {
  for (const [, feature] of features) if (feature.switch) assert.ok(catalogNames.includes(feature.switch), feature.switch);
});
check("配布版で閉じる機能の鍵を配布版の見本に載せない", () => {
  for (const one of catalog) if (one.scope === "both" || one.scope === "personal") assert.equal(ledger.FEATURES[one.feature].personal, true, one.name);
});
const setup = readFileSync(`${root}/scripts/setup/personal.mjs`, "utf8");
check("設置の診断は一覧から必須を読む", () => {
  assert.match(setup, /requiredPersonalVariables\(\)/);
  assert.doesNotMatch(setup, /"BLOB_READ_WRITE_TOKEN"/);
});

console.log(`\n機能の台帳: ${failures} 件の不合格`);
process.exitCode = failures ? 1 : 0;
