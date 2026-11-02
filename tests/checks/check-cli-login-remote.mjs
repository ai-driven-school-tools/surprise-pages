/**
 * クラウドからのログインが「値を漏らさずに、本人の許可だけを門にする」かを確かめる。
 *
 * 手元のログインは 127.0.0.1 へ届ける。クラウドには人のブラウザが無いので、
 * 人が自分のパソコンで許可した名乗りを、作業場が取りに来る。危ないのは 3 か所。
 *
 *   1. URL に名乗りや取りに来る合言葉が載る
 *   2. 合言葉が違うときの返事が「まだ」と違う（合図を知っている人が探せる）
 *   3. 画面を開いただけ・人が押す前に名乗りが用意される
 *
 * 保管庫にはつながない。形の判定と、取りに来た結果の決めだけをそのまま呼ぶ。
 */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { root, dir } from "./paths.mjs";
import { jaText, withJaText } from "./i18n-ja-text.mjs";
const { build } = await import(pathToFileURL(`${root}/node_modules/esbuild/lib/main.js`).href);

await build({
  entryPoints: [`${root}/src/lib/identity/cli-login-pending-value.ts`],
  outfile: `${dir}/cli-login-pending-value.mjs`,
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*"],
});

const {
  PENDING_TTL_MS,
  decideClaim,
  hashPollSecret,
  readClaimRequest,
  readOpenRequest,
  samePollSecret,
  usableHandshake,
  usablePollSecret,
  usablePollSecretHash,
} = await import(pathToFileURL(`${dir}/cli-login-pending-value.mjs`).href);

const {
  LOGIN_TIMEOUT_MS,
  buildRemoteLoginQuery,
  hashPollSecret: cliHash,
  isCloudSession,
  parseClaimResponse,
  remoteComputerLabel,
  workspaceMark,
} = await import(pathToFileURL(`${root}/bin/pages-publish.mjs`).href);

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

const codeOnly = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const flatten = (text) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .join(" ")
    .replace(/ {2,}/g, " ");

const STATE = "Ab3-_zYx9QwErTyU12345678";
const SECRET = "c".repeat(43);
const HASH = createHash("sha256").update(SECRET, "utf8").digest("hex");
const TOKEN = `spg_${"a".repeat(43)}`;
const NOW = 1_700_000_000_000;

const cli = codeOnly(await readFile(`${root}/bin/pages-publish.mjs`, "utf8"));
const page = codeOnly(await readFile(`${root}/src/app/cli-login/page.tsx`, "utf8"));
const handoff = codeOnly(await readFile(`${root}/src/app/cli-login/handoff.tsx`, "utf8"));
const actions = codeOnly(await readFile(`${root}/src/app/cli-login/actions.ts`, "utf8"));
const createRoute = codeOnly(
  await readFile(`${root}/src/app/api/cli-login/pending/route.ts`, "utf8"),
);
const claimRoute = codeOnly(
  await readFile(`${root}/src/app/api/cli-login/pending/claim/route.ts`, "utf8"),
);

console.log("--- 1. 合図と合言葉の形 ---");
ok("手元と同じ合図は通る", usableHandshake(STATE), STATE);
ok("短い合図は落とす", usableHandshake("abc"), null);
ok("合言葉は 32 文字以上", usablePollSecret(SECRET), SECRET);
ok("短い合言葉は落とす", usablePollSecret("short"), null);
ok("ハッシュは 64 桁の 16 進", usablePollSecretHash(HASH), HASH);
ok("形の違うハッシュは落とす", usablePollSecretHash("ZZ"), null);
ok("CLI とサーバーのハッシュが同じ", cliHash(SECRET), hashPollSecret(SECRET));
ok("同じ合言葉なら合う", samePollSecret(HASH, SECRET), true);
ok("1 文字違えば合わない", samePollSecret(HASH, `${SECRET.slice(0, -1)}z`), false);

console.log("\n--- 2. 待ち受けを開く・取りに来る中身 ---");
const opened = readOpenRequest({ state: STATE, pollSecretHash: HASH, name: "Cursor Cloud" });
ok("正しい開きは通る", opened?.state, STATE);
ok("開きに名乗りは載せない", opened && "token" in opened, false);
ok("ハッシュが無ければ落とす", readOpenRequest({ state: STATE }), null);
ok("正しい受け取りは通る", readClaimRequest({ state: STATE, pollSecret: SECRET })?.state, STATE);
ok("受け取りに名乗りは要らない", readClaimRequest({ state: STATE, pollSecret: SECRET, token: TOKEN })?.pollSecret, SECRET);
ok("合言葉が無ければ落とす", readClaimRequest({ state: STATE }), null);

console.log("\n--- 3. 取りに来た結果の決め ---");
const waiting = { status: "waiting" };
const expired = { status: "expired" };
const readyRow = {
  pollSecretHash: HASH,
  handoff: TOKEN,
  email: "owner@example.com",
  expiresAtMs: NOW + 60_000,
  consumed: false,
};
ok(
  "届いていて合言葉が合えば渡す",
  decideClaim({ row: readyRow, pollSecret: SECRET, nowMs: NOW }).status,
  "ready",
);
ok(
  "渡す中身は名乗りそのもの",
  decideClaim({ row: readyRow, pollSecret: SECRET, nowMs: NOW }).token,
  TOKEN,
);
ok("行が無ければまだ", decideClaim({ row: null, pollSecret: SECRET, nowMs: NOW }).status, waiting.status);
ok(
  "合言葉が違えばまだ（探させない）",
  decideClaim({ row: readyRow, pollSecret: `${SECRET.slice(0, -1)}z`, nowMs: NOW }).status,
  waiting.status,
);
ok(
  "まだ許可されていなければまだ",
  decideClaim({
    row: { ...readyRow, handoff: null, email: null },
    pollSecret: SECRET,
    nowMs: NOW,
  }).status,
  waiting.status,
);
ok(
  "期限が切れていれば切れ",
  decideClaim({ row: readyRow, pollSecret: SECRET, nowMs: NOW + 120_000 }).status,
  expired.status,
);
ok(
  "取られたあとは切れ",
  decideClaim({ row: { ...readyRow, consumed: true }, pollSecret: SECRET, nowMs: NOW }).status,
  expired.status,
);
ok("待ちの上限は手元と同じ 3 分", PENDING_TTL_MS, LOGIN_TIMEOUT_MS);

console.log("\n--- 4. URL と画面に値を出さない ---");
const query = buildRemoteLoginQuery(STATE, "Cursor Cloud");
ok("クラウドの URL に載るのは合図と名前", query.get("state"), STATE);
ok("クラウドの URL に名乗りは載せない", query.get("token"), null);
ok("クラウドの URL に合言葉は載せない", query.get("pollSecret"), null);
ok("CLI が郵便受けを開くとき合言葉の生は送らない", /pollSecretHash/.test(cli) && !/pollSecretHash: pollSecret/.test(cli), true);
ok("取りに来る合言葉は URL に出していない", /cli-login\?[^`]*pollSecret/.test(cli), false);
ok("クラウド用の URL 組み立てに名乗りが入っていない", /cli-login\?[^`]*token/.test(cli), false);
ok("画面はクラウドでも値を描かない", /(?<!=)\{state\.secret\}/.test(page), false);
ok("クラウドの許可は郵便受けへ置く", /await depositHandoff\(organization, remote, issued\.token, viewer\.email\)/.test(actions), true);
ok("クラウドの許可は画面に中身を返さない", /kind: "sent"/.test(actions), true);
ok("手元へ届けるのは番号があるときだけ", /if \(remote !== null\)/.test(actions), true);

console.log("\n--- 5. 開いただけでは何も起きない ---");
ok("画面を開いても名乗りを用意しない", /issueToken/.test(page), false);
ok("クラウドの待ち受けがあるかだけ見る", /findOpenPending\(organization, handshake\)/.test(page), true);
ok("番号が無い URL は郵便受けを見る", /port === null/.test(page), true);
ok("郵便受けが無ければ直接開いたときと同じ案内", flatten(withJaText(page)).includes("直接開いても何も起きません。"), true);
ok("クラウドでも人が押す門がある", /target === null \? <input type="hidden" name="state"/.test(handoff), true);
ok(
  "クラウドの案内はクラウド環境だと書く",
  [
    /target === null \? t\("auth\.cliLogin\.fromCloud"\) : t\("auth\.cliLogin\.fromComputer"\)/.test(handoff),
    jaText("auth.cliLogin.fromCloud").startsWith("クラウド環境から"),
    jaText("auth.cliLogin.fromComputer").startsWith("このパソコンから"),
  ],
  [true, true, true],
);
ok("誰の名前になるかを書いてある", flatten(withJaText(handoff)).includes("あなたの名前で投稿できるようにします。"), true);
/*
  逃げ道は「押す前だけ」出す。押したあとも出したままだと、済んだ人に閉じろと
  言い続けることになる（実機の画面で読み返して直した）。
*/
ok("心当たりが無い人の逃げ道がある", flatten(withJaText(handoff)).includes("心当たりがなければ、このページを閉じてください。"), true);
ok("その 1 行は押す前だけ（押したあとの画面には無い）", /case "idle":[\s\S]*心当たりがなければ/.test(withJaText(handoff)) && !/case "sent":[\s\S]{0,200}心当たりがなければ/.test(withJaText(handoff)), true);
ok("ページ側は額縁だけ（説明も断りも持たない）", /心当たりがなければ|投稿できるようにします/.test(flatten(page)), false);

console.log("\n--- 6. 入口はログイン前でも叩ける（作業場はまだ誰でもない）---");
ok("開きの口はログインを見ない", /currentIdentity|isMember|ownerFromRequest/.test(createRoute), false);
ok("受け取りの口もログインを見ない", /currentIdentity|isMember|ownerFromRequest/.test(claimRoute), false);
ok("開きの口は形が違えば 400", /待ち受けの指定が正しくありません/.test(withJaText(createRoute)), true);
ok("受け取りの口は形が違えば 400", /受け取りの指定が正しくありません/.test(withJaText(claimRoute)), true);

console.log("\n--- 7. 作業場の見分けと、返ってきた 1 通 ---");
ok("Cursor の作業場だと判定する", isCloudSession({ CURSOR_CLOUD: "1" }), true);
ok("Claude の作業場だと判定する", isCloudSession({ CLAUDE_CODE_REMOTE: "true" }), true);
ok("手元は作業場ではない", isCloudSession({}), false);
ok("Cursor の一覧名", remoteComputerLabel({ CURSOR_CLOUD: "1" }, "cursor"), "Cursor Cloud");
ok("Claude の一覧名", remoteComputerLabel({ CLAUDE_CODE_REMOTE: "true" }, "cursor"), "Claude Cloud");
ok("まだなら status だけ", parseClaimResponse({ status: "waiting" })?.status, "waiting");
ok("切れても status だけ", parseClaimResponse({ status: "expired" })?.status, "expired");
ok("届いたら名乗りを読む", parseClaimResponse({ status: "ready", token: TOKEN, email: "owner@x.co" })?.token, TOKEN);
ok("形の違う名乗りは捨てる", parseClaimResponse({ status: "ready", token: "nope" }), null);
ok("CLI は合言葉を画面に出していない", /console\.(log|error)\([^)]*pollSecret/.test(cli), false);
const remoteFn = /async function runRemoteLogin\([^)]*\) \{[\s\S]*?\nasync function loginCommand/.exec(cli)?.[0] ?? "";
ok("クラウドのログイン関数がある", remoteFn.includes("async function runRemoteLogin"), true);
ok("クラウドのログインはブラウザを開かない", /openBrowser/.test(remoteFn), false);
ok("画面の文字にトークンが出てこない", flatten(page).includes("トークン"), false);
ok(
  "控えがあればログインし直さない",
  /if \(!forAnother && alreadyLoggedIn\(target\)\) \{\s*console\.log\("すでにログイン済みです。"\)/.test(cli),
  true,
);
/*
  唯一の例外が --new（別の席のぶんを作る）。ここだけは控えがあっても作れる。
  作ったものを手元の控えへ書かないことまで見ておく——書くと、いま使えている
  名乗りが黙って置き換わる。
*/
ok("別の席のぶんだけは作れる", /arg === "--new"/.test(cli), true);
ok("そのときは受け取らない", /runRemoteLogin\(\{ claim: !forAnother, target \}\)/.test(cli), true);
ok("受け取らないなら控えに書かない", /if \(!claim\) \{[\s\S]*?return null;/.test(remoteFn), true);

console.log("\n--- 7.5 作業場ごとに違う名札を付ける ---");
/**
 * ここが同じ名札になると、一覧の片付け（同じ名前の古いものをログアウトさせる）が
 * **別の生きている作業場の名乗りまで消す**。Secrets に入れた分も消えるので、
 * 全部の作業場が黙って投稿できなくなる（実機で再現した）。
 */
const MARK = "bc-04b0851a-f552-4864-a523-2e8dd4495426";
ok("会話の目印から名札を作る", workspaceMark({ CURSOR_CONVERSATION_ID: MARK }, "cursor"), "04b0851a");
ok("どの作業場でも同じ機械名は使わない", workspaceMark({}, "cursor"), "");
ok("手元の機械名は使う", workspaceMark({}, "mako-macbook"), "mako-macbook");
ok("短すぎる目印は使わない", workspaceMark({ CURSOR_CONVERSATION_ID: "bc-1" }, "cursor"), "");
ok("Cursor の作業場は名札込みで並ぶ", remoteComputerLabel({ CURSOR_CONVERSATION_ID: MARK }, "cursor"), "Cursor Cloud 04b0851a");
ok(
  "作業場が違えば名前も違う",
  remoteComputerLabel({ CURSOR_CONVERSATION_ID: MARK }, "cursor") ===
    remoteComputerLabel({ CURSOR_CONVERSATION_ID: "bc-99999999-aaaa" }, "cursor"),
  false,
);
ok("名札は覚え書きの長さに収まる", remoteComputerLabel({ CURSOR_CONVERSATION_ID: MARK }, "cursor").length <= 40, true);

console.log("\n--- 8. 次の作業場では、本人の Secrets だけが近道 ---");
/**
 * ここが緩むと、「会社の作業場である印」のような共有の秘密で名乗りを再発行する
 * 設計が復活する。共有の印は社内の別人への成りすましを許し、記録が嘘をつく
 * （レビューで棄却済み）。近道は、本人だけが読める置き場（個人の Secrets →
 * PAGES_TOKEN 環境変数 → 手元の控え）以外に作らない。
 */
ok("サーバーに「覚える」仕組みが無い", /rememberCloudGrant|cloud_publish_grants|resumeProof|CLOUD_RESUME_BRIDGE/.test(cli + actions), false);
ok("取り戻しの口そのものが無い", existsSync(`${root}/src/app/api/cli-login/resume`), false);
ok("共有の合鍵を配る値の正本も無い", existsSync(`${root}/src/lib/cloud-resume-value.ts`), false);
ok("許可の画面は Secrets への保存を案内する", flatten(withJaText(handoff)).includes("Cursor の Secrets に次の 2 つを保存します。"), true);
ok("名前も貼れる形で出す", /value=\{SECRET_NAME\}/.test(handoff) && /const SECRET_NAME = "PAGES_TOKEN"/.test(handoff), true);
// 最初の組織 以外の組織の宛先では、投稿先の組織（PAGES_ORG）の名前と値の 2 行が足される。それを除いて数える
const withoutOrganization = handoff.replace(/\{organizationSlug !== null \? \([\s\S]*?\) : null\}/, "");
ok("名前と値の 2 行で出す", (withoutOrganization.match(/<CopyRow/g) ?? []).length, 2);
ok("組織の名乗りは 最初の組織 以外の組織でだけ 2 行足す", (handoff.match(/<CopyRow/g) ?? []).length - (withoutOrganization.match(/<CopyRow/g) ?? []).length, 2);
ok("共有の Secrets に入れないよう断っている", flatten(withJaText(handoff)).includes("チーム共有だと、全員の投稿があなたの名前になります。"), true);
ok("値はコピー用に渡すだけ", /value=\{secret\}/.test(handoff), true);
ok("画面に出るのは伏せ字", /display=\{MASKED_VALUE\}/.test(handoff) && /const MASKED_VALUE = "•+"/.test(handoff), true);
ok("伏せ字は長さを伝えない（値と同じ長さにしない）", /const MASKED_VALUE = "•{16}";/.test(handoff), true);
ok("値を文字として描いていない", /(?<!=)\{secret\}/.test(handoff), false);
ok("押せるかどうかで描き分けない（食い違いを作らない）", /typeof navigator/.test(handoff), false);
ok(
  "写せなかったときも値は出さない",
  [/failNote=\{t\("auth\.cliLogin\.copyFailed"\)\}/.test(handoff), jaText("auth.cliLogin.copyFailed")],
  [true, "コピーできませんでした。次のクラウド環境で、もう一度ログインしてください。"],
);
ok("保存先の URL を出す", /cursor\.com\/dashboard\/cloud-agents/.test(handoff), true);
ok("行き先は書いてある 2 つだけ（受け取った文字を混ぜない）", /href=\{where\.url\}/.test(handoff) && !/href=\{`/.test(handoff), true);
ok("別のタブで開く（この画面を離れない）", /target="_blank" rel="noreferrer"/.test(handoff), true);
ok("環境の名前で保存先を選ぶ", /computer\.startsWith\(one\.match\)/.test(handoff), true);
ok("CLI も Secrets への保存を案内する", /Cursor の自分専用 Secrets に保存してください/.test(cli), true);

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
if (fails > 0) process.exit(1);
