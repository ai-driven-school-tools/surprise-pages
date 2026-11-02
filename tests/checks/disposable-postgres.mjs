/**
 * 検査表が使い捨ての PostgreSQL を起こすときの共通の入口。
 *
 * 道具（embedded-postgres）には番号を渡すしかなく、「空いている番号を探して、いったん閉じてから渡す」ことになる。
 * 検査表を同時に走らせると、閉じてから起こすまでの間に別のプロセスが同じ番号を取ることがある。
 * 取り合いは防げないので、**取られたら別の番号でやり直す**（保管庫は作り直す。中身はまだ空）。
 */
import { rm } from "node:fs/promises";
import { createServer } from "node:net";

export function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); });
  });
}

/**
 * `options` は番号以外の設定（databaseDir は必須）。起きた保管庫と、その番号を返す。
 * 起こせなかった理由は見分けない（道具が番号の取り合いを名指しで返さない）。何度やっても駄目なら最後の失敗を投げる。
 */
export async function startDisposablePostgres(Postgres, options, { attempts = 3, pickPort = freePort } = {}) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const port = await pickPort();
    const cluster = new Postgres({ ...options, port });
    try {
      await cluster.initialise();
      await cluster.start();
      return { cluster, port };
    } catch (error) {
      last = error;
      await Promise.resolve().then(() => cluster.stop()).catch(() => {});
      await rm(options.databaseDir, { recursive: true, force: true });
    }
  }
  throw last;
}
