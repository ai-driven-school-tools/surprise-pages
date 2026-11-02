/**
 * スキルに同梱した Python の試験（.claude/skills の下）を、検査表の一枚として走らせる。
 *
 * 起きたこと: 清書の試験は CI で走っておらず、社内版の前提（プレビュー用の名乗り・SURPRISE_PAGES_DIR での差し替え）の
 * まま古びて落ちていた。そのあいだに、クラウドの席の鍵（PAGES_TOKEN）を清書が読まず、投稿は通るのに保存の照合で
 * 空の鍵を送って止まる不具合が入り込んでいた（2026-10-14）。
 *
 * ここで見ること: 各スキルの試験が全部通る。Python 3 の標準ライブラリだけで動く（部品は入れない）。
 */
import { spawnSync } from "node:child_process";
import { root } from "./paths.mjs";

const skills = `${root}/.claude/skills`;
let failures = 0;
function suite(label, cwd, args) {
  const done = spawnSync("python3", args, { cwd, encoding: "utf8", env: { ...process.env, PAGES_NO_UPDATE_CHECK: "1" } });
  if (done.status === 0) console.log(`OK  ${label}`);
  else {
    failures++;
    const tail = `${done.stdout ?? ""}${done.stderr ?? ""}`.trim().split("\n").slice(-8).join("\n    ");
    console.log(`NG  ${label}: 終了コード ${done.status}\n    ${tail}`);
  }
}

console.log("--- 清書（clean-copy） ---");
suite("単体の試験が全部通る", `${skills}/clean-copy/scripts`, ["-m", "unittest", "discover", "-s", "tests"]);
suite("変換の見本と一気通貫が全部通る", `${skills}/clean-copy/scripts`, ["run.py", "test-fixtures"]);

console.log("--- スライド（explain-deck） ---");
suite("単体の試験が全部通る", `${skills}/explain-deck/scripts`, ["-m", "unittest", "discover", "-s", "tests"]);

console.log("--- ページを読む（read-page） ---");
suite("自己点検が全部通る", `${skills}/read-page/scripts`, ["run.py", "--self-test"]);

console.log(`\n${failures === 0 ? "すべて合格" : `${failures} 件 不合格`}`);
if (failures > 0) process.exitCode = 1;
