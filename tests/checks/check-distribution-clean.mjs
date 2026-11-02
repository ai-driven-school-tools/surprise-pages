/**
 * 配る前の番人。社内の宛先・社内のリポジトリ・社内の課題番号・社名が、配布物のファイルに 1 件でも残っていたら落ちる。
 *
 * 配布の絶対条件「コードと画面に社内のドメイン・人名・メールアドレス・社名が残らない（提供元としての表記は README と
 * LICENSE だけ）」を、人の目ではなく検査で見張る。見るのは git が追跡しているファイル全部（部品の置き場 vendor/・
 * 依存の固定・画像などの二進のファイルは除く）。許す場所は社名だけで、README.md と LICENSE。増やす方向には変えない。
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { root } from "./paths.mjs";

const SKIP = /^(vendor\/|public\/|pnpm-lock\.yaml$|src\/lib\/deck\/design\/library\.generated\.json$|tests\/checks\/check-distribution-clean\.mjs$)|\.(png|jpe?g|gif|webp|woff2?|ttf|otf|ico|pdf|mp4|zip|gz|crt|pem)$/;
const RULES = [
  { label: "社内の宛先（surpriselife）が無い", pattern: /surpriselife/i, allow: [] },
  { label: "社内のリポジトリ（makonari）が無い", pattern: /makonari/i, allow: [] },
  { label: "社内の課題番号（PAGES-nnn）が無い", pattern: /\bPAGES-\d+\b/, allow: [] },
  { label: "社内の保存先の宛先（supabase.co）が無い", pattern: /\bsupabase\.co\b/, allow: [] },
  { label: "社名（Surprise・サプライズ）は README と LICENSE にだけ", pattern: /Surprise|サプライズ/, allow: ["README.md", "LICENSE"] },
  { label: "社員の名前・アドレスが無い", pattern: /\bmako@|\bhayato\.|oouti|真子|マコなり/i, allow: [] },
];

// -z で区切る（日本語の名前のファイルは引用符付きで出てきて、そのままでは読めない）
const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter((file) => file.length > 0 && !SKIP.test(file));
const texts = new Map();
for (const file of files) {
  try {
    const body = readFileSync(`${root}/${file}`);
    if (body.includes(0)) continue; // 二進のファイル
    texts.set(file, body.toString("utf8"));
  } catch {
    // 消したばかりのファイル（追跡はまだ）は見ない
  }
}

console.log(`--- 配る前の番人（${texts.size} ファイル）---`);
let failures = 0;
for (const rule of RULES) {
  const hits = [];
  for (const [file, text] of texts) {
    if (rule.allow.includes(file)) continue;
    const lines = text.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      if (rule.pattern.test(lines[index])) hits.push(`${file}:${index + 1}`);
    }
  }
  if (hits.length === 0) console.log(`OK   ${rule.label}`);
  else {
    failures += 1;
    console.log(`NG   ${rule.label}: ${hits.length} 件\n${hits.slice(0, 20).map((hit) => `         ${hit}`).join("\n")}${hits.length > 20 ? `\n         …ほか ${hits.length - 20} 件` : ""}`);
  }
}
console.log(`\n${failures === 0 ? "すべて合格" : `${failures} 件 不合格`}`);
if (failures > 0) process.exitCode = 1;
