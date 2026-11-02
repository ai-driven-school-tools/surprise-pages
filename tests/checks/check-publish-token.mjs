/**
 * 投稿の鍵が「型（ハッシュ）だけ残る」作りになっているかを確かめる。
 *
 * 鍵は入場証の合鍵のようなもので、渡すのは発行の 1 回だけ。こちらの手元に生の値が
 * 残っていると、保管庫を覗ける人が全員の鍵を持ち出せる。だから確かめたいのは
 * **「生の値がどこにも残らない」**の 1 点で、そこは保管庫が無くても見られる。
 *
 * 見るのは 3 つ。
 *   1. 値の作り方（毎回違う・十分に長い・頭に印が付く）
 *   2. 型の作り方（sha256 の 16 進 64 桁・同じ入力なら同じ・違えば違う）
 *   3. 受け取り口（Authorization: Bearer の読み方）
 * 加えて、書いてあるコード自体を読んで「生の値を保存していない」「応答に型が
 * 出ていない」ことも見る。1 と 2 が正しくても、保存する列を間違えたら台無しなので。
 *
 * 値を扱う部品（src/lib/identity/token-value.ts）は保管庫を触らないので、そのまま組み立てて呼べる。
 */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { root, dir } from "./paths.mjs";
const { build } = await import(pathToFileURL(`${root}/node_modules/esbuild/lib/main.js`).href);

await build({
  entryPoints: [`${root}/src/lib/identity/token-value.ts`],
  outfile: `${dir}/token-value.mjs`,
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*"],
});
const { TOKEN_PREFIX, bearerToken, bearerTokenFromHeader, hashTokenValue, looksLikeToken, newTokenValue } = await import(pathToFileURL(`${dir}/token-value.mjs`).href);

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

// ---------------------------------------------------------------------------
console.log("--- 1. 生の鍵の作り方 ---");
const first = newTokenValue();
ok("頭に印が付く", first.startsWith("spg_"), true);
ok("印は部品側の決めと一致", TOKEN_PREFIX, "spg_");
ok("印のあとに 43 文字（乱数 32 バイト）", first.length - TOKEN_PREFIX.length, 43);
ok("URL に貼れる文字だけ", /^spg_[A-Za-z0-9_-]+$/.test(first), true);

const many = new Set();
for (let i = 0; i < 500; i += 1) many.add(newTokenValue());
ok("500 回作って 1 つも重ならない", many.size, 500);
console.log(`      例: ${first.slice(0, 12)}…（以降は表示しない）`);

// ---------------------------------------------------------------------------
console.log("\n--- 2. 型（ハッシュ）の作り方 ---");
const hash = hashTokenValue(first);
ok("16 進 64 桁（sha256）", /^[0-9a-f]{64}$/.test(hash), true);
ok("同じ鍵なら同じ型", hashTokenValue(first), hash);
ok("別の鍵なら違う型", hashTokenValue(newTokenValue()) === hash, false);
ok("1 文字違うだけで違う型", hashTokenValue(`${first}a`) === hash, false);
ok("型から生の値は読めない（形が別物）", hash.startsWith(TOKEN_PREFIX), false);
ok("型に生の値が混ざっていない", hash.includes(first.slice(TOKEN_PREFIX.length, 20)), false);

// ---------------------------------------------------------------------------
console.log("\n--- 3. 明らかに鍵でないものは、保管庫を引く前に落とす ---");
ok("正しい鍵は通す", looksLikeToken(first), true);
ok("印が無いものは落とす", looksLikeToken(first.slice(TOKEN_PREFIX.length)), false);
ok("別の印は落とす", looksLikeToken(`ghp_${first.slice(TOKEN_PREFIX.length)}`), false);
ok("短すぎるものは落とす", looksLikeToken("spg_abc"), false);
ok("長すぎるものは落とす", looksLikeToken(`spg_${"a".repeat(300)}`), false);
ok("空文字は落とす", looksLikeToken(""), false);
ok("文字列でないものは落とす", looksLikeToken(null), false);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 受け取り口（Authorization ヘッダ）---");
const asRequest = (value) =>
  new Request("https://example.com/api/pages", {
    method: "POST",
    headers: value === null ? {} : { authorization: value },
  });

ok("Bearer を受ける", bearerToken(asRequest(`Bearer ${first}`)), first);
ok("ヘッダ文字列からも同じ値が出る", bearerTokenFromHeader(`Bearer ${first}`), first);
ok("小文字の bearer も受ける", bearerToken(asRequest(`bearer ${first}`)), first);
ok("大文字の BEARER も受ける", bearerToken(asRequest(`BEARER ${first}`)), first);
ok("前後の空白は落とす", bearerToken(asRequest(`  Bearer ${first}  `)), first);
ok("間の空白が多くても読める", bearerToken(asRequest(`Bearer    ${first}`)), first);
ok("Basic は受けない", bearerToken(asRequest(`Basic ${first}`)), null);
ok("印だけで値が無ければ受けない", bearerToken(asRequest("Bearer")), null);
ok("値の無い Bearer は受けない", bearerToken(asRequest("Bearer   ")), null);
ok("ヘッダが無ければ null", bearerToken(asRequest(null)), null);
ok("ヘッダ文字列が null なら null", bearerTokenFromHeader(null), null);
ok("生の値だけ渡されても受けない", bearerToken(asRequest(first)), null);

// ---------------------------------------------------------------------------
console.log("\n--- 5. 書いてあるコードを読む（保存する列・返す中身）---");
/**
 * 説明書き（コメント）は外して読む。
 * 「ここには token_hash を出さない」と書いた説明そのものを、
 * 見つけてはいけない文字として拾ってしまうため。
 */
const codeOnly = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const store = codeOnly(await readFile(`${root}/src/lib/identity/publish-tokens.ts`, "utf8"));
const api = codeOnly(await readFile(`${root}/src/app/api/tokens/route.ts`, "utf8"));
const idApi = codeOnly(await readFile(`${root}/src/app/api/tokens/[id]/route.ts`, "utf8"));

const insertBlock = /\.insert\(\{[\s\S]*?\}\)/.exec(store)?.[0] ?? "";
console.log("      保管庫へ書き込んでいる中身:");
console.log(insertBlock.replace(/^/gm, "        "));
ok("保存するのは型（token_hash）", /token_hash:\s*hashTokenValue\(/.test(insertBlock), true);
ok("生の値をそのまま保存していない", /token_hash:\s*token\b/.test(insertBlock), false);
ok("生の値の列を作っていない", /\b(token|token_value|secret):/.test(insertBlock), false);

const columns = /const COLUMNS =[\s\S]*?;/.exec(store)?.[0] ?? "";
ok("一覧で引く列に型を含めない", columns.includes("token_hash"), false);
ok("列は明示で並べている", columns.includes("id, label, created_at"), true);
ok("select(\"*\") を使っていない", /select\("\*"\)/.test(store), false);
ok("照合はハッシュで引いている", /\.eq\("token_hash", hashTokenValue\(/.test(store), true);
ok("止めるのは印を立てるだけ（行を消さない）", /revoked_at:\s*new Date\(\)/.test(store), true);
ok("行を消していない", /\.delete\(\)/.test(store), false);

ok("応答を組み立てるところに型が出てこない", api.includes("token_hash"), false);
ok("応答は一覧か発行の 2 つだけ", /jsonResponse\(\{ tokens \}/.test(api) && /jsonResponse\(\{ token: issued\.token, summary: issued\.summary \}/.test(api), true);
ok("発行の応答に生の値が乗るのはここだけ", (api.match(/issued\.token/g) ?? []).length, 1);
ok("一覧はまとめ（summary）だけ返す", /listTokens\(organization, viewer\.email\)/.test(api), true);
ok("会社の人だけ通す（一覧・発行）", (api.match(/if \(!isMember\(viewer\)\)/g) ?? []).length, 2);
ok("会社の人だけ通す（停止）", /if \(!isMember\(viewer\)\)/.test(idApi), true);
ok("他人の鍵は「ありません」で返す", /404/.test(idApi), true);
ok("停止でも型を返していない", idApi.includes("token_hash"), false);

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
process.exitCode = fails === 0 ? 0 : 1;
