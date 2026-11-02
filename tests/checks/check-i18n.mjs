/**
 * 多言語対応の基盤（docs/guides/i18n.md）。辞書の形・言語の決め方・書式・移し終えた画面・受け口を見る。
 *
 * 訳し漏れ（鍵の欠け）は `tsc` でも止まるが、ここでは差し込みの名前の食い違い・空の訳・
 * 移し終えた画面への日本語の戻りといった、型では見えない壊れ方を見る。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { build } from "esbuild";
import { root, dir } from "./paths.mjs";

for (const [name, entry] of [
  ["locales", "src/lib/i18n/locales.ts"],
  ["format", "src/lib/i18n/format.ts"],
  ["translate", "src/lib/i18n/translate.ts"],
  ["messages", "src/lib/i18n/messages/index.ts"],
  ["errors", "src/lib/i18n/errors.ts"],
  ["model", "src/lib/workspace/settings.ts"],
  ["beta", "src/lib/settings/beta-features.ts"],
  ["places", "src/lib/workspace/places.ts"],
]) {
  await build({ entryPoints: [`${root}/${entry}`], outfile: `${dir}/i18n-${name}.mjs`, bundle: true, format: "esm", platform: "node" });
}
const locales = await import(`${dir}/i18n-locales.mjs`);
const format = await import(`${dir}/i18n-format.mjs`);
const { translator } = await import(`${dir}/i18n-translate.mjs`);
const { MESSAGES } = await import(`${dir}/i18n-messages.mjs`);
const { localizeStored } = await import(`${dir}/i18n-errors.mjs`);
const { workspaceMutationSchema } = await import(`${dir}/i18n-model.mjs`);
const { BETA_FEATURE_IDS } = await import(`${dir}/i18n-beta.mjs`);
const places = await import(`${dir}/i18n-places.mjs`);
const read = (file) => readFileSync(`${root}/${file}`, "utf8");

let failures = 0;
function ok(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${JSON.stringify(actual)}（期待: ${JSON.stringify(expected)}）`);
}

/** 辞書の葉を `鍵 → 値` に平らにする。値は文字か `{ one, other }`。 */
function leaves(node, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(node)) {
    const path = `${prefix}${key}`;
    if (typeof value === "string" || (value && typeof value.one === "string" && typeof value.other === "string")) out.set(path, value);
    else if (value && typeof value === "object") leaves(value, `${path}.`, out);
    else out.set(path, value);
  }
  return out;
}
const texts = (value) => (typeof value === "string" ? [value] : [value.one, value.other]);
const slots = (value) => [...new Set(texts(value).flatMap((text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1])))].sort();

console.log("--- 1. 辞書（src/lib/i18n/messages/） ---");
ok("言語は日本語と英語・既定は日本語", [locales.LOCALES, locales.DEFAULT_LOCALE], [["ja", "en"], "ja"]);
ok("どの言語にも辞書がある", Object.keys(MESSAGES).sort(), [...locales.LOCALES].sort());
const ja = leaves(MESSAGES.ja);
for (const locale of locales.LOCALES.filter((one) => one !== locales.DEFAULT_LOCALE)) {
  const other = leaves(MESSAGES[locale]);
  ok(`${locale}: 日本語に無い鍵を持たない`, [...other.keys()].filter((key) => !ja.has(key)), []);
  ok(`${locale}: 日本語の鍵が全部ある`, [...ja.keys()].filter((key) => !other.has(key)), []);
  ok(`${locale}: 数で形が変わる文は、日本語と同じ所だけ`, [...ja.keys()].filter((key) => other.has(key) && typeof ja.get(key) !== typeof other.get(key)), []);
  ok(`${locale}: 差し込みの名前が日本語とそろう`, [...ja.keys()].filter((key) => other.has(key) && JSON.stringify(slots(ja.get(key))) !== JSON.stringify(slots(other.get(key)))), []);
  ok(`${locale}: 空の訳が無い`, [...other.entries()].filter(([, value]) => texts(value).some((text) => text.trim() === "")).map(([key]) => key), []);
  ok(`${locale}: 訳に日本語の字が残っていない`, [...other.entries()].filter(([, value]) => texts(value).some((text) => /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text))).map(([key]) => key), []);
}
const every = locales.LOCALES.flatMap((locale) => [...leaves(MESSAGES[locale]).entries()].map(([key, value]) => [`${locale}:${key}`, value]));
ok("どの葉も文字か { one, other }", every.filter(([, value]) => typeof value !== "string" && !(value && typeof value.one === "string")).map(([key]) => key), []);
ok("絵文字を使わない（DESIGN.md）", every.filter(([, value]) => texts(value).some((text) => /\p{Extended_Pictographic}/u.test(text))).map(([key]) => key), []);
ok("「トークン」の語を人に見せない", every.filter(([, value]) => texts(value).some((text) => /トークン|\btokens?\b/i.test(text))).map(([key]) => key), []);
ok("言語の名前はその言語自身で書く（訳さない）", locales.LOCALE_NAMES, { ja: "日本語", en: "English" });

console.log("\n--- 2. 言語の決め方（resolveLocale） ---");
const negotiate = locales.negotiateLocale;
ok("空・無しは日本語", [negotiate(null), negotiate(undefined), negotiate("")], ["ja", "ja", "ja"]);
ok("地域つきは言語で照らす", [negotiate("en-US"), negotiate("EN-gb"), negotiate("ja-JP")], ["en", "en", "ja"]);
ok("望みの強い順（q）", [negotiate("ja;q=0.5, en;q=0.9"), negotiate("en;q=0.4,ja"), negotiate("fr, en;q=0.8, ja;q=0.7")], ["en", "ja", "en"]);
ok("同じ強さなら書かれた順", negotiate("en, ja"), "en");
ok("q=0 は「要らない」", negotiate("en;q=0, ja;q=0.1"), "ja");
ok("対応していない言語だけなら日本語", [negotiate("fr, de;q=0.8"), negotiate("*"), negotiate("zh-CN,zh;q=0.9")], ["ja", "ja", "ja"]);
ok("壊れた q は「要らない」と読む", negotiate("en;q=abc, ja;q=0.2"), "ja");
const resolve = (setting, acceptLanguage) => locales.resolveLocale({ setting, acceptLanguage });
ok("自動はブラウザの言語", [resolve("auto", "en-US"), resolve("auto", "ja"), resolve("auto", null)], ["en", "ja", "ja"]);
ok("選んだ言語はブラウザより先", [resolve("ja", "en-US"), resolve("en", "ja-JP")], ["ja", "en"]);
const fromRequest = (cookieHeader, acceptLanguage) => locales.requestLocaleFrom({ cookieHeader, acceptLanguage });
ok("DB を引かない場所は cookie の写しが先", [fromRequest("a=1; sp-locale=en", "ja"), fromRequest("sp-locale=ja", "en-US")], ["en", "ja"]);
ok("写しが無い・知らない値ならブラウザの言語", [fromRequest("", "en-US"), fromRequest("sp-locale=fr", "en"), fromRequest(null, null)], ["en", "en", "ja"]);
ok("cookie の名前は 1 か所", locales.LOCALE_COOKIE, "sp-locale");
ok("個人設定で選べるのは自動と対応する言語", locales.LOCALE_SETTINGS, ["auto", "ja", "en"]);

console.log("\n--- 3. 引く関数（translator）と書式 ---");
const tJa = translator("ja", MESSAGES.ja);
const tEn = translator("en", MESSAGES.en);
ok("保存した画像検査の理由を英語で出せる", localizeStored("装飾内の画像の画素数は未確認です。画像要素で配置して再検査してください", tEn), "Image pixels in decorations have not been verified. Use an image element and inspect again.");
ok("画素不足の実測値を残して英語にする", localizeStored("画像の画素が不足しています（元 32×18、必要 2560×1440）。大きい原画像へ差し替えるか、配置・切り抜きを見直してください", tEn), "The image has too few pixels (source 32×18, required 2560×1440). Use a larger original or adjust its size and crop.");

ok("鍵で引く", [tJa("common.retry"), tEn("common.retry")], ["再試行", "Retry"]);
ok("差し込む", [tJa("workspace.accountEmail", { email: "a@example.com" }), tEn("settings.beta.group", { feature: "X" })], ["（a@example.com）", "Use X"]);
ok("数で形を選ぶ（英語）", [tEn("settings.views.detail", { count: 1 }), tEn("settings.views.detail", { count: 90 })], ["Pages you've viewed. Deleted after 1 day", "Pages you've viewed. Deleted after 90 days"]);
ok("数は言語の書式で書く", [tJa("settings.usage.assetsValue", { size: "1 MB", files: 12345 }), tEn("settings.usage.assetsValue", { size: "1 MB", files: 12345 })], ["1 MB · 12,345 件", "1 MB · Items: 12,345"]);
ok("渡し忘れた差し込みは字のまま残す（黙って消さない）", tEn("settings.beta.group"), "Use {feature}");
ok("辞書に無い鍵は鍵のまま出す（古い画面に気づける）", tEn("missing.key"), "missing.key");
const instant = "2026-10-02T16:30:00Z"; // 東京では 10 月 3 日 1:30
ok("日付は会社の暦（東京）で読む", [format.formatDate("ja", instant), format.formatDate("en", instant)], ["2026/10/03", "Oct 3, 2026"]);
ok("時刻つき", [format.formatDateTime("ja", instant), format.formatDateTime("en", instant)], ["2026/10/03 1:30", "Oct 3, 2026, 1:30 AM"]);
ok("数", [format.formatNumber("ja", 1234567), format.formatNumber("en", 1234567)], ["1,234,567", "1,234,567"]);
const now = Date.parse(instant);
ok("いまからの隔たり", [format.formatRelative("ja", now - 3 * 60_000, now), format.formatRelative("en", now - 3 * 60_000, now), format.formatRelative("en", now - 86_400_000, now)], ["3 分前", "3 minutes ago", "yesterday"]);
ok("時刻帯は 1 か所", format.TIME_ZONE, "Asia/Tokyo");

console.log("\n--- 4. 文言の網（画面に届く文は辞書へ） ---");
const { KEEP_FILE_CEILING, KEEP_LINE_CEILING } = await import("../../scripts/i18n/net.mjs");
const { netFiles, keptFiles, keptLines, emptyReasons, leftovers } = (await import("../../scripts/i18n/net.mjs")).scanNet(root);
console.log(`      見た ${netFiles.length} ファイル・訳さないファイル ${keptFiles.length}・訳さない行 ${keptLines.length}`);
ok("画面に届く文は全部辞書にある（コメントと印の付いたもの以外に日本語の字が無い）", { count: leftovers.length, first: leftovers.slice(0, 30) }, { count: 0, first: [] });
ok("訳さない印には必ず理由がある", emptyReasons, []);
ok(`訳さないファイルは ${KEEP_FILE_CEILING} 以下（増やすときは理由と上限を一緒に）`, keptFiles.length <= KEEP_FILE_CEILING, true);
ok(`訳さない行は ${KEEP_LINE_CEILING} 以下（増やすときは理由と上限を一緒に）`, keptLines.length <= KEEP_LINE_CEILING, true);

console.log("\n--- 5. 受け口 ---");
const layout = read("src/app/layout.tsx");
ok("外枠の言語は決めた値から（lang の直書きを戻さない）", [/<html lang=\{locale\}/.test(layout), /lang="ja"/.test(layout)], [true, false]);
ok("外枠は選んだ言語の辞書だけを画面へ渡す（既定の日本語は JS に入っているので送り直さない）", /<I18nProvider locale=\{locale\} messages=\{locale === DEFAULT_LOCALE \? undefined : messagesFor\(locale\)\} organization=\{organization\}>/.test(layout), true);
const server = read("src/lib/i18n/server.ts");
ok("英語は全員に開く（ベータの台帳に english-ui を残さない・判定もしない）", [BETA_FEATURE_IDS.includes("english-ui"), /english-ui/.test(server)], [false, false]);
ok("会社の人は個人設定、それ以外は cookie の写し・読めなければ日本語（投げない）", [/readLocaleSetting\(viewer\.email\)/.test(server), /jar\.get\(LOCALE_COOKIE\)/.test(server), /catch \{\s*return DEFAULT_LOCALE;/.test(server)], [true, true, true]);
const provider = read("src/app/_components/i18n.tsx");
ok("外枠は決まった言語を cookie へ書き写す（道具箱・窓口・関所が読む）", /document\.cookie = `\$\{LOCALE_COOKIE\}=\$\{locale\}; Path=\/; Max-Age=\$\{LOCALE_COOKIE_MAX_AGE\}; SameSite=Lax/.test(provider), true);
const requestSource = read("src/lib/i18n/request.ts");
ok("窓口の断り文の言語は入口の外枠で 1 度だけ決める（DB を引かない）", [/runWithRequestLocale\(request, async/.test(read("src/lib/logging/server-log.ts")), /requestLocaleFrom\(/.test(requestSource), /getDb|readLocaleSetting/.test(requestSource)], [true, true, false]);
const widgetI18n = read("src/widget/shared/i18n.ts");
ok("道具箱は描く前に cookie の写しで決める（ブラウザの言語は見ない・無ければ日本語）", [/localeFromCookies\(/.test(widgetI18n), /navigator/.test(widgetI18n.replace(/\/\*[\s\S]*?\*\//g, ""))], [true, false]);
const accepts = (value) => workspaceMutationSchema.safeParse(value).success;
ok("保存の口は自動と対応する言語だけ", ["auto", "ja", "en", "fr", "", 1].map((value) => accepts({ action: "locale", value })), [true, true, true, false, false, false]);
ok("誰の分かを受け取らない", accepts({ action: "locale", value: "en", email: "other@example.com" }), false);
const route = read("src/app/api/workspace/route.ts");
ok("「自動」は空として置く・誰の分かは名乗りから", /input\.action === "locale"[\s\S]{0,260}\{ owner_email: email, locale: input\.value === "auto" \? null : input\.value \}/.test(route), true);
const store = read("src/lib/workspace/workspace.ts");
ok("言語の設定は読めなければ「自動」（投げない）", /readLocaleSetting = cache\([\s\S]{0,600}catch \{\s*return "auto";/.test(store), true);
const migrationFile = readdirSync(`${root}/db/migrations`).find((file) => file.endsWith("_workspace_locale.sql"));
const migration = migrationFile ? read(`db/migrations/${migrationFile}`) : "";
ok("列は足すだけ（空を許す・既定値なし）", [/add column locale text check/.test(migration), /not null|default/i.test(migration.replace(/--.*$/gm, ""))], [true, false]);
ok("DB が通す値は言語の正本と同じ", /locale in \(([^)]*)\)/.exec(migration)?.[1].split(",").map((value) => value.trim().replace(/'/g, "")), [...locales.LOCALES]);
const screen = read("src/app/settings/settings-screen.tsx");
ok("言語の行は既にある部品（ws-segments）で、誰にでも出す", [screen.includes('aria-label={t("settings.language.group")}'), /locale !== null/.test(screen)], [true, false]);
ok("場所の名前は辞書から（既定は日本語）", [places.placeLabel(places.HOME_PLACE), places.placeLabel(places.LIBRARY_PLACE, (key) => key)], ["ホーム", "workspace.places.library"]);
const globalError = read("src/app/global-error.tsx");
ok("外枠の外の画面は日本語の辞書を引く", /import \{ defaultTranslate as t \} from "@\/lib\/i18n\/default";/.test(globalError), true);
const jaFiles = readdirSync(`${root}/src/lib/i18n/messages/ja`).map((file) => `src/lib/i18n/messages/ja/${file}`);
ok("辞書は辞書のほかを読み込まない葉（関所からも読む）", [/^import (?!\{ \w+ \} from "\.\/ja\/\w+";$)/m.test(read("src/lib/i18n/messages/ja.ts")), jaFiles.filter((file) => /^\s*import\s/m.test(read(file)))], [false, []]);
ok("分野ごとの辞書は ja と en で同じ名前がそろう", readdirSync(`${root}/src/lib/i18n/messages/en`).sort(), readdirSync(`${root}/src/lib/i18n/messages/ja`).sort());

console.log("\n--- 6. 組織の名前で言う ---");
const named = (organization) => translator("ja", MESSAGES.ja, organization === undefined ? {} : { organization });
const namedEn = (organization) => translator("en", MESSAGES.en, organization === undefined ? {} : { organization });
ok("「会社の資料」は組織の名前で言う（日本語・英語）", [named("見本商事")("workspace.places.library"), named("最初の組織")("workspace.places.library"), namedEn("見本商事")("workspace.places.library")], ["見本商事 の資料", "最初の組織 の資料", "Files — 見本商事"]);
ok("共有範囲は「{組織} の全員 / 組織の外の誰でも」", [named("見本商事")("toolbox.access.scope.internal"), named("見本商事")("toolbox.access.scope.public"), named("見本商事")("toolbox.access.action.public")], ["見本商事 の全員", "組織の外の誰でも", "組織の外に公開する"]);
ok("門の紙は組織の名前で言う", [named("見本商事")("auth.gate.title"), named("見本商事")("auth.gate.description")], ["見本商事 の限定ページ", "見本商事 に参加しているアカウントでログインすると開けます。"]);
ok("呼び出しで渡した名前が、決まった名前より先", named("見本商事")("workspace.places.library", { organization: "見本" }), "見本 の資料");
ok("名前が分からなければ辞書の一般語（字のまま {organization} を出さない）", [named()("workspace.places.library"), namedEn()("workspace.places.library"), translator("ja", MESSAGES.ja)("auth.gate.title")], ["この組織 の資料", "Files — this organization", "この組織 の限定ページ"]);
ok("組織の名前でないほかの差し込みは、今までどおり渡し忘れを字のまま残す", named("見本商事")("settings.beta.group"), "{feature}を使うか");
ok("場所の名前は引く関数の組織の名前で言い、サイドバーは 12 字で切る", [places.placeLabel(places.LIBRARY_PLACE, named("見本商事")), places.placeLabel(places.LIBRARY_PLACE, named("見本商事"), places.sidebarOrganizationName("とても長い組織の名前でございます株式会社")), places.sidebarOrganizationName("見本商事"), places.SIDEBAR_ORGANIZATION_LIMIT], ["見本商事 の資料", "とても長い組織の名前でご… の資料", "見本商事", 12]);
ok("個人配布版の「すべての資料」の 2 通り目は畳んだ（鍵も分岐も残さない）", [Object.hasOwn(MESSAGES.ja.workspace.places, "libraryPersonal"), /personal/.test(read("src/lib/workspace/places.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""))], [false, false]);
/**
 * 辞書の値の網。日本語は「会社」「社内」「社外」、英語は company
 * 「最初の組織」を残さない。台帳（録音・デスクトップ＝D2・D3 の範囲）は**減る方向だけ**——件数を控えと比べ、増えても減っても落とす
 * （減ったら控えを下げる）。コメント（仕組みの説明）は辞書の値ではないので見ない。
 */
// 個人配布版はデスクトップアプリの辞書を外したので、台帳は空
const WORD_LEDGER = new Map([]);
const WORD_LEDGER_COUNT = 0;
const wordsOf = (locale) => (locale === "ja" ? /会社|社内|社外/ : /\bcompany\b/i);
const wordHits = locales.LOCALES.flatMap((locale) => [...leaves(MESSAGES[locale]).entries()].filter(([, value]) => texts(value).some((text) => wordsOf(locale).test(text))).map(([key]) => [locale, key]));
const outsideLedger = wordHits.filter(([, key]) => ![...WORD_LEDGER.keys()].some((prefix) => key.startsWith(prefix))).map(([locale, key]) => `${locale}:${key}`);
ok("辞書に「会社」「社内」「社外」・英語の company が残っていない（台帳の外）", outsideLedger, []);
ok(`台帳（録音・デスクトップ）の残りは ${WORD_LEDGER_COUNT} 件（減る方向だけ・減ったら控えを下げる）`, wordHits.length - outsideLedger.length, WORD_LEDGER_COUNT);
const { scanOrganizationWords, ORGANIZATION_WORD_LEDGER } = await import("../../scripts/i18n/net.mjs");
const words = scanOrganizationWords(root);
console.log(`      見た ${words.files.length} ファイル・印で残した行 ${words.kept.length}・台帳の置き場の行 ${words.ledgered.length}`);
ok("src/app/・src/widget/ に「会社」「社内」「社外」が残っていない（コメントと印の付いた行・台帳の置き場を除く）", words.leftovers, []);
// 録音の画面と辞書は D3で直して台帳から外した
ok("画面の部品の台帳は空（減る方向だけ）", [...ORGANIZATION_WORD_LEDGER.keys()], []);
ok("台帳の置き場の残りは 0 行（減る方向だけ）", words.ledgered.length, 0);
const serverI18n = read("src/lib/i18n/server.ts");
ok("サーバーの画面の名前は要求の組織の設定から 1 度だけ（言語と同じ読みを分け合う）", [/export const currentOrganizationName = cache\(async \(\): Promise<string \| null> => \{\s*const names = await readOrganizationName\(\);/.test(serverI18n), /export const readOrganizationName = cache\([\s\S]{0,120}\{\s*try \{\s*const profile = await organizationProfile\(await currentOrganization\(\)\);\s*return \{ name: profile\.name, shareable: shareableOrganizationName\(profile\) \};/.test(read("src/lib/workspace/workspace.ts")), /translator\(locale, messagesFor\(locale\), organizationParams\(name\)\)/.test(serverI18n)], [true, true, true]);
// 個人配布版は環境の帯を外したので、組織の名前を渡す先は画面（I18nProvider）だけ
ok("外枠は組織の名前を決めて画面に渡す", [/currentOrganizationName\(\)/.test(layout), /<I18nProvider [^>]*organization=\{organization\}>/.test(layout)], [true, true]);
ok("道具箱は札の名前を差し込む（保存先を引かない）", [/translator\(locale, MESSAGES\[locale\], organizationParams\(organizationFromTag\(\)\.name\)\)/.test(widgetI18n), /fetch\(/.test(widgetI18n)], [true, false]);
const contentSource = read("src/lib/pages/content.ts");
ok("札の名前は escapeHtml を通して書く・照合の印に混ぜる", [/\$\{ORGANIZATION_NAME_ATTR\}="\$\{escapeHtml\(organization\.name\)\}"/.test(contentSource), /pageEtag\(input\.etag, "html", scripts\.restricted, input\.organization\)/.test(read("src/lib/pages/cache.ts"))], [true, true]);

console.log("\n--- 7. 配布版の組織の名前を、ログインしていない人に届く場所へ出さない ---");
// 配布版の組織の名前は設置した本人のアドレスの @ より前。門の紙・カード・meta・門なし公開の札には出さず、名乗った人の画面にだけ渡す
{
  const saved = { edition: process.env.PAGES_EDITION, owner: process.env.PAGES_OWNER_EMAIL };
  process.env.PAGES_EDITION = "personal";
  process.env.PAGES_OWNER_EMAIL = "taro-owner@example.com";
  await build({ entryPoints: [`${root}/src/lib/organization/profile.ts`], outfile: `${dir}/i18n-profile.mjs`, bundle: true, format: "esm", platform: "node", external: ["node:*"] });
  await build({ entryPoints: [`${root}/src/lib/access/signin-gate.ts`], outfile: `${dir}/i18n-gate.mjs`, bundle: true, format: "esm", platform: "node", external: ["node:*"] });
  const profiles = await import(`${dir}/i18n-profile.mjs`);
  const gate = await import(`${dir}/i18n-gate.mjs`);
  const profile = await profiles.organizationProfile({ id: "00000000-0000-4000-8000-000000000001", assetPrefix: "" });
  const shareable = profiles.shareableOrganizationName(profile);
  const paper = gate.signInGatePage({ next: "/internal/x", cardUrl: `https://x${gate.lockedCardPath(shareable)}`, organization: shareable });
  ok("配布版: 名乗った人の画面の名前は本人の呼び方、外へ届く場所には出さない", [profile.name, shareable], ["taro-owner", null]);
  ok("配布版: 門の紙（題・札・本文）とカードの絵の道筋にアドレスの頭が出ない", [paper.includes("taro-owner"), gate.lockedCardPath(shareable)], [false, "/api/og/locked?o=0"]);
  process.env.PAGES_EDITION = saved.edition;
  process.env.PAGES_OWNER_EMAIL = saved.owner;
  if (saved.edition === undefined) delete process.env.PAGES_EDITION;
  if (saved.owner === undefined) delete process.env.PAGES_OWNER_EMAIL;
}
ok("外へ届く場所は外へ出してよい名前だけを使う（門の紙・門なし公開の札・画面の meta・カードの絵）", [
  /organizationProfile\(organization\)\.then\(shareableOrganizationName, \(\) => null\)/.test(read("src/lib/pages/private-page.ts")),
  /const shareable = shareableOrganizationName\(await profile\);/.test(read("src/app/public/[...slug]/route.ts")),
  /const organization = await currentShareableOrganizationName\(\);/.test(layout),
  /await currentShareableOrganizationName\(\)/.test(read("src/app/api/og/locked/route.tsx")),
].join("|"), "true|true|true|true");
ok("外枠の名前は、配布版では名乗った人にだけ渡す", /if \(names\.shareable !== null\) return names\.shareable;[\s\S]{0,300}return isMember\(await currentIdentity\(\)\) \? names\.name : null;/.test(serverI18n), true);

console.log(`\n多言語対応: ${failures} 件の不合格`);
process.exitCode = failures ? 1 : 0;
