import type { MetadataRoute } from "next";

/**
 * 検索エンジンへの門前払い。どの取り込み役にも、どこも見に来ないでほしいと伝える。
 *
 * これは頼みごとでしかないので、これ 1 枚には頼らない。
 * 応答の頭に付く X-Robots-Tag（next.config.ts）と、
 * ページ本体に差し込む meta（src/lib/pages/og.ts）と合わせて 3 枚重ねにしている。
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
