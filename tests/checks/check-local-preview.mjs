/**
 * 「手元でだけログインを省く」仕掛けが、本番で絶対に有効にならないことを確かめる。
 *
 * 手元のパソコンには Google の鍵が無いので、社内ページを開こうとすると必ず
 * ログイン画面で止まる。そこで手元に限って、社内の人としてログイン済みの
 * ふりをした仮の人を 1 人返すようにしてある（src/lib/pages/local-preview.ts）。
 * 便利な代わりに、**間違って本番で効いたら誰でも社内ページが読める**。
 * だからここが一番きつく見張る。
 *
 * ここで見るのは 8 つ。
 *   1. 仮の人の名乗りが、通すドメインから組み立てられているか（文字列の書き写しが無いか）
 *   2. 本番の組み立てでは有効にならないか
 *   3. Vercel の上では有効にならないか
 *   4. 宛先が手元でないときは有効にならないか（本番ドメイン宛で素通ししない）
 *   5. 逃げ道の環境変数で切れるか
 *   6. 素通しになるのは手元のときだけか（環境変数 × 宛先の総当たり）
 *   7. ログイン状態を読む口が 1 か所に集まっているか（入口に分岐が散っていないか）
 *   8. 見てよいかの判定に例外の枝を足していないか
 *
 * 保管庫にも Google にも繋がない。判定の部分だけを取り出して、実際に呼んで確かめる。
 */
import { readdir, readFile, writeFile } from "node:fs/promises";

import { root, dir, readAccessSource } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

const read = (path) => readFile(`${root}/${path}`, "utf8");
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const AUTH = await read("src/auth.ts");
const PREVIEW_SOURCE = await read("src/lib/pages/local-preview.ts");
const PREVIEW = strip(PREVIEW_SOURCE);
const IDENTITY = strip(await read("src/lib/identity/identity.ts"));
const ACCESS = strip(readAccessSource());
const SIGNIN = strip(await read("src/app/signin/page.tsx"));

/**
 * 会社のドメインの正本は、最初の組織の自動参加のドメイン（src/lib/organization/organizations.ts の FIRST_ORGANIZATION）。
 * 検査用の値もそこから写して作る（ここに文字列を書き写すと、正本を変えたときに検査だけ古いまま通ってしまう）。
 */

// ログインと「宛先を教える口」だけ差し替えて、中の判定を取り出す
await writeFile(
  `${dir}/local-preview-stub.mjs`,
  'export const getDb = () => { throw new Error("検査では保管庫に繋がない"); };\n' +
    'export const headers = async () => { throw new Error("検査では宛先を渡さない"); };\n',
);
await build({
  entryPoints: [`${root}/src/lib/pages/local-preview.ts`],
  outfile: `${dir}/local-preview.mjs`,
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*"],
  alias: {
    "@/auth": `${dir}/local-preview-stub.mjs`,
    "next/headers": `${dir}/local-preview-stub.mjs`,
  },
});
const {
  LOCAL_PREVIEW_EMAIL,
  LOCAL_PREVIEW_MEMBER,
  LOCAL_PREVIEW_NAME,
  REAL_LOGIN_FLAG,
  VERCEL_RUNTIME_MARKS,
  isLocalTarget,
  isLoopbackHost,
  localPreviewBlock,
  localPreviewMember,
} = await import(`${dir}/local-preview.mjs`);

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

/** 手元の宛先（これだけが素通しになりうる）。 */
const LOCAL_HOSTS = ["localhost:3000", "localhost", "127.0.0.1:3100", "127.0.0.1", "[::1]:3000"];

/** 手元ではない宛先。本番のドメインと、間違えやすい紛れ物を並べてある。 */
const REMOTE_HOSTS = [
  "pages.example.com",
  "pages.example.com",
  "surprise-pages-git-main.vercel.app",
  // 頭や尾に足して手元のふりをする形。名前として別物なので通らない
  "localhost.example.com",
  "notlocalhost",
  "evil-localhost.example.com",
  "127.0.0.1.nip.io",
  "[::2]:3000",
  "192.168.1.10:3000",
  "0.0.0.0:3000",
  "::1",
];

// ---------------------------------------------------------------------------
console.log("--- 1. 仮の人の名乗り（本物の人を騙らせない・ドメインは書き写さない） ---");

ok("名乗りの頭が手元のものだと分かる", LOCAL_PREVIEW_EMAIL.startsWith("local-preview@"), true);
ok("名前に「手元」と書いてある", LOCAL_PREVIEW_NAME.includes("手元"), true);
ok("名前に「ログイン省略」と書いてある", LOCAL_PREVIEW_NAME.includes("ログイン省略"), true);
ok("社内の人として扱われる", LOCAL_PREVIEW_MEMBER.kind, "member");
ok("顔写真は持たない", LOCAL_PREVIEW_MEMBER.image, null);
ok("名乗りが仮の人のものと同じ", LOCAL_PREVIEW_MEMBER.email, LOCAL_PREVIEW_EMAIL);

console.log("\n   人に見せる文言に「トークン」という語を出さない");
ok("仕掛けの中に「トークン」が出てこない", /トークン/.test(PREVIEW_SOURCE), false);

// ---------------------------------------------------------------------------
console.log("\n--- 2. 本番の組み立てでは有効にならない ---");
console.log("   NODE_ENV が production なら、宛先が localhost でも素通ししない");

for (const host of LOCAL_HOSTS) {
  ok(`  本番の組み立て + 宛先 ${host}`, localPreviewBlock({ NODE_ENV: "production" }, [host]), "production");
}
ok("本番の組み立て + 逃げ道なし", localPreviewBlock({ NODE_ENV: "production" }, ["localhost:3000"]), "production");
ok("見ている環境変数の名前", /env\["NODE_ENV"\] === "production"/.test(PREVIEW), true);
ok("最初に確かめるのが本番かどうか", /return "production";/.test(PREVIEW), true);

// ---------------------------------------------------------------------------
console.log("\n--- 3. Vercel の上では有効にならない ---");
console.log("   Vercel が自分で立てる環境変数が 1 つでもあれば、そこは手元ではない");

const VERCEL_MARKS = [
  { VERCEL_REGION: "iad1" },
  { VERCEL_DEPLOYMENT_ID: "dpl_abc123" },
  { AWS_LAMBDA_FUNCTION_NAME: "iad1--surprise-pages" },
  // 走っている最中の目印と、写しに入ってくるものが混ざっていても止まる
  { VERCEL_REGION: "hnd1", VERCEL_ENV: "production" },
];
for (const marks of VERCEL_MARKS) {
  const shown = Object.entries(marks)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  ok(`  ${shown}（宛先は localhost）`, localPreviewBlock(marks, ["localhost:3000"]), "vercel");
}
ok("走っている最中の目印を 3 つ見ている", VERCEL_RUNTIME_MARKS.length, 3);
ok("VERCEL_REGION を見ている", VERCEL_RUNTIME_MARKS.includes("VERCEL_REGION"), true);

/*
 * ここが一番間違えやすいところ。README のとおり、手元の環境は `vercel env pull` で
 * 本番から丸ごと写して作る。写しの中には VERCEL / VERCEL_ENV / VERCEL_URL が入ってくるので、
 * あれを Vercel の目印にすると**手元でこの仕掛けが一度も効かない**（鍵が無いのに
 * ログインを求められる、元の困りごとに戻る）。写しに入るものを目印にしていないか見張る。
 */
console.log("\n   写しに入ってくる欄を目印にしていないか（手元で効かなくなるため）");
const PULLED_MARKS = ["VERCEL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_TARGET_ENV", "VERCEL_OIDC_TOKEN"];
for (const mark of PULLED_MARKS) {
  ok(`  ${mark} を目印にしていない`, VERCEL_RUNTIME_MARKS.includes(mark), false);
  ok(`  ${mark} だけでは止まらない`, localPreviewBlock({ [mark]: "production" }, ["localhost:3000"]), null);
}
console.log("\n   本番から写した環境そのまま（Vercel の写し一式）でも、手元では素通しになる");
const PULLED_ENV = {
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_URL: "surprise-pages-abc123.vercel.app",
  VERCEL_TARGET_ENV: "production",
  VERCEL_GIT_COMMIT_REF: "main",
  VERCEL_OIDC_TOKEN: "（写し）",
};
ok("写し一式 + 宛先 localhost", localPreviewBlock(PULLED_ENV, ["localhost:3000"]), null);
console.log("\n   ただし、その写しを持ったまま本番の宛先へ来たら止まる（3 つめの歯止め）");
ok("写し一式 + 宛先 本番", localPreviewBlock(PULLED_ENV, ["pages.example.com"]), "remoteHost");
ok(
  "写し一式 + 本番の組み立て",
  localPreviewBlock({ ...PULLED_ENV, NODE_ENV: "production" }, ["localhost:3000"]),
  "production",
);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 宛先が手元でないときは有効にならない ---");
console.log("   1 と 2 をすり抜ける事故（本番の設定を手元へ写した / 逆）でも、ここで止まる");

for (const host of REMOTE_HOSTS) {
  ok(`  宛先 ${host}`, localPreviewBlock({}, [host]), "remoteHost");
}
console.log("\n   手元の宛先は、ここでは止まらない");
for (const host of LOCAL_HOSTS) {
  ok(`  宛先 ${host}`, localPreviewBlock({}, [host]), null);
}

console.log("\n   宛先の名乗りが読めないときも素通しにしない（安全側へ倒す）");
ok("名前が 1 つも無い", localPreviewBlock({}, []), "remoteHost");
ok("名前が空", localPreviewBlock({}, [""]), "remoteHost");
ok("名前が空白だけ", localPreviewBlock({}, ["   "]), "remoteHost");
ok("名前が null", localPreviewBlock({}, [null]), "remoteHost");
ok("名前が無い（undefined）", localPreviewBlock({}, [undefined]), "remoteHost");
ok("null と undefined だけ", localPreviewBlock({}, [null, undefined]), "remoteHost");

console.log("\n   間に立つものが足す宛先も見る（1 つでもよそを向いていたら止める）");
ok(
  "Host は手元・転送先は本番",
  localPreviewBlock({}, ["localhost:3000", "pages.example.com"]),
  "remoteHost",
);
ok(
  "Host は本番・転送先は手元",
  localPreviewBlock({}, ["pages.example.com", "localhost:3000"]),
  "remoteHost",
);
ok("両方とも手元", localPreviewBlock({}, ["localhost:3000", "127.0.0.1:3000"]), null);
ok("転送先が無いだけ（Host は手元）", localPreviewBlock({}, ["localhost:3000", null]), null);
ok("x-forwarded-host も見ている", /x-forwarded-host/.test(PREVIEW), true);
ok("全部が手元のときだけ通す（every）", /\.every\(\(host\) => isLoopbackHost\(host\)\)/.test(PREVIEW), true);
ok("some で通していない", /\.some\(\(host\) => isLoopbackHost/.test(PREVIEW), false);

console.log("\n   宛先 1 つの読み取り（番号付き・IPv6・大文字）");
const HOST_CASES = [
  ["localhost", true],
  ["localhost:3000", true],
  ["LOCALHOST:3000", true],
  ["  localhost:3100  ", true],
  ["127.0.0.1", true],
  ["127.0.0.1:3000", true],
  ["[::1]", true],
  ["[::1]:3000", true],
  ["[::1", false],
  ["[::2]:3000", false],
  ["::1", false],
  ["127.0.0.2", false],
  ["127.0.0.1x", false],
  ["localhost.evil.com", false],
  ["evil.com", false],
  ["", false],
];
for (const [host, expected] of HOST_CASES) {
  ok(`  ${JSON.stringify(host)}`, isLoopbackHost(host), expected);
}
ok("宛先が全部手元（isLocalTarget）", isLocalTarget(["localhost:3000"]), true);
ok("宛先によそが混じる（isLocalTarget）", isLocalTarget(["localhost:3000", "evil.com"]), false);

// ---------------------------------------------------------------------------
console.log("\n--- 5. 逃げ道の環境変数で切れる ---");
console.log("   既定はオン（設定なしで素通し）。旗を立てたときだけ本物のログインに戻る");

ok("逃げ道の名前", REAL_LOGIN_FLAG, "LOCAL_LOGIN_REQUIRED");
ok("設定なしなら素通し", localPreviewBlock({}, ["localhost:3000"]), null);
for (const value of ["1", "true", "yes", "on", "はい"]) {
  ok(`  ${REAL_LOGIN_FLAG}=${value}`, localPreviewBlock({ [REAL_LOGIN_FLAG]: value }, ["localhost:3000"]), "optedOut");
}
console.log("\n   「立てていない」と読む書き方（打ち間違いで本物のログインに戻らないため）");
for (const value of ["", "   ", "0", "false", "FALSE"]) {
  ok(
    `  ${REAL_LOGIN_FLAG}=${JSON.stringify(value)}`,
    localPreviewBlock({ [REAL_LOGIN_FLAG]: value }, ["localhost:3000"]),
    null,
  );
}
ok("逃げ道の名前を書き写していない", (PREVIEW.match(/LOCAL_LOGIN_REQUIRED/g) ?? []).length, 1);
ok("読むのは名前で持っている定数から", /env\[REAL_LOGIN_FLAG\]/.test(PREVIEW), true);

// ---------------------------------------------------------------------------
console.log("\n--- 6. 素通しになるのは手元のときだけか（総当たり） ---");
console.log("   4 つの歯止めを別々に書いた予想と、実物の答えを 1 つずつ突き合わせる");

const NODE_ENVS = [undefined, "development", "test", "production"];
/** 走っている最中の目印（あれば Vercel の上）。 */
const REGIONS = [undefined, "iad1"];
/** 写しに入ってくる欄（あっても手元の判断を変えない）。 */
const PULLED = [undefined, "production"];
const FLAGS = [undefined, "1", "0"];
const HOST_SETS = [
  ["localhost:3000"],
  ["127.0.0.1:3100"],
  ["[::1]:3000"],
  ["pages.example.com"],
  ["pages.example.com"],
  ["localhost:3000", "pages.example.com"],
  [],
];

/** 予想。実装とは別に書く（同じ式を写すと、両方まとめて間違えたときに気づけない）。 */
const expectPass = (nodeEnv, region, pulled, flag, hosts) => {
  if (nodeEnv === "production") return false;
  if (region !== undefined) return false;
  // pulled（写しに入ってくる欄）は、あってもなくても答えを変えない
  void pulled;
  if (hosts.length === 0) return false;
  if (!hosts.every((host) => LOCAL_HOSTS.includes(host))) return false;
  if (flag !== undefined && flag !== "0") return false;
  return true;
};

let combos = 0;
let passed = 0;
let wrong = 0;
for (const nodeEnv of NODE_ENVS) {
  for (const region of REGIONS) {
    for (const pulled of PULLED) {
      for (const flag of FLAGS) {
        for (const hosts of HOST_SETS) {
          const env = {};
          if (nodeEnv !== undefined) env["NODE_ENV"] = nodeEnv;
          if (region !== undefined) env["VERCEL_REGION"] = region;
          if (pulled !== undefined) {
            env["VERCEL"] = "1";
            env["VERCEL_ENV"] = pulled;
            env["VERCEL_URL"] = "surprise-pages-abc123.vercel.app";
          }
          if (flag !== undefined) env[REAL_LOGIN_FLAG] = flag;

          combos += 1;
          const through = localPreviewBlock(env, hosts) === null;
          if (through) passed += 1;
          if (through !== expectPass(nodeEnv, region, pulled, flag, hosts)) wrong += 1;
        }
      }
    }
  }
}
ok("試した組み合わせ", combos, NODE_ENVS.length * REGIONS.length * PULLED.length * FLAGS.length * HOST_SETS.length);
ok("予想と食い違った組み合わせ", wrong, 0);
ok("素通しになった組み合わせがある（仕掛けが死んでいない）", passed > 0, true);
ok(
  "素通しになったのは手元・本番以外・Vercel でない・旗なしのときだけ",
  passed,
  // NODE_ENV は production 以外の 3 通り / 走っている最中の目印なし 1 通り /
  // 写しの欄は有無どちらでもよいので 2 通り / 旗は「無い」と「0」の 2 通り /
  // 宛先は手元だけの 3 通り
  3 * 1 * 2 * 2 * 3,
);

console.log("\n   宛先を教える口が無い場所から呼ばれたら null（素通しにしない）");
ok("宛先が読めない", await localPreviewMember(), null);

// ---------------------------------------------------------------------------
console.log("\n--- 7. ログイン状態を読む口が 1 か所に集まっているか ---");
console.log("   入口ごとに「手元なら通す」と書き足すと、本番で 1 つだけ外れる事故の種が増える");

/** src/app/ と src/lib/ の実装ファイルを全部読む。 */
async function collect(from) {
  const found = [];
  for (const entry of await readdir(`${root}/${from}`, { withFileTypes: true })) {
    const path = `${from}/${entry.name}`;
    if (entry.isDirectory()) found.push(...(await collect(path)));
    else if (/\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found;
}
const FILES = new Map();
for (const path of [...(await collect("src/app")), ...(await collect("src/lib"))].sort()) {
  FILES.set(path, strip(await read(path)));
}
ok("読んだ実装ファイルの数", FILES.size > 30, true);

console.log("\n   セッションを直にのぞくのは src/lib/identity/identity.ts だけ");
const readers = [...FILES].filter(([, code]) => /\bawait auth\(\)/.test(code)).map(([path]) => path);
ok("await auth() を呼ぶファイル", readers.join(" / ") || "なし", "src/lib/identity/identity.ts");
// 鍵発行などブラウザ専用の本人確認（currentBrowserIdentity）も、同じ 1 回の読み取り（currentIdentity）を通す。
// 2 か所で読むと、手元の仮の人が「画面では見えるのに保存だけ 401」のように、口ごとに名乗りがずれる
ok("セッションを読むのは通常の本人確認の 1 回だけ（鍵発行の口も同じ名乗りを通す）", (IDENTITY.match(/await auth\(\)/g) ?? []).length, 1);
ok("鍵発行の本人確認は通常の名乗りから絞る", /const identity = await currentIdentity\(\);\s*if \(!isMember\(identity\) \|\| !mayPublish\(identity\.email\)\) return null;/.test(IDENTITY), true);

/** `auth` そのものを持ち込んでよいファイルと、その理由。**増やさない。** */
const AUTH_IMPORT_ALLOWED = new Map([
  ["src/lib/identity/identity.ts", "名乗りを決めるただ 1 つの口。ここだけがセッションを読む"],
  ["src/app/api/auth/[...nextauth]/route.ts", "Google とのやりとりを受ける口。handlers を渡すだけで、読まない"],
]);
const importers = [...FILES]
  .filter(([, code]) => /import \{[^}]*\bauth\b[^}]*\} from "@\/auth"/.test(code))
  .map(([path]) => path);
ok(
  "auth を持ち込んでいるファイル",
  importers.filter((path) => !AUTH_IMPORT_ALLOWED.has(path)).join(" / ") || "なし",
  "なし",
);
ok("免除してあるファイルの数（増やさない）", AUTH_IMPORT_ALLOWED.size, 2);
for (const [path, why] of AUTH_IMPORT_ALLOWED) {
  ok(`  免除の理由が書いてある: ${path}`, why.length > 0, true);
}
console.log("\n   ログインの画面も、自分でセッションをのぞかない");
ok("名乗りは src/lib/identity/identity.ts から受け取る", /await currentIdentity\(\)/.test(SIGNIN), true);
ok("session?.user を直に見ていない", /session\?\.user/.test(SIGNIN), false);

console.log("\n   手元の仕掛けを知ってよいファイルと、その理由。**増やさない**");
/*
 * 隣の免除表（auth を持ち込んでよいファイル）は数を見張っているのに、ここは見張っていなかった。
 * 表に 1 行足せば黙って通ってしまう＝「入口ごとに手元なら通すと書き足さない」という
 * いちばん大事な決まりが、検査を素通りして緩む。数も一緒に押さえる。
 */
const KNOWS = new Map([
  ["src/lib/pages/local-preview.ts", "仕掛けそのもの。歯止めも仮の人も、決めているのはここだけ"],
  ["src/lib/identity/identity.ts", "名乗りを決めるただ 1 つの口。差し込みはここ 1 行だけ"],
  [
    "src/lib/pages/views.ts",
    "本番の保管庫へ跡を残す書き込み。手元の pnpm dev は本番を向いているので、仮の人の分を手前で落とす",
  ],
]);
const MENTIONS = /localPreview|LOCAL_PREVIEW|LOCAL_LOGIN_REQUIRED|local-preview/;
const leaked = [...FILES].filter(([path, code]) => !KNOWS.has(path) && MENTIONS.test(code)).map(([path]) => path);
ok("仕掛けを知っているファイル", leaked.length === 0 ? "なし" : leaked.join(" / "), "なし");
/*
 * 数の見張り。**増やすときは「本番の外へ跡が残る書き込みか」だけを理由にする。**
 * 個人配布版は Slack のスレッドへの知らせ（src/lib/comment-notify.ts）を外したので 3 に戻った。
 * 見え方を変える・断り方を変える、といった理由で足さないこと。
 */
ok("知ってよいファイルの数（増やさない）", KNOWS.size, 3);
for (const [path, why] of KNOWS) {
  ok(`  理由が書いてある: ${path}`, why.length > 0, true);
  ok(`  そのファイルがある`, FILES.has(path), true);
}
console.log("\n   知ってよい側でも、可否の判定には使わない（弾くのは「跡を残すか」だけ）");
ok("弾く述語がある", /export function isLocalPreviewMember\(/.test(PREVIEW), true);
ok("素通りさせるかを答える述語がある", /export function skipsRealStore\(/.test(PREVIEW), true);
ok("控えを積む側が、それを呼んでいる", /skipsRealStore\(viewer\)/.test(await read("src/lib/pages/views.ts")), true);
ok("控えを積む前に落としている", (await read("src/lib/pages/views.ts")).indexOf("skipsRealStore(viewer)") < (await read("src/lib/pages/views.ts")).indexOf(".rpc("), true);


/*
 * 弾きを外す旗（手元で控えの動きを目で確かめるためのもの）。
 *
 * 本番で効かせないための要は 2 つ。旗を見る前に「仮の人か」を必ず確かめること
 * （本番では仮の人になれないので、そこで必ず false に落ちる）と、
 * 旗を見るのがこのファイルの中だけであること（入口が自分で環境変数を読み始めたら、
 * 歯止めが 4 つでは足りなくなる）。
 */
console.log("\n   弾きを外す旗は、仮の人だと分かってからしか見ない");
ok("旗の名前が定数になっている", /export const RECORD_ANYWAY_ENV = "LOCAL_PREVIEW_RECORD_VIEWS"/.test(PREVIEW), true);
ok(
  "先に「仮の人か」を確かめてから旗を見る",
  PREVIEW.indexOf("if (!isLocalPreviewMember(identity)) return false;") <
    PREVIEW.indexOf("process.env[RECORD_ANYWAY_ENV]"),
  true,
);
ok("旗を見るのはこのファイルだけ", (await read("src/lib/pages/views.ts")).includes("LOCAL_PREVIEW_RECORD_VIEWS"), false);
ok("旗は 1 のときだけ効く", /process\.env\[RECORD_ANYWAY_ENV\] !== "1"/.test(PREVIEW), true);
ok("差し込みは 1 か所だけ", (IDENTITY.match(/localPreviewMember\(\)/g) ?? []).length, 1);
ok("本物のセッションより前に確かめる", IDENTITY.indexOf("localPreviewMember()") < IDENTITY.indexOf("await auth()"), true);

console.log("\n   入口が自分で環境変数を見て分岐していないか");
// process.env.NODE_ENV と process.env["NODE_ENV"] の両方の書き方を拾う
const SNIFFERS = /process\.env(?:\.|\["?)(NODE_ENV|VERCEL|VERCEL_ENV|VERCEL_URL)\b/;
const sniffers = [...FILES]
  .filter(([path, code]) => path !== "src/lib/pages/local-preview.ts" && SNIFFERS.test(code))
  .map(([path]) => path);
// 1 つも無いのが正しい。名乗りの可否に「本番かどうか」は 1 度も出てこない
// （cookie に封をしていた src/lib/access/guest.ts は、券を作る側ごと無くなった）
ok("組み立ての種類を見ているファイル", sniffers.join(" / ") || "なし", "なし");

// ---------------------------------------------------------------------------
console.log("\n--- 8. 見てよいかの判定に例外の枝を足していないか ---");
console.log("   仮の人は「ただの社内の人」。制限つきのページは名簿に無い以上ふつうに断られる");

ok("可否の判定が仕掛けを知らない", MENTIONS.test(ACCESS), false);
ok("可否の判定に「手元」という枝が無い", /手元/.test(ACCESS), false);
ok("決めるのは 1 つの部品だけ", (ACCESS.match(/const access = await canViewPage\(identity, page\);/g) ?? []).length, 1);
ok("仕掛けは可否を呼ばない", /canViewPage|decideAccess|openPage/.test(PREVIEW), false);
ok("仕掛けは保管庫に触らない", /supabase|getDb|@vercel\/blob/.test(PREVIEW), false);
ok("社内の仮の人と、隔離した個人試験用の人だけ", (PREVIEW.match(/kind: "member"/g) ?? []).length, 2);
ok("管理者の名簿に手を出さない", /isAdmin|admins/.test(PREVIEW), false);

console.log("\n   気づける印は、配信するページの本文に足さない");
ok("ターミナルへ 1 行出す", /console\.log\(/.test(PREVIEW), true);
ok("出すのは 1 回きり", /if \(announced\) return;/.test(PREVIEW), true);
ok("本文へ差し込む部品を呼んでいない", /withAssetBase|withCommentsWidget|withVendorScripts|withOgTags|withSafeAnchorIds/.test(PREVIEW), false);
ok("HTML を組み立てていない", /<script|<div|<style/.test(PREVIEW), false);

// ---------------------------------------------------------------------------
console.log(fails === 0 ? "\nぜんぶ通った" : `\n${fails} 件が期待と違う`);
process.exitCode = fails === 0 ? 0 : 1;
