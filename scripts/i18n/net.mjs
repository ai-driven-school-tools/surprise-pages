/**
 * 文言の網（多言語対応・docs/guides/i18n.md）。画面に届く文が辞書にあるかを、コメントを外した字面で見る。
 * 検査表（`tests/checks/check-i18n.mjs`）と、移す人の道具（`node scripts/i18n/leftovers.mjs <置き場所>`）が同じものを通す。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";

/**
 * 見る範囲は画面・道具箱・デスクトップ・lib の全部。日本語の字が残ってよいのは、訳さないと決めたものだけで、
 * 印で理由を書く（docs/guides/i18n.md の「訳さないもの」）。
 * - ファイルごと: 先頭 15 行のコメントに `i18n-keep-file: <理由>`（保存済みページに貼る実行部・原稿として入る文・内部専用など）
 * - 行ごと: その行のコメントに `i18n-keep: <理由>`（保存済みのボタンを探す字面・日本語の入力を見る正規表現・ログなど）
 * どちらも理由が空なら落とす。印の数は控え（下の上限）より増やさない——増やすときは理由と一緒に上限を上げる。
 */
export const NET_ROOTS = ["src/app", "src/widget", "src/lib"];
const NET_SKIP = [/^src\/widget\/dist\//, /^src\/lib\/i18n\/messages\/ja\//, /\.generated\./, /\/node_modules\//];
export const KEEP_FILE_CEILING = 24;
// 352: リポジトリの文書のコメントで 2 行足した——AI へ貼る依頼文の雛形（src/widget/repository-request.ts）
// 355: スライドの操作列を道具箱から押す（src/widget/deck/edit/tools.ts）で 3 行足した——保存済みページの実行部が描く釦を字面で探す
// 356: スライドの共有カードで 1 行足した——Slack の見出しの「7枚目 — 見出し」（src/lib/deck/card/card.ts。Slack の知らせは訳さない）
// 357: 組織の台帳で 1 行足した——src/lib/organization/organizations.ts の内部専用の失敗の 1 文（画面に出る口はまだ無い）
export const KEEP_LINE_CEILING = 357;
/** コメントを外した中身（`//` は文字列の中の URL を残すため、前が `:` のときは外さない）。 */
const withoutComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " ")).replace(/<!--[\s\S]*?-->/g, (block) => block.replace(/[^\n]/g, " ")).replace(/(^|[^:\\])\/\/.*$/gm, "$1");
export const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
export function scanNet(root) {
  const read = (file) => readFileSync(`${root}/${file}`, "utf8");
  const netFiles = NET_ROOTS.flatMap((base) =>
    existsSync(`${root}/${base}`)
      ? readdirSync(`${root}/${base}`, { recursive: true })
          .map((file) => `${base}/${String(file)}`)
          .filter((file) => /\.(ts|tsx|mts|html)$/.test(file) && !NET_SKIP.some((skip) => skip.test(file)))
      : [],
  );
  const keptFiles = [], keptLines = [], emptyReasons = [], leftovers = [];
  for (const file of netFiles) {
    const text = read(file);
    if (!JAPANESE.test(text)) continue;
    const head = text.split("\n").slice(0, 15).join("\n");
    const fileMark = /i18n-keep-file:([^\n*]*)/.exec(head);
    if (fileMark) {
      if (!fileMark[1].trim()) emptyReasons.push(file);
      keptFiles.push(file);
      continue;
    }
    const raw = text.split("\n");
    withoutComments(text)
      .split("\n")
      .forEach((line, at) => {
        if (!JAPANESE.test(line)) return;
        const mark = /i18n-keep:([^\n]*)/.exec(raw[at] ?? "");
        if (mark) {
          if (!mark[1].replace(/\*\/\}?|-->/g, "").trim()) emptyReasons.push(`${file}:${at + 1}`);
          keptLines.push(`${file}:${at + 1}`);
          return;
        }
        leftovers.push(`${file}:${at + 1}`);
      });
  }
  return { netFiles, keptFiles, keptLines, emptyReasons, leftovers };
}

/**
 * 組織の名前で言う網（複数組織対応の B5）。画面の「会社」「社内」「社外」は、要求の組織の名前の差し込み
 * （`{organization}`）か「組織の外」で言う。製品名（Pages）は残す。ここは画面の部品（`src/app/`・`src/widget/`）の
 * コメントを外した字面に、会社の言い方が残っていないかを見る（辞書の値は検査表が見る）。
 *
 * 残してよいのは、印で理由を書いた行（`i18n-keep:`。AI へ貼る依頼文など、スキルが読む仕組みの語）と、
 * 下の台帳の置き場だけ。台帳は録音・デスクトップ（D2・D3 の範囲）で、**減る方向だけ**。
 */
export const ORGANIZATION_WORDS = /会社|社内|社外/;
export const ORGANIZATION_WORD_ROOTS = ["src/app", "src/widget"];
// 録音の画面（src/app/(workspace)/recordings/）は D3で直して台帳から外した。新しく足さない（減る方向だけ）
export const ORGANIZATION_WORD_LEDGER = new Map([]);
export function scanOrganizationWords(root) {
  const files = ORGANIZATION_WORD_ROOTS.flatMap((base) =>
    existsSync(`${root}/${base}`)
      ? readdirSync(`${root}/${base}`, { recursive: true })
          .map((file) => `${base}/${String(file)}`)
          .filter((file) => /\.(ts|tsx|mts|html)$/.test(file) && !NET_SKIP.some((skip) => skip.test(file)))
      : [],
  );
  const kept = [], ledgered = [], leftovers = [];
  for (const file of files) {
    const text = readFileSync(`${root}/${file}`, "utf8");
    if (!ORGANIZATION_WORDS.test(text)) continue;
    const raw = text.split("\n");
    const ledger = [...ORGANIZATION_WORD_LEDGER.keys()].find((prefix) => file.startsWith(prefix));
    withoutComments(text)
      .split("\n")
      .forEach((line, at) => {
        if (!ORGANIZATION_WORDS.test(line)) return;
        const place = `${file}:${at + 1}`;
        if (ledger !== undefined) ledgered.push(place);
        else if (/i18n-keep:\s*\S/.test(raw[at] ?? "")) kept.push(place);
        else leftovers.push(place);
      });
  }
  return { files, kept, ledgered, leftovers };
}
