/**
 * クラウドの作業場から投稿する道（login --remote・投稿コマンドを配る受け口）が崩れていないかを見る。
 * 作業場を立ち上げる脚本（Cursor のクラウドエージェントの起動の設定）は、この版には入っていない。
 *
 * 手元のパソコンと違うのは 3 点で、どれも「気づきにくい壊れ方」をする。
 *
 *   1. 環境変数が届かない。起動脚本（start）で立てた変数は、その脚本の中でしか
 *      生きていない。あとからエージェントが開く貝殻には渡らない。だから
 *      「ここはクラウド」の合図はディスクの印で渡す。置く役と読む役が別の
 *      ファイルなので、名前がずれた瞬間に黙って手元の作りに戻る
 *   2. 作り置き（スナップショット）は共有されうる。人の名乗りを焼き込んだら、
 *      別の人の作業場にその名乗りが載る
 *   3. 作業場はいつも専用の枝にいて、直しかけのファイルを抱えている。古さの
 *      関門をそのまま通すと、古くもないのに投稿だけが止まる
 *
 * 保管庫にも通信にもつながない。置いてあるファイルを読んで確かめるだけ。
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { root } from "./paths.mjs";
import { withJaText } from "./i18n-ja-text.mjs";


let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

const read = async (relative) => {
  try {
    return await readFile(`${root}/${relative}`, "utf8");
  } catch {
    return "";
  }
};

const cli = await read("bin/pages-publish.mjs");

// ---------------------------------------------------------------------------
console.log("\n--- 6. クラウドから投稿できる道が残っているか ---");
ok("人が開く URL を出すやり方がある", cli.includes("login --remote"), true);
ok("クラウドでは名乗りが無くてもその道へ行く", /if \(runningInCloud\(\)\) \{\n\s*console\.log\("このクラウド環境は、まだログインしていません。"\);/.test(cli), true);
ok("印の在り処を人に見せる文には出さない", /LOGIN_HELP[\s\S]{0,400}\.config\/surprise-pages\/cloud/.test(cli), false);

// ---------------------------------------------------------------------------
console.log("\n--- 7. 投稿コマンドを配る受け口 ---");
/*
  クラウドの作業場は、非公開の置き場（GitHub）へ届かないことがある。届かないと
  投稿コマンドが無く、投稿コマンドが無いと名乗りも作れない（作れる道具がそれだけ）。
  この受け口はその輪を切るためのもので、合図（ログイン）を求めない。

  求めない代わりに守る線が 2 つある。配る名前を増やさないことと、配る現物に
  鍵が入っていないこと。どちらかが崩れたら、ここは「設定でも鍵でも読み出せる窓口」になる。
*/
const cliRoute = await read("src/app/cli/[name]/route.ts");
ok("受け口がある", cliRoute.length > 0, true);

const served = [...cliRoute.matchAll(/"(bin\/[a-z.-]+)"/g)].map((found) => found[1]);
ok("配るのは 2 本だけ", served.length, 2);
ok("投稿コマンド本体を配る", served.includes("bin/pages-publish"), true);
ok("その中身も配る", served.includes("bin/pages-publish.mjs"), true);
for (const one of served) {
  ok(`配る現物が実在する（${one}）`, existsSync(`${root}/${one}`), true);
}

/*
  要求された名前をそのまま道筋にしない。ここが崩れると、上の階層のファイル
  （設定・鍵）まで同じ受け口から出ていく。
*/
ok("一覧に載っている名前だけを配る", /CLI_FILES\[name\]/.test(cliRoute), true);
ok("要求された文字を道筋に混ぜない", /path\.join\([^)]*name[^)]*\)/.test(cliRoute), false);
ok("見つからなければ 404", /status: 404/.test(cliRoute), true);
ok("ログインを求めない（求めると同じ輪に戻る）", /auth\(\)|requireMember|isMember/.test(cliRoute), false);
ok("配信に載せてよい持たせ方", /public, max-age=\d+/.test(cliRoute), true);

/*
  配る現物に鍵が無いこと。ここが崩れたら受け口ごと閉じる話になる。
*/
for (const one of served) {
  const body = await read(one);
  const leaked = /(SUPABASE_[A-Z_]*KEY|BLOB_READ_WRITE_TOKEN|SLACK_[A-Z_]*TOKEN|AUTH_SECRET|GOOGLE_CLIENT_SECRET)\s*[:=]/.test(body);
  ok(`鍵が入っていない（${one.replace("bin/", "")}）`, leaked, false);
}

const includes = await read("next.config.ts");
ok("デプロイに同梱してある", includes.includes('"./bin/*"'), true);

// ---------------------------------------------------------------------------
console.log("\n--- 8. 別の席のぶんを、このパソコンから作る ---");
/*
  クラウドの作業場に投稿コマンドが無い人のために、持っている人が 1 つ作って渡せる。
  渡し方は本人が許可の画面で「コピー」して自分の Secrets に貼る形だけ。
  ここで大事なのは、作ったものをこのパソコンの控えに書き込まないこと——
  書き込むと、いま使えている名乗りが行方不明になる。
*/
ok("指定がある", cli.includes('arg === "--new"'), true);
ok("すでにログイン済みでも作れる", /if \(!forAnother && alreadyLoggedIn\(target\)\)/.test(cli), true);
ok("手元のログインには使わせない", cli.includes("--new は --remote と一緒に使ってください"), true);
ok("作ったものを手元の控えに書かない", /runRemoteLogin\(\{ claim: !forAnother, target \}\)/.test(cli), true);
ok("受け取らないときは待たない", /if \(!claim\) \{/.test(cli), true);
ok("貼り先の名前を伝える", cli.includes("PAGES_TOKEN という名前で貼り付けて"), true);
ok("値そのものは出さない", /console\.log\([^)]*parsed\.token|console\.log\([^)]*handoff\.token/.test(cli), false);

const device = await read("src/app/devices/add-device.tsx");
ok("画面にも導線がある", device.includes("login --remote --new"), true);
ok("共有の置き場に入れないよう言う", withJaText(device).includes("共有の Secrets には入れないでください"), true);

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
