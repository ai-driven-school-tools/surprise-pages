/**
 * 環境変数の一覧（src/lib/settings/environment.json）を脚本から読む口。
 * 配布版の .env.example も、設置の診断が見る必須の一覧も、ここから作る。手で書き写さない。
 */
import { readFileSync } from "node:fs";

const catalog = JSON.parse(readFileSync(new URL("../../src/lib/settings/environment.json", import.meta.url), "utf8"));

export const ENVIRONMENT = catalog.variables;

/** 配布版の設置で本人が入れるもの（手元の確認用と、Vercel が入れるものは除く）。 */
export function personalVariables() {
  return ENVIRONMENT.filter((one) => one.scope === "both" || one.scope === "personal");
}

export function requiredPersonalVariables() {
  return personalVariables().filter((one) => one.required).map((one) => one.name);
}

export function personalEnvironmentExample() {
  const lines = ["# 自分のサイトの設定。値は Vercel の Environment Variables に入れる（手元の確認では .env.local）。", "# この一覧は src/lib/settings/environment.json から作っている。", ""];
  for (const one of personalVariables()) {
    lines.push(`# ${one.purpose}${one.required ? "" : "（任意）"}`);
    lines.push(`${one.name}=${one.example ?? ""}`);
  }
  return `${lines.join("\n")}\n`;
}
