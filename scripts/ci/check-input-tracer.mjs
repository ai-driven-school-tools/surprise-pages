/**
 * 検査表が実際に読んだファイルを書き留める（trace-check-inputs.mjs が `node --import` で差し込む）。
 * 読むだけの見張りで、読み書きの結果は変えない。ふだんの `pnpm check` と CI では使わない。
 */
import fs from "node:fs";
import childProcess from "node:child_process";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const out = process.env.PAGES_CHECK_TRACE;
if (out) {
  const append = fs.appendFileSync.bind(fs);
  const seen = new Set();
  const note = (kind, value) => {
    try {
      if (value instanceof URL) value = fileURLToPath(value);
      if (typeof value !== "string") return;
      const line = `${kind}\t${kind === "run" ? path.basename(value.trim().split(/\s+/)[0]) : path.resolve(value)}`;
      if (seen.has(line)) return;
      seen.add(line);
      append(out, `${line}\n`);
    } catch { /* 見張りの失敗で検査表を落とさない */ }
  };
  const wrap = (target, name, kind) => {
    const original = target[name];
    if (typeof original !== "function") return;
    target[name] = function traced(first, ...rest) { note(kind, first); return original.call(this, first, ...rest); };
    // execFile と exec は promisify 用の専用の形を持つ。写さないと `const {stdout} = await exec(...)` が壊れる
    const custom = original[promisify.custom];
    if (custom) target[name][promisify.custom] = (first, ...rest) => { note(kind, first); return custom(first, ...rest); };
  };
  for (const name of ["readFileSync", "readFile", "openSync", "open", "createReadStream", "copyFileSync", "copyFile", "readdirSync", "readdir", "opendirSync", "opendir", "cpSync", "cp"]) wrap(fs, name, "read");
  for (const name of ["readFile", "open", "copyFile", "readdir", "opendir", "cp"]) wrap(fs.promises, name, "read");
  for (const name of ["spawn", "spawnSync", "execFile", "execFileSync", "exec", "execSync"]) wrap(childProcess, name, "run");
  syncBuiltinESMExports();
}
