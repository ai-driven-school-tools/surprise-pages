/**
 * `pnpm check:changed` の選び方を、実際の読み取りと突き合わせる。
 *
 * 検査表を 1 枚ずつ、読んだファイルを書き留める見張り（check-input-tracer.mjs）付きで走らせ、
 * 文面から出した読み先（changed-checks.mjs）に入っていないものを控え（check-inputs.json）と比べる。
 *
 *   node scripts/ci/trace-check-inputs.mjs            … 控えに足りない読み先があれば失敗（何も書かない）
 *   node scripts/ci/trace-check-inputs.mjs --update   … 控えを取り直す（pnpm check:inputs）
 *
 * 検査表を足した・読む先を変えたときに取り直す。取り直し忘れても CI の全検査は変わらない
 * （控えが古いと困るのは手元の「変えた分だけ」だけ。その検査表自身を変えたときは必ず走る）。
 * 見張れるのは Node の読み取りだけ。組み立ての道具（esbuild）が自分で読む分は、文面と import から出している。
 */
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { checkInputs, LEDGER, parseLedger, relates, repoState, withLedger } from "./changed-checks.mjs";
import { runPool } from "./check-results.mjs";

const exec = promisify(execFile);
const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const TRACER = fileURLToPath(new URL("./check-input-tracer.mjs", import.meta.url));

/** 見張りの記録（1 行に「種類 タブ 道筋」）を、リポジトリの中の読み先と、呼んだ道具に分ける。 */
export function readTrace(text, root) {
  const reads = new Set(), runs = new Set();
  let wholeRepo = false;
  for (const line of text.split("\n")) {
    const [kind, value] = line.split("\t");
    if (kind === "run") runs.add(value);
    if (kind !== "read") continue;
    if (value === root) wholeRepo = true;
    else if (value.startsWith(`${root}/`)) reads.add(value.slice(root.length + 1));
  }
  return { reads: [...reads], runs: [...runs], wholeRepo };
}

/**
 * 文面から出した分に入っていない読み先。フォルダが入れば、その下は書かない。
 * 追跡していないもの（組み立ての出力・依存）は数えない——変えたファイルの一覧に出てこない。
 */
export function uncovered(reads, inputs, index) {
  const tracked = reads.filter((one) => index.files.has(one) || index.dirs.has(one));
  const dirs = tracked.filter((one) => index.dirs.has(one) && !inputs.dirs.has(one) && ![...inputs.dirs].some((dir) => one.startsWith(`${dir}/`)));
  const top = dirs.filter((one) => !dirs.some((other) => other !== one && one.startsWith(`${other}/`)));
  const files = tracked.filter((one) => index.files.has(one) && !relates(inputs, one) && !top.some((dir) => one.startsWith(`${dir}/`)));
  return [...top, ...files].sort();
}

/** 何を変えても走らせる理由。読み先を文面から決められない検査表。無ければ null。 */
export function alwaysReason({ runs, wholeRepo }) {
  if (wholeRepo) return "リポジトリ全体を歩く";
  if (runs.includes("git")) return "git に一覧や履歴を聞く";
  return null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--update")) throw Error("引数が正しくありません");
  const updating = args.includes("--update");
  const checks = (await readdir(`${ROOT}/tests/checks`)).filter((name) => /^check-.+\.mjs$/.test(name)).sort();
  const { index, read } = await repoState();
  const ledger = parseLedger(await readFile(LEDGER, "utf8"));
  const temp = await mkdtemp(path.join(tmpdir(), "pages-check-trace-"));
  const next = { always: {}, extra: {} }, problems = [];
  try {
    await runPool(checks, 4, async (check) => {
      const out = path.join(temp, `${check}.txt`);
      await writeFile(out, "");
      const env = { ...process.env, PAGES_CHECK_TRACE: out, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${TRACER}`.trim() };
      try {
        await exec("node", [`${ROOT}/tests/checks/${check}`], { cwd: ROOT, env, maxBuffer: 64 * 1024 * 1024, timeout: 300000 });
      } catch {
        problems.push(`${check}: 見張り付きで走らせたら落ちた（先に pnpm check を通す）`);
        return;
      }
      const trace = readTrace(await readFile(out, "utf8"), ROOT);
      const reason = alwaysReason(trace);
      if (reason) { next.always[check] = reason; return; }
      const found = uncovered(trace.reads, await checkInputs(check, index, read), index);
      if (found.length) next.extra[check] = found;
    });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
  const sorted = (rows) => Object.fromEntries(Object.entries(rows).sort(([a], [b]) => a.localeCompare(b)));
  next.always = sorted(next.always); next.extra = sorted(next.extra);
  for (const check of checks) {
    if (next.always[check] && !ledger.always[check]) problems.push(`${check}: いつも走らせる検査表なのに、控えに無い（${next.always[check]}）`);
    if (ledger.always[check] || !next.extra[check]) continue;
    const known = withLedger({ files: new Set(), dirs: new Set() }, ledger.extra[check], index);
    const lacking = next.extra[check].filter((one) => !known.dirs.has(one) && !relates(known, one));
    if (lacking.length) problems.push(`${check}: 控えに無い読み先 ${lacking.join("、")}`);
  }
  const failed = problems.some((line) => line.includes("落ちた"));
  if (updating && !failed) {
    await writeFile(LEDGER, `${JSON.stringify(next, null, 1)}\n`);
    console.log(`検査表の読み先の控えを取り直した（いつも走らせる ${Object.keys(next.always).length} 枚・足し分のある検査表 ${Object.keys(next.extra).length} 枚）`);
    process.exit(0);
  }
  for (const line of problems) console.error(line);
  if (problems.length) console.error("\n控えを取り直す: pnpm check:inputs");
  else console.log(`検査表 ${checks.length} 枚の読み先は、文面と控えで全部たどれる`);
  process.exit(problems.length ? 1 : 0);
}
