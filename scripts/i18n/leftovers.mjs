/**
 * まだ辞書へ移していない行を出す（docs/guides/i18n.md の「画面を移す手順」）。
 *   node scripts/i18n/leftovers.mjs            … 全部の件数を置き場所ごとに
 *   node scripts/i18n/leftovers.mjs src/widget/deck/deck … その置き場所の行を全部
 *   node scripts/i18n/leftovers.mjs --organization [置き場所] … 「会社」「社内」「社外」「example」が残っている行
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { scanNet, scanOrganizationWords } from "./net.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const organization = process.argv[2] === "--organization";
const prefix = organization ? process.argv[3] : process.argv[2];
const { leftovers } = organization ? scanOrganizationWords(root) : scanNet(root);
if (prefix) {
  for (const at of leftovers.filter((place) => place.startsWith(prefix))) {
    const [file, line] = at.split(":");
    process.stdout.write(`${at}\t${readFileSync(`${root}/${file}`, "utf8").split("\n")[Number(line) - 1].trim()}\n`);
  }
} else {
  const counts = new Map();
  for (const at of leftovers) {
    const file = at.split(":")[0];
    counts.set(file, (counts.get(file) ?? 0) + 1);
  }
  for (const [file, count] of [...counts].sort((a, b) => b[1] - a[1])) process.stdout.write(`${String(count).padStart(5)} ${file}\n`);
  process.stdout.write(`合計 ${leftovers.length} 行\n`);
}
