import { ImageResponse } from "next/og";

import { GENERIC_CARD_STAMP, gateCard, lockedCardPath } from "@/lib/access/signin-gate";
import { currentShareableOrganizationName } from "@/lib/i18n/server";

import { Card, CARD_SIZE } from "../card";

export const runtime = "nodejs";

/**
 * 社内ページを共有したときに出るカードの絵。
 *
 * ## 中身を 1 文字も持たない
 *
 * どのページを指していても**まったく同じ 1 枚**（組織ごとに名前だけが違う）。呼び名も受け取らないので、
 * うっかり載せようがない（src/lib/access/no-access.ts の 403 の紙と同じ作り）。
 * 文言は門の紙と同じ出どころから読む——カードには「社内限定」と書いてあるのに
 * 開いた先の文言が違う、という食い違いが起きないように。
 *
 * ## だから長く持たせてよい
 *
 * 中身に触れないので、配信網にも相手の手元にも置いたままでよい。
 * ここだけ長い持ち時間にしてあるのは、社内ページを貼るたびに絵を作り直さないため。
 */
const FOREVER = "public, max-age=86400, s-maxage=31536000, immutable";

/** 控えさせない（組織の名前が読めなかった・道筋の名前の印がいまの名前と合わない絵を、配信網に 1 年残さない）。 */
const NO_STORE = "private, no-store";

/**
 * 札は要求の組織の名前で言う。名前を変えたら門の紙が別の道筋（`?o=`）を指すので、いまの名前の道筋で来た絵だけを長く控える。
 * - `?o=0` … 名前を付けないカード（配布版・ほかの組織の宛先の URL・名前が読めなかった紙）。一般語で描き、長く控える
 * - それ以外 … 開いた宛先の組織の名前（配布版は出さない）。読めなかった・道筋の印がいまの名前と違うときは一般語か今の名前で描き、控えさせない
 */
export async function GET(request: Request): Promise<Response> {
  const asked = new URL(request.url).searchParams.get("o");
  const generic = asked === GENERIC_CARD_STAMP;
  const name = generic ? null : await currentShareableOrganizationName();
  const card = gateCard(name);
  const steady = generic || (name !== null && new URL(lockedCardPath(name), request.url).search === new URL(request.url).search);
  return new ImageResponse(<Card title={card.title} summary={card.description} />, {
    ...CARD_SIZE,
    headers: { "cache-control": steady ? FOREVER : NO_STORE },
  });
}
