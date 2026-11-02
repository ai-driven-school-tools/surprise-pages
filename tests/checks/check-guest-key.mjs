/** ゲスト用の鍵を分けたときの動きを確かめる。 */
import { createHmac } from "node:crypto";

import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

await build({
  entryPoints: [`${root}/src/lib/access/guest.ts`],
  outfile: `${dir}/guest-key.mjs`,
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*"],
});
const { readGuest } = await import(`${dir}/guest-key.mjs`);

const ok = (label, actual, expected) =>
  console.log(`${actual === expected ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

const clear = () => {
  delete process.env.GUEST_COOKIE_SECRET;
  delete process.env.AUTH_SECRET;
};

/**
 * 券 1 枚。作る口はもう無いので、ここで本物と同じ形に封をする（check-guest.mjs と同じ作法）。
 * 鍵を渡し分けられるようにしてあるのが要——どちらの鍵で封をした券が通るかを、
 * この検査表が見分けたいことそのものだから。
 */
const mint = (name, key) => {
  const body = Buffer.from(JSON.stringify({ v: 1, id: "g1", name }), "utf8").toString("base64url");
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`;
};

const GUEST_KEY = "guest-only-secret";
const AUTH_KEY = "auth-only-secret";
const byGuestKey = mint("太郎", GUEST_KEY);
const byAuthKey = mint("花子", AUTH_KEY);

// 1. ゲスト用の鍵だけがある
clear();
process.env.GUEST_COOKIE_SECRET = GUEST_KEY;
ok("ゲスト用の鍵だけで読める", readGuest(byGuestKey)?.name, "太郎");

// 2. ログインの鍵だけがある（従来どおり動く）
clear();
process.env.AUTH_SECRET = AUTH_KEY;
ok("ログインの鍵だけでも読める", readGuest(byAuthKey)?.name, "花子");

// 3. 両方あるとゲスト用が勝つ
clear();
process.env.GUEST_COOKIE_SECRET = GUEST_KEY;
process.env.AUTH_SECRET = AUTH_KEY;
ok("ゲスト用の鍵で作った券が通る", readGuest(byGuestKey)?.name, "太郎");
ok("ログインの鍵で作った券は通らない", readGuest(byAuthKey), null);

// 4. ログインの鍵を替えても、ゲストの券は生き残る
process.env.AUTH_SECRET = "auth-rotated";
ok("ログインの鍵を替えてもゲストは無事", readGuest(byGuestKey)?.name, "太郎");

// 5. ゲスト用の鍵を替えると、ゲストの券だけ失効する
process.env.GUEST_COOKIE_SECRET = "guest-rotated";
ok("ゲスト用の鍵を替えると失効する", readGuest(byGuestKey), null);

// 6. どちらも無ければ止まる
clear();
let stopped = false;
try {
  readGuest(byGuestKey);
} catch (error) {
  stopped = /GUEST_COOKIE_SECRET/.test(error.message);
}
ok("鍵が 1 つも無ければ止まる", stopped, true);
