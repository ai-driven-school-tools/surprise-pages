import { ImageResponse } from "next/og";
import { currentOrganization } from "@/lib/organization/scope";
import { openPage } from "@/lib/access/access";
import { parsePageSlug } from "@/lib/comments/comments";
import { withoutDeckNotes } from "@/lib/pages/content";
import { isDeckHtml } from "@/lib/deck/deck";
import { deckSlideParam } from "@/lib/deck/card/card";
import { renderDeckSlideImage } from "@/lib/deck/card/card-image";
import { publicCacheControl } from "@/lib/pages/cache";
import { pageRefOf, readHtmlOf } from "@/lib/pages/store";
import { summaryOf, titleOf } from "@/lib/html/text";
import { siteName } from "@/lib/settings/site-settings";

import { Card, CARD_CACHE, CARD_SIZE } from "./card";

export const runtime = "nodejs";
/** スライドはブラウザを起こして描く。起こす時間と描く予算（src/lib/deck/card/card-image.ts）を含めて収める。 */
export const maxDuration = 60;

/**
 * 共有したときに出る見出しカードの絵。
 *
 * 文言は必ずページ本体から採る。URL の文字をそのまま絵にすると、
 * この置き場が「好きな文字を載せた画像を作れる道具」になってしまう。
 *
 * 公開ページのぶんだけ作る。社内ページのカードは中身に触れない固定の文言なので、
 * 絵も固定の 1 枚で足りる（/api/og/locked）。
 *
 * 門は**「名乗っていない人」として**通す。この絵は誰の手にも渡りうる（Slack や X に
 * 貼った URL の先で、ログインしていない人の画面に出る）ので、名乗りを見て
 * 出し分けてはいけない。制限つきのページは名乗っていない人には開けないので、
 * ここで断られる（＝カードの絵にならない）。
 *
 * ## スライドは枚そのものを絵にする
 *
 * 本文がスライド（deck）なら、1 枚目（`?slide=N` ならその枚）を本物のブラウザで描いて
 * そのまま返す（src/lib/deck/card/card-image.ts）。表紙は「何の資料か」を伝えるために作られて
 * いるので、白地に題名を置き直すより、表紙そのものを見せるほうが貼られた場所で分かる。
 * 描けなかったときだけ、今までどおりの文字のカードへ落ちる。
 *
 * `v`（版の目印）は中身を決めない——いまの版を描く。配信網と Slack が絵を控える鍵を
 * 版ごとに分けるためだけに受ける（src/lib/deck/card/card.ts の `deckCardImageUrl`）。
 *
 * 控えの長さは、そのページの素材を公開の URL から配るときと同じ（`publicCacheControl`）。
 * 切り替えでやめられるページは短く——絵には枚の中身が丸ごと載るので、
 * 公開をやめたあとに配り続けない。
 */
export async function GET(request: Request): Promise<Response> {
  const organization = await currentOrganization();
  const params = new URL(request.url).searchParams;
  const page = parsePageSlug(params.get("page"));
  if (page === null) return new Response("not found", { status: 404 });

  const gate = await openPage(organization, null, page.slug);
  if (!gate.ok || gate.page.visibility !== "public") {
    return new Response("not found", { status: 404 });
  }

  const stored = await readHtmlOf(gate.page);
  if (stored === null) return new Response("not found", { status: 404 });

  // スライドの発表者のメモは、公開の配信（src/app/public）と同じく絵にも載せない
  const html = withoutDeckNotes(stored);

  const ref = pageRefOf(gate.page.pageSlug);
  if (ref !== null && isDeckHtml(html)) {
    const origin = new URL(request.url).origin;
    const image = await renderDeckSlideImage({
      html,
      pageHref: `${origin}/public/${ref.slug.join("/")}`,
      slide: deckSlideParam(params.get("slide")) ?? 1,
    });
    if (image !== null) {
      return new Response(new Uint8Array(image), {
        headers: {
          "content-type": "image/png",
          // 呼び名が internal のまま公開になっているページは、切り替えでやめられる
          "cache-control": publicCacheControl(ref.slugPrefix === "internal", "asset"),
        },
      });
    }
  }

  return new ImageResponse(<Card title={titleOf(html) ?? siteName()} summary={summaryOf(html, 90)} />, {
    ...CARD_SIZE,
    headers: { "cache-control": CARD_CACHE },
  });
}
