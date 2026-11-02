/**
 * 一覧の負荷検査の内訳: 1 回の要求のあいだに保存先が実行した文の数と、その時間の合計。
 * 記録するだけで合否には使わない。合否を決める測定が全部終わってから始める（文ごとの記録は測定を遅くしうるため）。
 * 使い捨ての保存先にだけ使う（呼ぶ側が接続先を確かめている）。
 */
import {open, stat} from 'node:fs/promises';

const settle = ms => new Promise(resolve => setTimeout(resolve, ms));

export function summarizeStatements(text) {
  let statements = 0, databaseMs = 0;
  // 表ごとの内訳（文の数と時間）。どの読み込みが資料の数と一緒に増えるかを見分けるため
  const tables = {};
  for (const [, duration, step, body] of text.matchAll(/duration: ([\d.]+) ms {2}(parse|bind|execute|statement)\b[^:\n]*:?([^\n]*)/g)) {
    databaseMs += Number(duration);
    const table = /\bfrom\s+(?:public\.)?"?(\w+)/i.exec(body)?.[1] ?? '(ほか)';
    const entry = tables[table] ??= {statements:0, databaseMs:0};
    entry.databaseMs += Number(duration);
    if (step === 'execute' || step === 'statement') { statements++; entry.statements++; }
  }
  return {statements, databaseMs, tables};
}

export async function startStatementLog(sql, file) {
  await sql`alter system set log_min_duration_statement = 0`;
  await sql`select pg_reload_conf()`;
  await settle(300);
  return {
    /** action のあいだに保存先が実行した文。action の中で検査自身は保存先に問い合わせないこと。 */
    async during(action) {
      const from = (await stat(file)).size;
      const result = await action();
      await settle(200);
      const handle = await open(file, 'r');
      try {
        const {size} = await handle.stat();
        const buffer = Buffer.alloc(size - from);
        await handle.read(buffer, 0, buffer.length, from);
        return {result, ...summarizeStatements(buffer.toString('utf8'))};
      } finally { await handle.close(); }
    },
    async stop() {
      await sql`alter system reset log_min_duration_statement`;
      await sql`select pg_reload_conf()`;
    },
  };
}
