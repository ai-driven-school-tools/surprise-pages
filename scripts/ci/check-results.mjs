/** Fail closed: missing tests and damaged inventories are failures, not empty successes. */
export function parseInventory(text) {
  const value = JSON.parse(text);
  if (value === null || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) {
    throw new Error('検査の控えが空か、形式が正しくありません');
  }
  for (const [name, row] of Object.entries(value)) {
    if (!/^check-.+\.mjs$/.test(name) || !row || !Number.isInteger(row.items) || row.items < 1 ||
        !Number.isInteger(row.sections) || row.sections < 0) throw new Error('検査の控えが正しくありません');
  }
  return value;
}

export function inspectResult(stdout, previous) {
  const lines = stdout.split('\n');
  const ok = lines.filter(line => line.startsWith('OK ')).length;
  const ng = lines.filter(line => line.startsWith('NG ')).length;
  const sections = lines.filter(line => /^-{3} /.test(line.trim())).length;
  const empty = ok + ng === 0;
  const shrank = previous !== undefined && (ok + ng < previous.items || sections < previous.sections);
  return {ok, ng, sections, empty, shrank};
}

export function missingChecks(previous, files) {
  const present = new Set(files);
  return Object.keys(previous).filter(name => !present.has(name));
}

/**
 * Split by recorded time, not by name order (same greedy as browser-shards.mjs): longest first, each check goes to
 * the shard with the least time so far. A check missing from the table (new or renamed) weighs the median of the
 * known ones, so it still runs. The table only weighs: it never selects or skips a check.
 */
export function shardChecks(files, value, durations = {}) {
  if(value===undefined)return files;
  const match=/^([1-9]\d*)\/([1-9]\d*)$/.exec(value);
  if(!match)throw Error('検査の分割指定が正しくありません');
  const index=Number(match[1]),total=Number(match[2]);
  if(index>total||total>files.length)throw Error('検査の分割数が正しくありません');
  const usable=seconds=>Number.isFinite(seconds)&&seconds>0;
  const known=files.map(file=>durations[file]).filter(usable).sort((a,b)=>a-b);
  const fallback=known.length?known[Math.floor(known.length/2)]:1;
  const weighted=files.map((file,order)=>({file,order,seconds:usable(durations[file])?durations[file]:fallback}))
   .sort((a,b)=>b.seconds-a.seconds||a.order-b.order);
  const loads=Array(total).fill(0),shards=Array.from({length:total},()=>new Set());
  for(const item of weighted){
   const shard=loads.indexOf(Math.min(...loads));
   loads[shard]+=item.seconds;shards[shard].add(item.file);
  }
  return files.filter(file=>shards[index-1].has(file));
}

/** The recorded seconds per check (weights for the split). A damaged table is a failure, not an even split. */
export function parseDurations(text) {
  const checks = JSON.parse(text)?.checks;
  if (checks === null || typeof checks !== 'object' || Array.isArray(checks)) throw new Error('検査の所要時間の控えが正しくありません');
  for (const [name, seconds] of Object.entries(checks)) {
    if (!/^check-.+\.mjs$/.test(name) || !Number.isFinite(seconds) || seconds < 0) throw new Error('検査の所要時間の控えが正しくありません');
  }
  return checks;
}

/**
 * Run `work` over `items` with at most `jobs` at once; results keep the order of `items`.
 * Items for which `alone(item)` is true never overlap with each other (they may overlap with the rest):
 * a free worker skips past them to the next ordinary item, and waits only when nothing else is left.
 */
export async function runPool(items, jobs, work, alone = () => false) {
  if (!Number.isInteger(jobs) || jobs < 1) throw new Error('同時に走らせる数が正しくありません');
  const results = Array(items.length), taken = Array(items.length).fill(false);
  let busy = false, released = [];
  const take = () => {
    const at = taken.findIndex((done, index) => !done && !(busy && alone(items[index])));
    if (at >= 0) { taken[at] = true; if (alone(items[at])) busy = true; }
    return at;
  };
  await Promise.all(Array.from({length: Math.min(jobs, items.length)}, async () => {
    while (taken.includes(false)) {
      const at = take();
      if (at < 0) { await new Promise(resolve => released.push(resolve)); continue; }
      try { results[at] = await work(items[at], at); }
      finally { if (alone(items[at])) { busy = false; for (const wake of released.splice(0)) wake(); } }
    }
  }));
  return results;
}

/**
 * 検査表の出力から、落ちた項目（`NG` で始まる行）と、そのすぐ下の説明の行を取り出す。
 *
 * 番人（run-checks.mjs）は検査表の標準出力を数えるだけで、落ちた項目の名前を出していなかった。CI の記録に残るのは
 * 検査表の名前と標準エラーの末尾だけになり、どの項目が落ちたかを読めない（2026-10-03 の check-api-v1 の 1 回）。
 * 1 項目につき説明は数行まで、1 行の長さも切る（1 項目の長い出力で記録を埋めない）。
 */
const DETAIL_LINES = 3;
const LINE_WIDTH = 400;

export function failureLines(stdout, limit = 10) {
  const lines = String(stdout).split("\n");
  const found = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^NG\s/.test(lines[index])) continue;
    const item = [lines[index]];
    for (let next = index + 1; next < lines.length && item.length <= DETAIL_LINES; next += 1) {
      if (/^(OK|NG)\s|^---|^\s*$/.test(lines[next])) break;
      item.push(lines[next]);
    }
    found.push(item.map((line) => line.slice(0, LINE_WIDTH)));
  }
  const shown = found.slice(0, limit).flat();
  return found.length > limit ? [...shown, `…ほか ${found.length - limit} 件の落ちた項目`] : shown;
}
