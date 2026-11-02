import { DECK_FONT_BASE } from "../deck/design/typography";
import vendorStamps from "../../../vendor/stamp.json";

// Shared by server delivery and editor previews. Never import widget build output here.
/**
 * 外から取ってきていた 3 本を、自前で配るときの行き先の頭。
 *
 * 印つきの行き先は `/vendor/<名前>/<印>`。印を名前の 1 つ下に置くのは
 * コメント機能の部品と同じ理由（Next の受け口は区切りまるごとでしか変えられない）。
 */
export const VENDOR_BASE = "/vendor";

/** 中身から決まる印。出どころは vendor/stamp.json ただ 1 つ（`pnpm build:vendor` が書き出す）。 */
export const VENDOR_STAMPS: Readonly<Record<string, string>> = {
  "tailwind.js": vendorStamps["tailwind.js"].stamp,
  "lucide.js": vendorStamps["lucide.js"].stamp,
  "mermaid.js": vendorStamps["mermaid.js"].stamp,
  "echarts.js": vendorStamps["echarts.js"].stamp,
};

/** いま差し込む行き先。中身が変われば名前ごと変わるので、1 年持たせても古いものが残らない。 */
export function vendorSrc(name: string): string {
  return `${VENDOR_BASE}/${name}/${VENDOR_STAMPS[name] ?? ""}`;
}

/**
 * ページが外から取ってくる行き先を、自前の行き先へ書き換える組。
 *
 * **版の付かない行き先だけ**を狙う。`https://cdn.tailwindcss.com` も
 * `https://unpkg.com/lucide@latest` も「そのときの最新をください」という意味しかないので、
 * こちらが持っている 1 本に固定しても、書いた人の意図から外れない（むしろ揺れが止まる）。
 *
 * 逆に、版を書いてある行き先（`cdn.tailwindcss.com/3.3.0` や `unpkg.com/lucide@0.400.0`）は原則
 * **そのまま外を指させる**。書いた人がその版の見た目を選んでいるのに、黙って別の版へ
 * すり替えたら見た目が変わりうる。速さのために見た目を壊さない、をこちら側の約束にする。
 * 同じ理由で、道具を足す指定（`cdn.tailwindcss.com?plugins=forms`）にも手を出さない
 * （こちらの 1 本にはその道具が入っていないので、当てたら崩れる）。
 * 例外は、共通部品が版まで固定して要求し、同じ1本を `vendor/` に持つ companion だけ。
 * ECharts 6.1.0 はその契約であり、完全一致する行き先だけを下で付け替える。
 *
 * 書体（fonts.googleapis.com / fonts.gstatic.com）はここでは触らない。
 */
const VENDOR_REWRITES: readonly { name: string; pattern: RegExp }[] = [
  {
    name: "tailwind.js",
    pattern: /(<script\b[^>]*\bsrc=")https:\/\/cdn\.tailwindcss\.com\/?(")/gi,
  },
  {
    name: "lucide.js",
    pattern: /(<script\b[^>]*\bsrc=")https:\/\/unpkg\.com\/lucide@latest(?:\/dist\/umd\/lucide(?:\.min)?\.js)?\/?(")/gi,
  },
  /*
   * 図の道具。**ひとかたまりの形（dist/mermaid.min.js）だけ**を狙う。
   *
   * 配り元にはもう 1 つ、種類ごとの小分けを後から取りに行く形
   * （`dist/mermaid.esm.min.mjs` を `import` する書き方）があり、こちらは付け替えない。
   * 置いてあるのはひとかたまりの 1 本なので、あの行き先に当てると
   * 「モジュールとして読み込む」約束が破れてページごと止まる。**当てないほうが安全**で、
   * 当たらなかったぶんは今までどおり外から取れる（見た目は変わらない）。
   */
  {
    name: "mermaid.js",
    pattern:
      /(<script\b[^>]*\bsrc=")https:\/\/(?:cdn\.jsdelivr\.net\/npm|unpkg\.com)\/mermaid(?:@latest)?(?:\/dist\/mermaid(?:\.min)?\.js)?\/?(")/gi,
  },
  {
    // The format catalog pins this companion exactly; other ECharts versions remain untouched.
    name: "echarts.js",
    pattern:
      /(<script\b[^>]*\bsrc=")https:\/\/cdn\.jsdelivr\.net\/npm\/echarts@6\.1\.0\/dist\/echarts\.min\.js\/?(")/gi,
  },
];

/**
 * 配信のときだけ、外の行き先を自前の行き先に付け替える。
 *
 * **保管庫の中の HTML は書き換えない**。書かれたままなら手元でファイルを開いても
 * 今までどおり見えるし（AGENTS.md の約束）、投稿し直さなくても既存のページが一斉に軽くなる。
 * 付け替えるのは行き先だけで、中身は 1 バイトも削っていないので、書ける幅は変わらない。
 */
export function withVendorScripts(html: string): string {
  html = html.replaceAll(DECK_FONT_BASE, "/vendor/deck-fonts/");
  let out = html;
  for (const { name, pattern } of VENDOR_REWRITES) {
    out = out.replace(pattern, `$1${vendorSrc(name)}$2`);
  }
  return out;
}

