/**
 * 手順書と CI の記録に、秘密の値（鍵・入場券・接続の合言葉）が書かれていないかを見る。
 *
 *   node scripts/ci/scan-secrets.mjs                 手順書（docs/・直下の *.md・.github/）を見る
 *   node scripts/ci/scan-secrets.mjs --run <番号>    GitHub Actions の実行 1 回ぶんの記録を取り寄せて見る（gh が要る）
 *
 * 見つけても**値は画面に出さない**。出すのはファイルと行（記録なら仕事の名前と行）と、どの形に当たったかだけ。
 * 見る形は「値の形が決まっている秘密」だけ（アプリの鍵 spa_・投稿の鍵 spg_・入場券 vt1.・画像置き場の鍵・
 * Supabase の鍵・Slack / GitHub / AI の鍵・秘密鍵・合言葉入りの接続 URL・JWT・壁の鍵の見出しに付いた値）。
 * 取り決めの見本（`spa_ExampleExample…` のように Example を繰り返しただけの字）は秘密ではないので数えない。
 * 検査表 tests/checks/check-secret-scan.mjs が手順書を毎回見る。
 */
import {execFile} from 'node:child_process';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import {fileURLToPath, pathToFileURL} from 'node:url';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));

/** 名前 → 形。値の形が決まっているものだけ（長さの下限は本物の値の長さに合わせ、見本の短い字は拾わない）。 */
export const SECRET_PATTERNS = {
  'アプリ・投稿の鍵（spa_ / spg_）': /\bsp[ag]_[A-Za-z0-9_-]{40,}/g,
  '本文の入場券（vt1.）': /\bvt1\.[A-Za-z0-9_-]{40,}/g,
  '画像置き場の鍵（vercel_blob_rw_）': /\bvercel_blob_rw_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/g,
  'Supabase の鍵（sb_secret_）': /\bsb_secret_[A-Za-z0-9_-]{16,}/g,
  'Slack の鍵（xox?-）': /\bxox[abprs]-\d{6,}-[A-Za-z0-9-]{10,}/g,
  'GitHub の鍵': /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/g,
  'AI の鍵（sk-）': /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}/g,
  '秘密鍵': /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  '合言葉入りの接続 URL': /\b(?:postgres(?:ql)?|mysql|redis):\/\/[^\s:@/'"`]+:[^\s@/'"`<>{}$]{8,}@/g,
  'JWT（Supabase の旧鍵など）': /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  '壁の鍵・共有の cookie の値': /(?:x-vercel-protection-bypass|_vercel_jwt|_vercel_share)["']?\s*[:=]\s*["']?[A-Za-z0-9._-]{16,}/gi,
};

/** 見本の字（Example を繰り返しただけ）。取り決めの examples に置いてある。 */
const PLACEHOLDER = /^(?:sp[ag]_|vt1\.)(?:Example)+(?:E(?:x(?:a(?:m(?:p(?:le?)?)?)?)?)?)?$/;

/** 文字列の中の秘密の形を探す。返すのは行の番号と形の名前だけ（値は返さない）。 */
export function findSecrets(text) {
  const hits = [];
  const lines = String(text).split('\n');
  lines.forEach((line, index) => {
    for (const [name, pattern] of Object.entries(SECRET_PATTERNS)) {
      for (const match of line.matchAll(new RegExp(pattern.source, pattern.flags))) {
        if (PLACEHOLDER.test(match[0])) continue;
        hits.push({line: index + 1, pattern: name});
      }
    }
  });
  return hits;
}

/** 手順書として見るファイル（docs/ の下全部・直下の *.md・.github/ の下全部）。 */
export async function documentFiles(base = root) {
  const files = [];
  async function walk(dir) {
    let entries;
    try { entries = await readdir(path.join(base, dir), {withFileTypes: true}); } catch { return; }
    for (const entry of entries) {
      const at = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(at);
      else if (/\.(?:md|ya?ml|json|txt|html)$/.test(entry.name)) files.push(at);
    }
  }
  await walk('docs');
  await walk('.github');
  for (const entry of await readdir(base, {withFileTypes: true})) if (entry.isFile() && entry.name.endsWith('.md')) files.push(entry.name);
  return files.sort();
}

/** 手順書を見る。見つけたものを {file, line, pattern} で返す。 */
export async function scanDocuments(base = root) {
  const found = [];
  for (const file of await documentFiles(base)) {
    for (const hit of findSecrets(await readFile(path.join(base, file), 'utf8'))) found.push({file, ...hit});
  }
  return found;
}

/**
 * CI の記録（`gh run view --log` の形: 1 行が「仕事の名前<TAB>手順<TAB>本文」）を見る。
 * 返すのは仕事の名前と、その仕事の中での行の番号と、形の名前だけ。
 */
export function scanRunLog(text) {
  const found = [];
  const counts = new Map();
  for (const raw of String(text).split('\n')) {
    const job = raw.split('\t')[0] || '(不明)';
    const at = (counts.get(job) ?? 0) + 1;
    counts.set(job, at);
    for (const hit of findSecrets(raw)) found.push({job, line: at, pattern: hit.pattern});
  }
  return {found, jobs: counts.size, lines: [...counts.values()].reduce((sum, one) => sum + one, 0)};
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--run') {
    const id = args[1];
    if (!/^\d+$/.test(id ?? '')) throw new Error('--run には GitHub Actions の実行の番号（数字）を渡してください');
    const {stdout} = await run('gh', ['run', 'view', id, '--log'], {maxBuffer: 512 * 1024 * 1024});
    const {found, jobs, lines} = scanRunLog(stdout);
    console.log(`CI の記録（実行 ${id}）: 仕事 ${jobs} 件・${lines} 行を見た`);
    for (const one of found) console.log(`NG  ${one.job} の ${one.line} 行目: ${one.pattern}`);
    console.log(found.length ? `秘密の形 ${found.length} 件（値は出していない）` : '秘密の形は 0 件');
    if (found.length) process.exitCode = 1;
    return;
  }
  if (args.length) throw new Error('使えるのは 引数なし（手順書）と --run <番号> だけです');
  const files = await documentFiles();
  const found = await scanDocuments();
  console.log(`手順書: ${files.length} ファイルを見た（docs/・直下の *.md・.github/）`);
  for (const one of found) console.log(`NG  ${one.file}:${one.line}: ${one.pattern}`);
  console.log(found.length ? `秘密の形 ${found.length} 件（値は出していない）` : '秘密の形は 0 件');
  if (found.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    // 取り寄せの失敗の文言にも値が混ざりうるので、形に当たる部分は伏せて出す
    const message = error instanceof Error ? error.message.split('\n')[0] : '不明なエラー';
    console.error(`見られませんでした（${findSecrets(message).length ? '文言に秘密の形があるため伏せた' : message}）`);
    process.exitCode = 1;
  });
}
