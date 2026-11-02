/**
 * 変えたファイルに関係する検査表だけを選ぶ（`pnpm check:changed`）。
 *
 * 関係は毎回、検査表そのものから機械的に出す（手で書く対応表は、検査表を直すたびに古くなる）。
 * 出し方は 3 つを足し合わせる:
 *   1. 検査表（と、それが読み込む scripts/ の部品）の文面に出てくる道筋。ファイルならそのファイル、
 *      フォルダならその下の全部（フォルダを歩いて調べる検査表のため）
 *   2. そこから import でつながるファイル（検査表が組み立て直して動かす src/lib/ や src/widget/ の先）
 *   3. 1 と 2 で出せなかった分の控え（check-inputs.json）。実際の読み取りを見張って作る
 *      （trace-check-inputs.mjs・`pnpm check:inputs`）。リポジトリ全体を歩く検査表は「いつも走らせる」
 *
 * **関係が分からないときは全部走らせる。** 次のどれかなら全部:
 *   - どの検査表にも結び付かないファイルを変えた（道筋を実行時に組み立てて読む検査表は、文面からは分からない）
 *   - 消した・名前を変えたファイルがある（「消えたこと」を見る検査表は文面から分からない）
 *   - 全体に効くファイル（依存の版・検査の番人そのもの）を変えた
 *   - 比べる相手（origin/main）が手元に無い
 * 選ぶのは速さのためだけで、合否の正本は CI の全検査（選ばれなかった検査表を「合格」とは言わない）。
 */
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const CHECKS = "tests/checks";
export const LEDGER = fileURLToPath(new URL("./check-inputs.json", import.meta.url));
/** 変えたら全部走らせるファイル。依存の版と、検査を走らせる番人そのもの。 */
export const GLOBAL_FILES = [
  "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json",
  "scripts/ci/run-checks.mjs", "scripts/ci/check-results.mjs", "scripts/ci/changed-checks.mjs", "scripts/ci/check-inputs.json",
  `${CHECKS}/baseline.json`,
];
const CODE = /\.(?:ts|tsx|mts|mjs|cjs|js|jsx)$/;
const SUFFIXES = ["", ".ts", ".tsx", ".mts", ".mjs", ".js", ".json", "/index.ts", "/index.tsx", "/index.mjs", "/index.js"];
/** 文面から道筋を拾ってよいファイル（検査表とその部品）。src/lib/ などの説明文に出る名前までは追わない。 */
const readsByText = (file) => file.startsWith("scripts/") || file.startsWith("bin/") || file.startsWith("tests/");

/** 追跡中のファイルの一覧から、ファイルとフォルダの集合を作る。 */
export function repoIndex(files) {
  const fileSet = new Set(files);
  const dirs = new Set();
  for (const file of files) {
    let at = path.posix.dirname(file);
    while (at !== "." && !dirs.has(at)) { dirs.add(at); at = path.posix.dirname(at); }
  }
  return { files: fileSet, dirs };
}

/**
 * 文面の 1 かけらを、当たったファイルかフォルダに解く。試すのは 3 通り:
 * 書いてあるとおりの相対（`../production-guard.mjs`）・頭の `./` `../` `/` `@/` を外して根から・同じく `from` のフォルダから。
 */
function resolve(index, token, from) {
  const found = [];
  const raw = token.replace(/\/+$/, "");
  if (!/[A-Za-z0-9]/.test(raw)) return found;
  const bare = raw.replace(/^@\//, "src/").replace(/^(?:\.{0,2}\/)+/, "");
  const here = path.posix.dirname(from);
  const tries = new Set([bare, path.posix.join(here, bare)]);
  if (raw.startsWith(".")) tries.add(path.posix.join(here, raw));
  for (const one of tries) {
    const joined = path.posix.normalize(one);
    if (joined.startsWith("..") || joined === "." || joined === "") continue;
    for (const suffix of SUFFIXES) {
      if (index.files.has(joined + suffix)) { found.push({ file: joined + suffix }); break; }
    }
    if (index.dirs.has(joined)) found.push({ dir: joined });
  }
  return found;
}

/** import / require / 動的 import の行き先（文字で書いてあるものだけ）。 */
export function importTargets(source) {
  const targets = new Set();
  for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'`]([^"'`\n]+)["'`]/g)) targets.add(match[1]);
  return [...targets];
}

/** 文面に出てくる道筋らしい文字の並び。区切りを含むものは全部、含まないものは引用符で囲んだものだけ。 */
export function pathTokens(source) {
  const tokens = new Set();
  for (const pattern of [/[\w@.()[\]-]*(?:\/[\w@.()[\]-]+)+\/?/g, /[\w@.-]*(?:\/[\w@.-]+)+\/?/g]) {
    for (const match of source.matchAll(pattern)) tokens.add(match[0]);
  }
  for (const match of source.matchAll(/["'`]([\w@.()[\]-]+)\/?["'`]/g)) tokens.add(match[1]);
  return [...tokens];
}

const memo = new WeakMap();
/** ファイル 1 つから出る先（検査表をまたいで使い回す）。text は「文面の道筋まで拾うか」。 */
async function edgesOf(file, text, index, read) {
  if (!memo.has(index)) memo.set(index, { edges: new Map(), code: new Map() });
  const { edges } = memo.get(index);
  const key = `${text ? 1 : 0}:${file}`;
  if (edges.has(key)) return edges.get(key);
  const files = new Set(), dirs = new Set();
  if (CODE.test(file)) {
    const source = await read(file);
    for (const token of importTargets(source)) {
      for (const hit of resolve(index, token, file)) { if (hit.file) files.add(hit.file); else dirs.add(hit.dir); }
    }
    for (const token of pathTokens(source)) {
      for (const hit of resolve(index, token, file)) {
        // 部品の外（src/lib/ など）の文面からは、コードでないファイル（実行時に読む雛形や設定）だけ拾う
        if (!text && (hit.dir || CODE.test(hit.file))) continue;
        if (hit.file) files.add(hit.file);
        else dirs.add(hit.dir);
      }
    }
  }
  const result = { files: [...files], dirs: [...dirs] };
  edges.set(key, result);
  return result;
}
function codeUnder(dir, index) {
  const { code } = memo.get(index);
  if (!code.has(dir)) code.set(dir, [...index.files].filter((file) => file.startsWith(`${dir}/`) && CODE.test(file)));
  return code.get(dir);
}

/**
 * 文面の道筋まで拾う範囲（数が大きいほど近い）:
 *   2 … 検査表そのものと、tests/checks/ の部品（paths.mjs など）。ここから出た先も拾う
 *   1 … 検査表や部品が直に名指し・import した scripts/・bin/ の脚本。文面は拾うが、その先は import だけ
 *   0 … それ以外（src/lib/・src/widget/・歩いて見つかるファイル・脚本の先の脚本）。import と、コードでないファイルの名指しだけ
 * 全部の文面を拾うと、脚本から脚本へ名前をたどってほぼ全部が全部に関係してしまう。
 */
function textLevel(parent, child) {
  if (parent < 2 || !readsByText(child)) return 0;
  return child.startsWith(`${CHECKS}/`) && !/\/check-[^/]+\.mjs$/.test(child) ? 2 : 1;
}

/**
 * 検査表 1 枚が関係するファイルとフォルダ。`read(file)` はリポジトリの根からの道筋で中身を返す。
 * フォルダが出てきたら、その下のコードの import も追う（歩いて見つけたファイルを組み立て直す検査表のため）。
 * `trail` を渡すと「どこから来たか」を書き込む（選ばれた理由を調べるとき用）。
 */
export async function checkInputs(check, index, read, trail = null) {
  const level = new Map(), dirs = new Set(), queue = [{ file: `${CHECKS}/${check}`, text: 2 }];
  while (queue.length) {
    const { file, text } = queue.pop();
    if ((level.get(file) ?? -1) >= text) continue;
    level.set(file, text);
    const edges = await edgesOf(file, text > 0, index, read);
    for (const one of edges.files) {
      if (trail && !trail.has(one)) trail.set(one, file);
      queue.push({ file: one, text: textLevel(text, one) });
    }
    for (const dir of edges.dirs) {
      if (dirs.has(dir)) continue;
      dirs.add(dir);
      for (const under of codeUnder(dir, index)) {
        if (trail && !trail.has(under)) trail.set(under, `${dir}/ ← ${file}`);
        queue.push({ file: under, text: 0 });
      }
    }
  }
  return { files: new Set(level.keys()), dirs };
}

export const relates = (inputs, file) =>
  inputs.files.has(file) || [...inputs.dirs].some((dir) => file.startsWith(`${dir}/`));

/**
 * 選ぶ本体（純粋な部分）。`inputs` は検査表の名前 → checkInputs の結果。
 * 返すのは走らせる検査表・理由・変えたファイルごとの内訳。
 */
export function selectChecks({ checks, changed, inputs, index, always = {} }) {
  const all = (reason) => ({ files: checks, reason, details: [] });
  if (changed === null) return all("比べる相手（origin/main か PAGES_CHECK_BASE）が手元に無いので、全部走らせます");
  if (changed.length === 0) return { files: [], reason: "変えたファイルがありません（比べる相手との差・未コミット分とも無し）", details: [] };
  const global = changed.find((file) => GLOBAL_FILES.includes(file));
  if (global) return all(`全体に効くファイルを変えたので、全部走らせます: ${global}`);
  const gone = changed.find((file) => !index.files.has(file));
  if (gone) return all(`消した・名前を変えたファイルがあるので、全部走らせます: ${gone}`);
  // 読む先を文面からは決められない検査表（リポジトリ全体を歩く・git に一覧を聞く）は、何を変えても走らせる
  const chosen = new Set(checks.filter((check) => always[check] !== undefined)), details = [];
  if (chosen.size) details.push(`いつも走らせる検査表（全体を見るもの） ${chosen.size} 枚`);
  for (const file of changed) {
    const related = checks.filter((check) => always[check] === undefined && relates(inputs[check], file));
    if (related.length === 0) return all(`どの検査表に関係するか分からないので、全部走らせます: ${file}`);
    for (const check of related) chosen.add(check);
    details.push(`${file} → ${related.length} 枚`);
  }
  return {
    files: checks.filter((check) => chosen.has(check)),
    reason: `変えたファイル ${changed.length} 個に関係する検査表 ${chosen.size} 枚（全 ${checks.length} 枚）だけ走らせます。合否の正本は CI の全検査です`,
    details,
  };
}

async function git(args) {
  return (await exec("git", args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })).stdout.split("\0").filter(Boolean);
}

/**
 * origin/main から分かれたあとの変更と、未コミット・未追跡の分。比べる相手が無ければ null。
 * 重ねた枝では `PAGES_CHECK_BASE=<親の枝>` で比べる相手を変えられる（`HEAD` なら未コミット分だけ）。
 */
export async function changedFiles(against = process.env.PAGES_CHECK_BASE || "origin/main") {
  try {
    const base = (await exec("git", ["merge-base", against, "HEAD"], { cwd: ROOT })).stdout.trim();
    return [...new Set([
      ...await git(["diff", "--name-only", "-z", base]),
      ...await git(["ls-files", "-z", "--others", "--exclude-standard"]),
    ])].sort();
  } catch {
    return null;
  }
}

/**
 * 文面からは出せなかった読み先の控え（trace-check-inputs.mjs が実際の読み取りを見張って作る）。
 * `always` は何を変えても走らせる検査表、`extra` は検査表ごとの足し分。壊れていたら使わずに落とす。
 */
export function parseLedger(text) {
  const value = JSON.parse(text);
  const plain = (one) => one !== null && typeof one === "object" && !Array.isArray(one);
  if (!plain(value) || !plain(value.always) || !plain(value.extra)) throw new Error("検査表の読み先の控えが正しくありません");
  for (const [check, reason] of Object.entries(value.always)) {
    if (!/^check-.+\.mjs$/.test(check) || typeof reason !== "string" || !reason) throw new Error("検査表の読み先の控えが正しくありません");
  }
  for (const [check, paths] of Object.entries(value.extra)) {
    if (!/^check-.+\.mjs$/.test(check) || !Array.isArray(paths) || paths.some((one) => typeof one !== "string" || !one)) throw new Error("検査表の読み先の控えが正しくありません");
  }
  return value;
}

/** 控えの足し分を、文面から出した分に重ねる。いまは無い道筋は捨てる（消えたファイルは「全部走らせる」側で拾う）。 */
export function withLedger(inputs, extra, index) {
  for (const one of extra ?? []) {
    if (index.files.has(one)) inputs.files.add(one);
    else if (index.dirs.has(one)) inputs.dirs.add(one);
  }
  return inputs;
}

export async function repoState() {
  const index = repoIndex(await git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"]));
  // 追跡中でも手元で消してあるファイルは「無い」として扱う（読めないものを関係の材料にしない）
  for (const file of await git(["ls-files", "-z", "--deleted"])) index.files.delete(file);
  const cache = new Map();
  const read = (file) => {
    if (!cache.has(file)) cache.set(file, readFile(path.join(ROOT, file), "utf8").catch(() => ""));
    return cache.get(file);
  };
  return { index, read };
}

export async function changedSelection(checks) {
  const { index, read } = await repoState();
  const ledger = parseLedger(await readFile(LEDGER, "utf8"));
  const inputs = {};
  for (const check of checks) inputs[check] = withLedger(await checkInputs(check, index, read), ledger.extra[check], index);
  return selectChecks({ checks, changed: await changedFiles(), inputs, index, always: ledger.always });
}
