#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pageAgentTarget } from "./pages-publish.mjs";
/* 投稿コマンドと同じ控えで投稿先を決め、その投稿先を登録する。 */
let target;
try {
  target = pageAgentTarget();
} catch (error) {
  console.error(`エラー: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
const origin = target.origin;
const connection = [`PAGES_HOST=${origin}`];
const response = await fetch(`${origin}/api/pages/agent`, {
  redirect: "error",
  signal: AbortSignal.timeout(10000),
});
const capabilities = await response.json();
if (!response.ok || capabilities.protocol !== 1 || !capabilities.enabled)
  throw new Error(
    "接続先の更新がまだ完了していません。サーバーを更新してから導入してください。",
  );
const entry =
  process.env.PAGES_AGENT_ENTRY ??
  fileURLToPath(new URL("./pages-agent.mjs", import.meta.url));
const commands = [
  [
    "codex",
    [
      "mcp",
      "add",
      "surprise-pages",
      "--env",
      ...connection,
      "--",
      process.execPath,
      entry,
    ],
  ],
  [
    "claude",
    [
      "mcp",
      "add",
      "--scope",
      "user",
      "--transport",
      "stdio",
      "surprise-pages",
      "--env",
      ...connection,
      "--",
      process.execPath,
      entry,
    ],
  ],
];
if (process.argv.includes("--check")) {
  console.log(
    "接続先は対応済みです。CodexとClaude Codeへ共通の接続を登録できます。",
  );
  process.exit(0);
}
let codexRegistered = false;
for (const [command, args] of commands) {
  if (command === "claude")
    spawnSync(command, ["mcp", "remove", "--scope", "user", "surprise-pages"], {
      stdio: "ignore",
    });
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error?.code === "ENOENT") {
    console.log(`${command} は未導入のため登録していません。`);
    continue;
  }
  if (command === "codex" && result.status === 0) codexRegistered = true;
  if (result.status !== 0)
    throw new Error(
      `${command} の接続登録を完了できませんでした。既存の設定を確認してください。`,
    );
}
const configPath = join(
  process.env.CODEX_HOME ?? join(homedir(), ".codex"),
  "config.toml",
);
try {
  let config = await readFile(configPath, "utf8");
  const header = "[mcp_servers.surprise-pages]";
  const at = config.indexOf(header);
  if (codexRegistered && at >= 0) {
    const end = config.indexOf("\n[", at + header.length),
      tail = end < 0 ? config.length : end;
    let block = config.slice(at, tail);
    const policy = 'default_tools_approval_mode = "approve"';
    block = /^default_tools_approval_mode\s*=.*$/m.test(block)
      ? block.replace(/^default_tools_approval_mode\s*=.*$/m, policy)
      : block + "\n" + policy + "\n";
    if (!/^startup_timeout_sec\s*=/m.test(block))
      block += "startup_timeout_sec = 120\n";
    config = config.slice(0, at) + block + config.slice(tail);
    await writeFile(configPath, config, { mode: 0o600 });
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
console.log(
  "接続を登録しました。初回だけ既存の投稿コマンドでログインし、新しい会話でページのリンクを渡してください。",
);
