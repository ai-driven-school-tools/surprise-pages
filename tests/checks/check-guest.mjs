/**
 * ゲストの入場券が、封を破られたら弾かれるかを確かめる。
 *
 * **券を作る側はもう無い**（名前だけで参加する道ごと畳んだ・check-page-tools.mjs）。
 * 残っているのは読む側だけなので、券はこの検査表が自分で作る——本物と同じ鍵で、
 * 同じ形に封をする。こうしておけば、作る口が生え直さなくても
 * 「封が破られた券を通さないか」を確かめ続けられる。
 */
import { createHmac } from "node:crypto";

import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);
const out = `${dir}/guest.mjs`;

const KEY = "test-secret-for-checking-only";
process.env.AUTH_SECRET = KEY;

await build({
  entryPoints: [`${root}/src/lib/access/guest.ts`],
  outfile: out,
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*"],
});

const { readGuest, tidyGuestName } = await import(out);

const ok = (label, actual, expected) =>
  console.log(`${actual === expected ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

/** 券 1 枚。中身（claims）に封をして、ブラウザが持ち歩く形にする。 */
const seal = (body, key) => createHmac("sha256", key).update(body).digest("base64url");
const mint = (claims, key = KEY) => {
  const body = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${body}.${seal(body, key)}`;
};

const GUEST_ID = "5f2b2c1e-0000-4000-8000-000000000001";
const value = mint({ v: 1, id: GUEST_ID, name: "山田 太郎" });

// 1. 本物の券は読み戻せる
const back = readGuest(value);
ok("名前が読み戻せる", back?.name, "山田 太郎");
ok("目印が読み戻せる", back?.guestId, GUEST_ID);

// 2. 名前を書き換えると封が合わない
const [body, sealed] = value.split(".");
const forgedBody = Buffer.from(
  JSON.stringify({ v: 1, id: GUEST_ID, name: "なりすまし" }),
  "utf8",
).toString("base64url");
ok("中身を差し替えた券は弾く", readGuest(`${forgedBody}.${sealed}`), null);

// 3. 封だけ変えても通らない
ok("封を書き換えた券は弾く", readGuest(`${body}.${sealed.slice(0, -2)}xx`), null);

// 4. 形が違うもの
ok("空は弾く", readGuest(""), null);
ok("区切りなしは弾く", readGuest("abcdef"), null);
ok("null は弾く", readGuest(null), null);

// 5. 中身が足りない券（封は本物でも、人として読めないものは通さない）
ok("目印が空の券は弾く", readGuest(mint({ v: 1, id: "", name: "太郎" })), null);
ok("名前が空の券は弾く", readGuest(mint({ v: 1, id: GUEST_ID, name: "   " })), null);

// 6. 別の鍵で作った券は通らない
ok("別の鍵の券は弾く", readGuest(mint({ v: 1, id: GUEST_ID, name: "太郎" }, "another-secret")), null);

// 7. 名前の整え方
ok("前後の空白を落とす", tidyGuestName("  太郎  "), "太郎");
ok("空白だけは名前にしない", tidyGuestName("   "), null);
ok("長すぎる名前は切る", tidyGuestName("あ".repeat(80))?.length, 40);
