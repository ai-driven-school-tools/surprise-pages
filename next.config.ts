import type { NextConfig } from "next";

/** よその枠に入れさせない画面（名乗りを渡す許可の画面）。増やすのは同じ種類の画面だけ。 */
const FRAME_DENIED_PATHS = ["/cli-login"] as const;

const FRAME_DENIED_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  /*
   * 配信時に見た目の指定を作る道具（Tailwind 3・ブラウザの道具と同じ版）。自分の置き場から
   * ファイルを読む作りなので、まとめ直さずに Node の読み込みのまま使う。
   */
  serverExternalPackages: [
    "tailwindcss-v3",
    /*
     * スライドの共有カードの絵（src/lib/deck/card/card-image.ts）が起こすブラウザ。どちらも自分の置き場から
     * 実行ファイルや固めた Chromium を読む作りなので、まとめ直さずに Node の読み込みのまま使う。
     * 固めた Chromium と書体の実体は `.deck-card-runtime/`（下の outputFileTracingIncludes）。
     */
    "playwright",
    "playwright-core",
    "@sparticuz/chromium",
  ],
  /*
   * 触れたリンクの先読み（src/app/_components/workspace-shell.tsx の IntentPrefetch）で取り寄せた画面の中身を、押したときに使ってよい長さ。
   * Next の既定は 5 分で、触れてから 4 分後に押すと 4 分前の一覧が出てしまう。触れてから押すまでは数秒なので 30 秒にする
   * （値の正本は src/lib/pages/prefetch-policy.ts の PREFETCH_FRESH_SECONDS。2 つは検査が突き合わせる）。
   */
  experimental: { staleTimes: { static: 30 } },

  // コメント機能のウィジェットと、外から取ってくるのをやめた 2 本
  // （見た目の指定を作る道具・絵記号）、そして投稿コマンドは、サーバ側で
  // 読み出して配信するため、Vercel の関数バンドルに必ず同梱する。
  // （ページ本体は保管庫から読むので、同梱するファイルは無い）
  outputFileTracingIncludes: {
    "/api/pages/deck-edit/create": ["./src/templates/deck.html", "./src/templates/deck-design.html"],
    // スライドの共有カードの絵。固めた Chromium と日本語の書体は node_modules ではなく、組み立ての前に写したもの（scripts/build/deck-card.mjs）。
    // Playwright の本体は丸ごと入れる——ブラウザ一覧の表（browsers.json）を読み込み時に動的に読むので、
    // 自動の追跡から漏れて「Cannot find module …/browsers.json」で落ちた（2026-10-08 のお試し公開）。
    // pnpm の実体の置き場（.pnpm/<名前>@<版>/…）を指す。繋ぎ（symlink）越しの指定は Vercel が断る
    "/api/og": ["./.deck-card-runtime/**/*", "./node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/**/*"],
    "/vendor/deck-fonts/*": ["./vendor/deck-fonts/*.woff2"],
    "/**/*": ["./src/widget/dist/*.js", "./vendor/**/*.js", "./bin/*"],
    // 見た目の指定を配信時に作る道具（src/lib/first-paint/delivery.ts）が、実行時に読む土台の CSS
    "/internal/[...slug]": ["./node_modules/tailwindcss-v3/lib/css/*.css"],
    "/public/[...slug]": ["./node_modules/tailwindcss-v3/lib/css/*.css"],
  },

  /**
   * 印（マーク）の行き先を 1 本に絞る。
   *
   * 正本は `src/app/icon.svg` ただ 1 つ。それでも `/favicon.ico` を残すのは、
   * **その道筋しか見に来ない相手がいる**ため（古いブラウザ、共有カードを作る取り込み役、
   * 昔のブックマーク）。同じ絵を .ico として置き直すと印が 2 つになり、
   * 片方だけ古い形が残る——だから置き直さず、同じ 1 枚へ流す。
   */
  rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon.svg" }];
  },

  /**
   * 以前の短い道筋（/i /p /h と画面の /me /new /tokens /admin）から、読める名前へ転送する。
   * 配った共有リンクが直るまでの保険。恒久（308）にはしない——古い道筋を正本と思わせないため。
   */
  redirects() {
    return [
      { source: "/i/:slug*", destination: "/internal/:slug*", permanent: false },
      { source: "/p/:slug*", destination: "/public/:slug*", permanent: false },
      { source: "/h/:slug*", destination: "/history/:slug*", permanent: false },
      { source: "/me", destination: "/activity", permanent: false },
      { source: "/new", destination: "/create", permanent: false },
      { source: "/decks/new", destination: "/decks/create", permanent: false },
      { source: "/tokens", destination: "/devices", permanent: false },
      { source: "/admin", destination: "/sharing", permanent: false },
    ];
  },

  /**
   * 検索よけの一番外側。ここは HTML かどうかに関係なく、
   * すべての応答（ページ・素材・API）の頭に付く。
   *
   * meta タグは HTML を読んでもらえる相手にしか効かないし、robots.txt は
   * 「見に来ないでほしい」という頼みでしかない。応答そのものに
   * 「載せないでほしい」と書いてあるのが一番強いので、3 枚重ねの土台にする。
   */
  headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      /*
       * 名乗りを渡す「許可する」の画面だけ、よそのサイトの枠（iframe）に入れさせない。
       * 透明な枠を重ねて「許可する」を押させる手口（クリックジャッキング）を止めるため。
       * サイト全体には広げない——ページを枠に入れて見せる使い方（埋め込み）を壊さないため。
       */
      ...FRAME_DENIED_PATHS.map((source) => ({ source, headers: FRAME_DENIED_HEADERS })),
    ];
  },
};

export default nextConfig;
