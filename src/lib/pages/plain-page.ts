/**
 * 画面（React）ではなく配信の口（Route Handler）から返す、素の HTML 1 枚ぶんの外枠。
 *
 * この外枠を使う紙は 2 枚ある——見る許可が無い人に返す 403（src/lib/access/no-access.ts）と、
 * まだ名乗っていない人に返す門（src/lib/access/signin-gate.ts）。どちらも配信の口から返すので
 * React の語彙（src/app/_components/styles.ts）が使えず、見た目を要素へ直接書くことになる。
 *
 * **だから外枠はここ 1 つに持たせる。** 写して回ると、同じ役目の紙が 2 通りの余白と
 * 2 通りのボタンの形を持ち、直すときに片方だけ古いまま残る。値はすべて
 * src/app/signin/page.tsx と src/app/_components/styles.ts の写しで、ここで新しい値を作らない。
 *
 * **外の世界に触る部品を置かない**（保管庫・通信・ログイン）。検査表がこのファイルだけを
 * 組み立てて実際に呼ぶので、接ぎ口が混ざると検査のたびに本番の鍵が要るようになる。
 */

import { EASE, MOTION } from "../settings/ui-motion";
import { ICON_HREF } from "../settings/brand";

/** 画面に置く色と寸法。すべて src/app/signin/page.tsx が使っている値の写し。 */
const STYLE = `
:root {
  color-scheme: light dark;
  --ground: #ffffff;
  --ink: #171717;
  --quiet: #737373;
  --button: #171717;
  --button-hover: #404040;
  --button-ink: #ffffff;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ground: #0a0a0a;
    --ink: #f5f5f5;
    --button: #ffffff;
    --button-hover: #e5e5e5;
    --button-ink: #171717;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100dvh;
  background: var(--ground);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif;
  -webkit-font-smoothing: antialiased;
}
main {
  margin: 0 auto;
  display: flex;
  min-height: 100dvh;
  max-width: 24rem;
  flex-direction: column;
  justify-content: center;
  padding: 0 1.5rem;
}
h1 { margin: 0; font-size: 1.25rem; line-height: 1.75rem; font-weight: 600; letter-spacing: -0.025em; }
p { margin: 0.5rem 0 0; font-size: 0.875rem; line-height: 1.25rem; color: var(--quiet); }
form { margin: 0; }
button {
  margin-top: 1.5rem;
  width: 100%;
  border: 0;
  border-radius: 0.375rem;
  background: var(--button);
  color: var(--button-ink);
  padding: 0.625rem 1rem;
  font: inherit;
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color ${MOTION.quick}ms ${EASE};
}
button:hover { background: var(--button-hover); }
button:disabled { cursor: default; opacity: 0.5; }
a { margin-top: 1.5rem; display: inline-block; font-size: 0.75rem; line-height: 1rem; color: var(--quiet); text-underline-offset: 2px; }
[hidden] { display: none; }
`;

export type PlainPage = {
  /** タブに出る題。**中身に触れない固定の文言だけ**を渡すこと */
  title: string;
  /** `<head>` に足すもの（共有カードの指定など）。無ければ何も足さない */
  head?: string;
  /** `<main>` の中身 */
  body: string;
  /** `</body>` の直前に置く動き。無ければ script タグ自体を出さない */
  script?: string;
};

/**
 * 1 枚ぶんの HTML。
 *
 * 検索よけ（`robots`）と印（`icon`）は**必ず付く**。付け忘れられる場所を作らないため、
 * 呼ぶ側からは外せない形にしてある。
 */
export function plainPage(page: PlainPage): string {
  return (
    `<!doctype html><html lang="ja"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="robots" content="noindex, nofollow">` +
    `<link rel="icon" href="${ICON_HREF}">` +
    `<title>${page.title}</title>` +
    (page.head ?? "") +
    `<style>${STYLE}</style></head><body><main>` +
    page.body +
    `</main>` +
    (page.script === undefined ? "" : `<script>${page.script}</script>`) +
    `</body></html>`
  );
}

/** 差し込む文字列に含める値を、タグや属性として解釈されない形にする。 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
