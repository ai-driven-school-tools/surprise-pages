// 乱数の鍵 2 つ（ログイン用 AUTH_SECRET・日次の片付け用 CRON_SECRET）を作り、画面に出さずに .env.setup へ追記する。
// 既に同じ名前の行があれば足さない（鍵を黙って作り直さない）。
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendEnvEntries, SETUP_ENV_FILE } from "./database.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function main() {
  await appendEnvEntries(path.join(root, SETUP_ENV_FILE), {
    AUTH_SECRET: randomBytes(32).toString("hex"),
    CRON_SECRET: randomBytes(32).toString("hex"),
  });
  console.log(`2 つの鍵を ${SETUP_ENV_FILE} に追記しました。`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "鍵を保存できませんでした"); process.exitCode = 1; });
