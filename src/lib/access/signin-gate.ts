/**
 * 社内ページを、まだ名乗っていない人が開いたときに返す「門の紙」。
 *
 * ## なぜ 302 でログイン画面へ送らないか
 *
 * 送ってしまうと、**共有カードを作る相手が読むのはログイン画面**になる。
 * Slack や Notion に URL を貼ると、向こうは名乗り無しで取りに来て、302 の先まで
 * 追いかけて題と説明を拾う。その結果、どの社内ページを貼っても
 * 「Pages / 社内の図解・レポート置き場」という同じ札が出て、
 * 貼った本人にも読み手にも、それが何のリンクなのか分からなくなっていた。
 *
 * だから**同じ URL のまま**紙を返す。ここに書いてある固定の文言が、そのまま
 * カードの文言になる（src/lib/pages/og.ts の社内ページの決まりと同じ出どころ）。
 *
 * ## 中身に触れる文字を 1 つも置かない
 *
 * ページの名前も、書き出しの要約も、在るか無いかも、制限つきかどうかも出さない。
 * 受け取るのは**ログインしたあとの戻り先**と**カードの絵の在り処**だけで、
 * ページを指す値は受け取れない形にしてある（src/lib/access/no-access.ts と同じ筋）。
 * 呼ぶ側は保管庫を引く前にこれを返すので、当てに来た人に「そのページはある」と
 * 教えることにもならない。
 *
 * ## ログインの入口は増やさない
 *
 * ここに Google のボタンそのものは置かず、`/signin` へ渡す。名乗りの受け渡しは
 * src/auth.ts と src/app/signin/page.tsx が持っている 1 本きりの道で、こちらに写しを
 * 作ると、片方だけ決まりが変わった日に静かに食い違う。
 */

import { siteName } from "../settings/site-settings";
import { defaultTranslate } from "../i18n/default";
import { rt } from "../i18n/request";
import { organizationParams } from "../i18n/translate";
import { widgetOrganizationStamp } from "../organization/look";
import { escapeHtml, plainPage } from "../pages/plain-page";
import { safeInternalPath } from "../pages/safe-path";

/**
 * カードとタブと見出しに出す固定の文言。**ここが出どころ 1 つ。**
 *
 * 絵（src/app/api/og/locked）も src/lib/pages/og.ts の差し込みも、この 2 つを読む。
 * 3 か所に書き分けると、カードには「社内限定」と出るのに開いた先の言い方が違う、
 * という食い違いが起きる。
 *
 * 文は辞書から引く。カードは名乗りも言語の希望も持たない相手が作り、貼った部屋の全員に同じ 1 枚が出るので、
 * **カードの札は日本語の辞書の値で固定する**（言語で揺らさない）。開いた人が読む紙の本文だけ、その人の言語で書く。
 *
 * 札は要求の組織の名前で言う（「見本商事の限定ページ」）。名前は宛先に既に出ているので漏れにならない。
 * 差し込むのは組織の名前だけで、ページを指す値（題・要約・呼び名）は受け取らない。名前が分からなければ辞書の一般語。
 */
export function gateCard(organization: string | null): { readonly title: string; readonly description: string } {
  const params = organizationParams(organization);
  return { title: defaultTranslate("auth.gate.title", params), description: defaultTranslate("auth.gate.description", params) };
}

/**
 * カードの絵の道筋（src/app/api/og/locked）。絵は配信網に長く控えるので、組織の名前を変えたら別の道筋にする
 * （名前の印・src/lib/organization/look.ts の widgetOrganizationStamp と同じ。最初の組織 は印なし＝今までの道筋のまま）。
 * 名前を付けないカード（配布版・名前が読めない・ほかの組織の宛先の URL）は、一般語で描く道筋（`?o=0`）。
 * 絵の窓口は開いた宛先の組織の名前で描くので、名前を付けないカードに素の道筋を渡すと、その組織の名前の絵が付く。
 */
export const GENERIC_CARD_STAMP = "0";
export function lockedCardPath(organization: string | null): string {
  if (organization === null) return `/api/og/locked?o=${GENERIC_CARD_STAMP}`;
  const stamp = widgetOrganizationStamp({ name: organization, logo: null });
  return stamp === "" ? "/api/og/locked" : `/api/og/locked?o=${stamp.slice(2)}`;
}

export type SignInGateState = {
  /** ログインしたあとの戻り先（このサイト内の絶対パス）。版の指定もこれに含める */
  next: string;
  /** カードの絵の在り処（`https://…/api/og/locked`） */
  cardUrl: string;
  /** 要求の組織の名前（src/lib/organization/profile.ts）。読めなければ null（辞書の一般語） */
  organization: string | null;
};

/**
 * 門の紙 1 枚。
 *
 * 戻り先は必ず `safeInternalPath` を通す。ここへ来る値は呼ぶ側が組み立てたものだが、
 * 元をたどれば相手が打った URL なので、外のサイトへ送り出せる形になっていないことを
 * 出口でもう一度確かめる（通らなければ一覧へ返す）。
 */
export function signInGatePage(state: SignInGateState): string {
  const back = safeInternalPath(state.next) ?? "/";
  const card = gateCard(state.organization);
  const params = organizationParams(state.organization);

  return plainPage({
    // 組織の名前は管理者が付けた自由な字なので、題も札も escapeHtml を通す
    title: escapeHtml(card.title),
    head: cardTags(state.cardUrl, card),
    body:
      `<h1>${escapeHtml(rt("auth.gate.title", params))}</h1>` +
      `<p>${escapeHtml(rt("auth.gate.description", params))}</p>` +
      `<form action="/signin" method="get">` +
      `<input type="hidden" name="next" value="${escapeHtml(back)}">` +
      `<button type="submit">${escapeHtml(rt("auth.gate.open"))}</button>` +
      `</form>`,
  });
}

/**
 * カードの指定。**中身に触れない固定の文言と、固定の絵だけ。**
 *
 * `og:url` は書かない。ここは「そのページ」ではなく門の紙なので、自分を指す宛先を
 * 名乗ると、カードを覚える側がこの紙をページ本体として扱いうる。
 */
function cardTags(cardUrl: string, card: { readonly title: string; readonly description: string }): string {
  const url = escapeHtml(cardUrl);
  const title = escapeHtml(card.title);
  const description = escapeHtml(card.description);
  return (
    `<meta property="og:site_name" content="${escapeHtml(siteName())}">` +
    `<meta property="og:type" content="website">` +
    `<meta property="og:title" content="${title}">` +
    `<meta property="og:description" content="${description}">` +
    `<meta property="og:image" content="${url}">` +
    `<meta name="description" content="${description}">` +
    // 大きい札で出す指定だけを足す。題や絵を twitter: 側にも書かないのは、
    // あちらが無ければ og を見る決まりで、2 通り置くと片方だけ古くなるため
    `<meta name="twitter:card" content="summary_large_image">`
  );
}

/**
 * 200 で返す。
 *
 * 断りの紙（src/lib/access/no-access.ts）が 403 なのと、ここが 200 なのは役目が違うため。
 * あちらは「あなたには見せられない」という結論なので状態でそう言う。こちらは
 * 「ここが入口です」という**この紙自体が目的の中身**で、しかもカードを作る相手は
 * 200 でなければ中身を読まない（読まれなければ、また同じ札に戻る）。
 *
 * どこにも残さない指定は社内ページ本体と同じ。名乗った人と名乗っていない人で
 * 応答が変わる道筋なので、配信網に 1 枚でも焼き付いてはいけない。
 */
export function signInGateResponse(state: SignInGateState): Response {
  return new Response(signInGatePage(state), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
    },
  });
}
