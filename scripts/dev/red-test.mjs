#!/usr/bin/env node
/**
 * 不具合の直しで「落ちるテストを先に見せた」を控える道具（AGENTS.md「不具合の直し方」）。
 *
 *   node scripts/dev/red-test.mjs -- <テストのコマンド>        落ちたら控える（通ってしまったら控えない）
 *   node scripts/dev/red-test.mjs --cannot-reproduce "<理由>"  再現できない不具合。理由を控える
 *   node scripts/dev/red-test.mjs start                        この枝で直しを始める（枝の名前が fix/ でないとき）
 *   node scripts/dev/red-test.mjs status | clear               いまの控えを見る・消す
 *
 * 控えは git の置き場の中（作業場ごと・枝ごと）に置くので、作業ツリーにも PR にも出ない。
 * 読むのは書き込みの直前のフック（scripts/dev/red-test-gate.mjs）。これは手順を飛ばさないための歯止めで、
 * 証明ではない。PR に残る証拠は本文の「先に落ちたテスト」で、そちらは PR の検査が見る。
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

/** 控えの置き場と、いまの枝。git の管理の外なら null。 */
export function locate(cwd) {
  try {
    return { file: path.join(git(cwd, "rev-parse", "--absolute-git-dir"), "pages-red-test.json"), branch: git(cwd, "branch", "--show-current"), top: git(cwd, "rev-parse", "--show-toplevel") };
  } catch {
    return null;
  }
}

/** いまの枝の控え。無い・壊れている・別の枝のものなら null。 */
export function readState(place) {
  try {
    const state = JSON.parse(readFileSync(place.file, "utf8"));
    return state && state.branch === place.branch ? state : null;
  } catch {
    return null;
  }
}

/** 落ちるのを見せたか、再現できない理由を書いたか。 */
export const hasProof = (state) => Boolean(state?.red?.command || state?.cannotReproduce?.reason);

function main(args) {
  const place = locate(process.cwd());
  if (!place) return fail("git の作業場の中で実行してください");
  const save = (state) => writeFileSync(place.file, `${JSON.stringify({ branch: place.branch, ...state }, null, 1)}\n`);
  const now = new Date().toISOString();
  const [first] = args;

  if (first === "start") {
    save({ ...readState(place), startedAt: now });
    console.log(`直しを始めました（枝: ${place.branch}）。落ちるテストを見せるまで、直しのコードは書けません。`);
    console.log("順番: ① ログと記録を見る ② 事実と推測を分けて書く ③ 落ちるテストを書いて `node scripts/dev/red-test.mjs -- <コマンド>` ④ 直す ⑤ 同じテストが通る");
    return 0;
  }
  if (first === "clear") {
    rmSync(place.file, { force: true });
    console.log("控えを消しました");
    return 0;
  }
  if (first === "status" || first === undefined) {
    const state = readState(place);
    if (state?.red) console.log(`落ちるのを見た: ${state.red.command}（終了コード ${state.red.exit}・${state.red.at}）`);
    else if (state?.cannotReproduce) console.log(`再現できない理由: ${state.cannotReproduce.reason}（${state.cannotReproduce.at}）`);
    else console.log(state ? "直しを始めたが、まだ落ちるテストを見せていない" : "この枝に控えはありません");
    return 0;
  }
  if (first === "--cannot-reproduce") {
    const reason = String(args[1] ?? "").trim();
    if (reason.length < 5) return fail("再現できない理由を書いてください（例: --cannot-reproduce \"保管庫側の一時的な障害で、手元で起こせない\"）");
    save({ ...readState(place), cannotReproduce: { reason, at: now } });
    console.log("再現できない理由を控えました。PR の本文の「再現」に、次の 2 行を書いてください:");
    console.log(`再現できない理由: ${reason}\n代わりに見た記録: （何を見て直したと判断したか）`);
    return 0;
  }
  if (first === "--") {
    const command = args.slice(1);
    if (!command.length) return fail("テストのコマンドを渡してください（例: -- node tests/checks/check-comments.mjs）");
    const result = spawnSync(command[0], command.slice(1), { cwd: process.cwd(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    process.stdout.write(output);
    if (result.error) return fail(`コマンドを実行できませんでした: ${result.error.message}`);
    if (result.status === 0) {
      console.error("\nテストは落ちませんでした。直す前に通るテストは、不具合を再現していません。落ちる形に書き直してください。");
      return 1;
    }
    const tail = output.trim().split("\n").slice(-15).join("\n");
    save({ ...readState(place), red: { command: command.join(" "), exit: result.status, at: now, tail } });
    console.log(`\n落ちるのを確かめました（終了コード ${result.status}）。直しのコードを書けます。`);
    console.log(`PR の本文の「先に落ちたテスト」に写す: \`${command.join(" ")}\` と、上の落ち方。直した後に同じコマンドが通ることも確かめて書く。`);
    return 0;
  }
  return fail("使い方: red-test.mjs -- <テストのコマンド> | --cannot-reproduce \"<理由>\" | start | status | clear");
}
function fail(message) {
  console.error(message);
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) process.exitCode = main(process.argv.slice(2));
