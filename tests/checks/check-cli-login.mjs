/**
 * ターミナルからのログインが「値を漏らさずに、正しい相手にだけ渡る」かを確かめる。
 *
 * この仕組みは、ブラウザで名乗り（投稿に使う値）を 1 つ作って、手元で待っている
 * プログラムへ渡すもの。危ないのは 2 か所しかない。
 *
 *   1. 手元の受け口は、このパソコンの中からなら誰でも叩ける
 *      → その場かぎりの合図が合わない届けは、必ず捨てているか
 *   2. 渡すものが、画面・URL・端末の記録に残ると、あとから拾える
 *      → 出す書き方をどこにも書いていないか
 *
 * 保管庫にもネットにもつながない。番号の見分けと合図の照合は、そのまま呼んで動かす。
 */
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { root, dir } from "./paths.mjs";
import { jaText, withJaText } from "./i18n-ja-text.mjs";
const { build } = await import(pathToFileURL(`${root}/node_modules/esbuild/lib/main.js`).href);

const run = promisify(execFile);

await build({
  entryPoints: [`${root}/src/app/cli-login/handoff-target.ts`],
  outfile: `${dir}/handoff-target.mjs`,
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*"],
});
const { MIN_PORT, MAX_PORT, computerName, firstValue, localTarget, usableState } = await import(pathToFileURL(`${dir}/handoff-target.mjs`).href);

/** 投稿コマンドは、この道具として呼ばれたときだけ走る。読み込んでも投稿は始まらない。 */
const { LOGIN_TIMEOUT_MS, MAX_HANDOFF_BYTES, browserCommands, cleanForDisplay, configDirFor, credentialFileFor, readHandoff, runningInWsl, sameSecret } =
  await import(pathToFileURL(`${root}/bin/pages-publish.mjs`).href);

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

/** 説明書き（コメント）は外して読む。書いた注意そのものを拾わないため。 */
const codeOnly = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const cli = codeOnly(await readFile(`${root}/bin/pages-publish.mjs`, "utf8"));
const page = codeOnly(await readFile(`${root}/src/app/cli-login/page.tsx`, "utf8"));
const handoff = codeOnly(await readFile(`${root}/src/app/cli-login/handoff.tsx`, "utf8"));
/** 「許可する」を押したときだけ動く実行係。用意する処理はここにしか無い。 */
const actions = codeOnly(await readFile(`${root}/src/app/cli-login/actions.ts`, "utf8"));

/** 画面に出る文字は行の折り返しで切れる。JSX と同じように 1 行に継いでから見る。 */
const flatten = (text) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .join(" ")
    .replace(/ {2,}/g, " ");

// ---------------------------------------------------------------------------
console.log("--- 1. 送り先の番号は、数字だけ・妥当な範囲 ---");
ok("下限は 1024", MIN_PORT, 1024);
ok("上限は 65535", MAX_PORT, 65535);
ok("よくある番号は通る", localTarget("49152"), "http://127.0.0.1:49152/");
ok("下限ちょうどは通る", localTarget("1024"), "http://127.0.0.1:1024/");
ok("上限ちょうどは通る", localTarget("65535"), "http://127.0.0.1:65535/");
ok("下限の 1 つ下は落とす", localTarget("1023"), null);
ok("上限の 1 つ上は落とす", localTarget("65536"), null);
ok("6 桁は落とす", localTarget("100000"), null);
ok("3 桁は落とす", localTarget("80"), null);
ok("頭に 0 が付くものは落とす", localTarget("08080"), null);
ok("符号付きは落とす", localTarget("+8080"), null);
ok("指数の書き方は落とす", localTarget("1e4"), null);
ok("前後に空白があれば落とす", localTarget(" 8080"), null);
ok("数字以外が混ざれば落とす", localTarget("80x80"), null);
ok("道を足そうとしたら落とす", localTarget("8080/evil"), null);
ok("問い合わせを足そうとしたら落とす", localTarget("8080?x=1"), null);
ok("別の相手を足そうとしたら落とす", localTarget("8080@example.com"), null);
ok("空文字は落とす", localTarget(""), null);
ok("文字列でない数は落とす", localTarget(8080), null);
ok("並びで渡されたら落とす", localTarget(["8080"]), null);
ok("何も無ければ落とす", localTarget(undefined), null);
ok("行き先は必ず 127.0.0.1", localTarget("50000").startsWith("http://127.0.0.1:"), true);
ok("ホスト名を差し替える隙が無い", /^http:\/\/127\.0\.0\.1:\d+\/$/.test(localTarget("50000")), true);

// ---------------------------------------------------------------------------
console.log("\n--- 2. その場かぎりの合図の形 ---");
const STATE = "Ab3-_zYx9QwErTyU12345678";
ok("ターミナルが作る形は通る", usableState(STATE), STATE);
ok("短すぎるものは落とす", usableState("abc"), null);
ok("長すぎるものは落とす", usableState("a".repeat(200)), null);
ok("記号が混ざれば落とす", usableState(`${STATE}!`), null);
ok("空白が混ざれば落とす", usableState(`${STATE.slice(0, 20)} abc`), null);
ok("空文字は落とす", usableState(""), null);
ok("文字列でないものは落とす", usableState(null), null);
ok("並びで渡されたら 1 つ目も見ない", firstValue(["a", "b"]), null);
ok("1 つだけならそのまま読む", firstValue("a"), "a");
ok("何も無ければ null", firstValue(undefined), null);

console.log("\n--- 2.5 一覧に並ぶパソコンの名前 ---");
ok("そのままの名前は通る", computerName("mako-macbook-pro"), "mako-macbook-pro");
ok("改行を落とす", computerName("mako\nmac"), "mako mac");
ok("制御文字を落とす", computerName("mako\u001b[31mmac"), "mako [31mmac");
ok("文字列でなければ空", computerName(null), "");
ok("一覧の名前はパソコン名から作る", /tidyLabel\(computerName\(form\.get\("name"\)\)\) \|\| UNNAMED/.test(actions), true);
ok(
  "名前が無ければ代わりの呼び名（保存先に残るので辞書の日本語のまま置く）",
  [/const UNNAMED = defaultTranslate\("auth\.devices\.unnamed"\)/.test(actions), jaText("auth.devices.unnamed")],
  [true, "不明なデバイス"],
);
ok("名前は押したときに送られる隠し値", /<input type="hidden" name="name" value=\{computer\} \/>/.test(handoff), true);
ok("パソコン名はターミナルが送る", /query\.set\("name", name\)/.test(cli), true);

// ---------------------------------------------------------------------------
console.log("\n--- 3. 手元の受け口は、合図が合わない届けを捨てる ---");
const VALUE = `spg_${"a".repeat(43)}`;
const body = (fields) => new URLSearchParams(fields).toString();

const good = readHandoff(body({ state: STATE, token: VALUE, email: "owner@example.com" }), STATE);
ok("正しい届けは受け取る", good?.token, VALUE);
ok("誰としてログインしたかも読む", good?.email, "owner@example.com");
ok("合図が違えば捨てる", readHandoff(body({ state: `${STATE}x`, token: VALUE }), STATE), null);
ok("合図が別物なら捨てる", readHandoff(body({ state: "Zz9-_aBcDeFgHiJkL1234567", token: VALUE }), STATE), null);
ok("頭だけ合っていても捨てる", readHandoff(body({ state: STATE.slice(0, 12), token: VALUE }), STATE), null);
ok("合図が無ければ捨てる", readHandoff(body({ token: VALUE }), STATE), null);
ok("合図が空なら捨てる", readHandoff(body({ state: "", token: VALUE }), STATE), null);
ok("待つ側の合図が空でも通さない", readHandoff(body({ state: "", token: VALUE }), ""), null);
ok("形の違う名乗りは捨てる", readHandoff(body({ state: STATE, token: "spg_short" }), STATE), null);
ok("別の印の名乗りは捨てる", readHandoff(body({ state: STATE, token: `ghp_${"a".repeat(43)}` }), STATE), null);
ok("名乗りが無ければ捨てる", readHandoff(body({ state: STATE }), STATE), null);
ok("空の届けは捨てる", readHandoff("", STATE), null);
ok("文字列でない届けは捨てる", readHandoff(null, STATE), null);
ok("大きすぎる届けは捨てる", readHandoff("a".repeat(MAX_HANDOFF_BYTES + 1), STATE), null);
ok("上限は 4096 文字", MAX_HANDOFF_BYTES, 4096);
ok("名乗り以外の場所に値を混ぜても拾わない", readHandoff(body({ state: STATE, token: VALUE, extra: "x" }), STATE)?.token, VALUE);

ok("同じ合図なら合う", sameSecret(STATE, STATE), true);
ok("1 文字違えば合わない", sameSecret(STATE, `${STATE.slice(0, -1)}z`), false);
ok("長さが違えば合わない", sameSecret(STATE, STATE.slice(0, 10)), false);
ok("文字列でなければ合わない", sameSecret(null, STATE), false);
ok("両方とも空なら合う（形の門は別で見る）", sameSecret("", ""), true);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 誰としてログインしたかは、そのまま画面に出さない ---");
ok("改行を落とす", cleanForDisplay("owner@x.co\nエラー: 全部消えました"), "owner@x.co エラー: 全部消えました");
ok("制御文字を落とす", cleanForDisplay("a\u001b[31mb"), "a [31mb");
ok("前後の空白を落とす", cleanForDisplay("  owner@x.co  "), "owner@x.co");
ok("長すぎるものは切る", cleanForDisplay("a".repeat(500)).length, 120);
ok("文字列でなければ空", cleanForDisplay(null), "");

// ---------------------------------------------------------------------------
console.log("\n--- 5. 値を画面・ログ・URL に出さない ---");
ok("ログイン用の URL に載るのは番号・合図・パソコン名だけ", /new URLSearchParams\(\{ port: String\(port\), state \}\)/.test(cli), true);
ok("URL の組み立てに名乗りが入っていない", /cli-login\?[^`]*token/.test(cli), false);
ok("受け取った名乗りを画面に出していない", /console\.(log|error)\([^)]*handoff\.token/.test(cli), false);
ok("控えた値を差し込んで出す書き方が無い", /console\.(log|error)\([^)]*\$\{[^}]*token/i.test(cli), false);
ok("名乗りを出すのは保存のときだけ", (cli.match(/saveCredential\(/g) ?? []).length, 3);
ok("画面側は本文（POST）で渡している", /method="post"/.test(handoff), true);
ok("裏の通信では送らない（許可の問い合わせが出るため）", /fetch\(/.test(handoff), false);
ok("画面側が URL に値を足していない", /action=\{target\}/.test(handoff) && !/\$\{state\.secret\}/.test(handoff), true);
ok("画面側は値を文字として描いていない", /(?<!=)\{state\.secret\}/.test(handoff), false);
ok("画面側は隠しの入力として渡す", /<input type="hidden" name="token" value=\{state\.secret\} \/>/.test(handoff), true);
ok("画面に値を出す節が無い", /font-mono/.test(handoff) || /font-mono/.test(page), false);
ok("ページ側は値をそもそも受け取らない", /secret/.test(page), false);
// 3 か所 = 郵便受けへ置く・クラウドの sent（写す用）・手元の ready。増えたら理由を確かめる
ok("実行係も値を描かない（戻り値で返すだけ）", (actions.match(/issued\.token/g) ?? []).length, 3);
ok("実行係は値を記録に出さない", /console\./.test(actions), false);
ok("実行係は値を cookie に置かない", /cookies\(/.test(actions), false);
ok("ログインの戻り先に値を載せていない", /new URLSearchParams\(\{ port, state: handshake \}\)/.test(page), true);
ok("会社の人かどうかは既存の判定に任せている", /isMember\(viewer\)/.test(page), true);
ok("押したときも会社の人か見直す", /if \(!isMember\(viewer\)\)/.test(actions), true);
ok("自前でドメインを数え直していない", /ALLOWED_DOMAIN|endsWith\("@/.test(page), false);

// ---------------------------------------------------------------------------
console.log("\n--- 5.5 開いただけでは何も起きない（人が 1 回押す門）---");
/**
 * ここが緩むと、会社の人にリンクを踏ませるだけで、踏ませた側のパソコンで
 * 待ち構えて名乗りを受け取れてしまう。その場かぎりの合図（state）は
 * 「届け先が本人か」を何も保証しないので、人が押すことだけが門になる。
 */
ok("開いた画面（GET）は何も用意しない", /issueToken/.test(page), false);
ok("用意するのは実行係の中だけ", /await issueToken\(/.test(actions), true);
ok("実行係はサーバー側の宣言から始まる", /^"use server";$/m.test(await readFile(`${root}/src/app/cli-login/actions.ts`, "utf8")), true);
ok("押して初めて動く（フォームの送信＝POST）", /<form action=\{approve\}>/.test(handoff), true);
ok("待ちの状態は実行係の戻り値で持つ", /useActionState\(approveAction, BEFORE\)/.test(handoff), true);
ok("押す前の状態は「まだ何もしていない」", /const BEFORE: ApproveState = \{ kind: "idle" \}/.test(handoff), true);
ok("用意できたときだけ手元へ送る", /if \(state\.kind !== "ready"\) return;/.test(handoff), true);
ok("送るのは 1 回だけ", /sent\.current = true/.test(handoff), true);
ok("押す前に何が起きるかを書いてある", flatten(withJaText(handoff)).includes("から、あなたの名前で投稿できるようにします。"), true);
ok("心当たりが無い人の逃げ道を書いてある", flatten(withJaText(handoff)).includes("心当たりがなければ、このページを閉じてください。"), true);
ok("ボタンの文字は「許可する」", [/idle=\{t\("auth\.cliLogin\.approve"\)\}/.test(handoff), jaText("auth.cliLogin.approve")], [true, "許可する"]);
ok("押している間はふさがる（同じ送信ボタンを使う）", /<SubmitButton/.test(handoff), true);
ok("届け先の番号は画面に出さない", /(?<!=)\{port\}|(?<!=)\{target\}/.test(page), false);
ok("ターミナルが名乗った名前も画面に出さない", /(?<!=)\{name\}/.test(page), false);

console.log("\n--- 5.6 同じパソコンから入り直したとき ---");
/**
 * 「パソコン 1 台につき 1 本」を一覧の見え方と一致させる。入り直すたびに行が増えると、
 * 1 台ログアウトさせても別の行がまだ通ってしまう。
 */
ok("古いほうを片付ける処理がある", /async function retireOlder\(/.test(actions), true);
ok("片付けるのは押したときだけ", /await retireOlder\(organization, viewer\.email, label, issued\.summary\.id\)/.test(actions), true);
ok("先に新しいものを用意してから片付ける", actions.indexOf("await issueToken(") < actions.indexOf("await retireOlder("), true);
ok("片付ける相手は自分のものだけ", /listTokens\(organization, email\)/.test(actions) && /revokeToken\(organization, one\.id, email\)/.test(actions), true);
ok("いま用意したものは残す", /if \(one\.id === keepId\) continue;/.test(actions), true);
ok("すでに止まっているものは触らない", /if \(one\.revokedAt !== null\) continue;/.test(actions), true);
ok("同じ名前のものだけを片付ける", /if \(one\.label !== label\) continue;/.test(actions), true);
ok("名前が分からないときは巻き添えにしない", /if \(label === UNNAMED\) return;/.test(actions), true);
ok("片付けに失敗しても投稿できる状態は壊さない", /catch \{[\s\S]{0,80}\}\s*\n\s*\}\s*\n\}/.test(actions), true);

console.log("\n--- 5.7 「トークン」という言葉を人に見せない ---");
// 文言は辞書へ移した。鍵を日本語の正本の値に置き換えた写しで、画面に出る字そのものを見る
const shown = [flatten(page), flatten(handoff), flatten(actions)].map(withJaText).join(" ");
ok("画面の文字に出てこない", shown.includes("トークン"), false);
ok("言い換えの発明もしていない（鍵・合言葉）", /投稿の鍵|合言葉|投稿キー|合鍵/.test(shown), false);
ok("「発行」という出来事も出さない", /発行/.test(shown), false);
const rejected = codeOnly(await readFile(`${root}/src/lib/identity/publish-tokens.ts`, "utf8"));
const message = withJaText(/export const TOKEN_REJECTED =[\s\S]*?;/.exec(rejected)?.[0] ?? "");
console.log(`      通らなかったときの案内: ${flatten(message)}`);
ok("通らなかったときの案内にも出てこない", message.includes("トークン"), false);
ok("案内はやることだけ書いてある", message.includes("pages-publish login"), true);
ok("案内は画面へ行かせない（コマンドで直せる）", /トップページ|右上/.test(message), false);

// ---------------------------------------------------------------------------
console.log("\n--- 6. 控えの置き方・待ちの上限・自動で開かない ---");
ok("置き場は ~/.config/<設定フォルダ名>（名前は deployment.json の configDir、既定は surprise-pages-distribution）", configDirFor("/h"), path.join("/h", ".config", "surprise-pages-distribution"));
ok("置き場を決めるのは 1 か所だけ", (cli.match(/function configDirFor/g) ?? []).length, 1);
// 控えを書くのは writePrivate ただ 1 つ（組織ごとの控え credentials.json も、今の形の token も）
const writePrivate = /function writePrivate\(file, text\) \{[\s\S]*?\n\}/.exec(cli)?.[0] ?? "";
ok("フォルダは本人だけ（0o700）", /mkdirSync\(path\.dirname\(file\), \{ recursive: true, mode: 0o700 \}\)/.test(writePrivate), true);
ok("書くときに本人だけ（0o600）", /writeFileSync\(file, [^,]+, \{ mode: 0o600 \}\)/.test(writePrivate), true);
ok("すでにあったファイルも絞り直す", /chmodSync\(file, 0o600\)/.test(writePrivate), true);
ok("控えはどれもその口で書く", /writeFileSync\([^,]*(credential|CREDENTIAL)/.test(cli), false);
ok("待ちに上限がある（3 分）", LOGIN_TIMEOUT_MS, 180000);
ok("上限を過ぎたら諦める", /setTimeout\(\(\) => \{\s*reject\(/.test(cli), true);
ok("待ち終わったら受け口を閉じる", /server\.close\(\)/.test(cli), true);
ok("閉じるのは投稿へ戻る前（finally）", /\} finally \{[\s\S]*server\.close\(\)/.test(cli), true);
ok("届け以外の叩き方は受け取らない", /if \(request\.method !== "POST"\)/.test(cli), true);
ok("中身を他所のページに読ませる返事を出していない", /access-control-allow-origin/i.test(cli), false);

/*
  画面のない実行では、ブラウザを開かずに案内だけ出して終わること。

  **走らせる人のホームを見に行かせない。** 控えがあるかどうかで結果が変わると、
  この検査は「その機械がログイン済みか」に左右される（実際、ログイン済みの機械で
  落ちた）。空のホームを渡して、いつでも同じ答えになるようにする。
*/
const emptyHome = await mkdtemp(path.join(tmpdir(), "pages-check-home-"));
const withHome = (home) => ({
  env: { ...process.env, PAGES_CONFIG_DIR: path.join(home, ".config", "surprise-pages-distribution"), PAGES_TOKEN: "", PAGES_HOST: "127.0.0.1:1", CURSOR_CLOUD: "", CLAUDE_CODE_REMOTE: "" },
});
const asResult = (promise) =>
  promise.then(
    (result) => ({ code: 0, ...result }),
    (error) => ({ code: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" }),
  );

const headless = await asResult(
  run(process.execPath, [`${root}/bin/pages-publish.mjs`, "login"], withHome(emptyHome)),
);
ok("画面が無ければ失敗で終わる", headless.code, 1);
ok("ブラウザを開いた形跡が無い", /ブラウザで Pages を開きます/.test(headless.stdout), false);
ok("やることだけ案内する", /pages-publish login/.test(headless.stderr), true);
ok("案内に値そのものが出ない", /spg_/.test(headless.stdout + headless.stderr), false);
ok("開く前に画面の有無を見ている", cli.indexOf("process.stdin.isTTY") < cli.indexOf("openBrowser(url)"), true);
ok("login は投稿の合図の前に分かれる", /if \(argv\[0\] === "login"\)/.test(cli), true);

/*
  すでに控えがあるなら、login はもう一度ログインしに行かない。
  ここが緩むと、クラウドの作業場で毎回「許可する」を押させることになる。
*/
const loggedInHome = await mkdtemp(path.join(tmpdir(), "pages-check-home-"));
const loggedInFile = credentialFileFor(path.join(loggedInHome, ".config", "surprise-pages-distribution"), "https://127.0.0.1:1");
await mkdir(path.dirname(loggedInFile), { recursive: true });
await writeFile(
  loggedInFile,
  `spg_${"a".repeat(43)}\n`,
);
const already = await asResult(
  run(process.execPath, [`${root}/bin/pages-publish.mjs`, "login"], withHome(loggedInHome)),
);
ok("控えがあれば聞き直さずに終わる", already.code, 0);
ok("そのことを 1 行で言う", /すでにログイン済みです。/.test(already.stdout), true);
ok("そのときブラウザ用の URL を出さない", /cli-login\?/.test(already.stdout), false);
ok("そのときも値そのものは出さない", /spg_/.test(already.stdout + already.stderr), false);

// ---------------------------------------------------------------------------
console.log("--- 11. Windows の WSL でもブラウザを開ける ---");
/*
  WSL は Linux として動くが xdg-open が無いことが多い。wslview → Windows 側の cmd.exe の順に
  試し、尽きたら画面に出した URL を手で開いてもらう。Mac と素の Linux の挙動は変えない。
*/
ok("WSL の名乗り（環境変数）で見分ける", runningInWsl({ WSL_DISTRO_NAME: "Ubuntu" }, () => "", "linux"), true);
ok("WSL の名乗り（カーネル）で見分ける", runningInWsl({}, () => "Linux version 5.15.0-microsoft-standard-WSL2", "linux"), true);
ok("素の Linux は WSL と見なさない", runningInWsl({}, () => "Linux version 6.8.0-generic", "linux"), false);
ok("カーネルの名乗りが読めなくても落ちない", runningInWsl({}, () => { throw Error("no /proc"); }, "linux"), false);
ok("Linux 以外は WSL と見なさない", runningInWsl({ WSL_DISTRO_NAME: "Ubuntu" }, () => "microsoft", "darwin"), false);
ok("WSL では wslview → cmd.exe → xdg-open の順", JSON.stringify(browserCommands("linux", true)), JSON.stringify([["wslview"], ["cmd.exe", "/c", "start", ""], ["xdg-open"]]));
ok("素の Linux は xdg-open だけ", JSON.stringify(browserCommands("linux", false)), JSON.stringify([["xdg-open"]]));
ok("Mac は open", JSON.stringify(browserCommands("darwin", false)), JSON.stringify([["open"]]));
ok("Windows は cmd の start", JSON.stringify(browserCommands("win32", false)), JSON.stringify([["cmd", "/c", "start", ""]]));
ok("開けなくても URL は先に画面へ出している", /開かないときは、次の URL を開いてください/.test(cli), true);

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
process.exitCode = fails === 0 ? 0 : 1;
