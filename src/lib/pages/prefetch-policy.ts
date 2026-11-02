/**
 * 押す前に取り寄せておく（先読み）の決まり。何をいつ先読みするかはここ 1 か所が決める（docs/design/app-speed.md の「先読み」）。
 *
 *   画面（ホーム・会社の資料など） … リンクの上にマウスを止めた・キーで選んだまま 0.1 秒たったら、Next の画面の中身を取り寄せる。
 *                                   押した瞬間に出せる。指で触れたとき（触れてから押すまでが短い）はしない。
 *                                   リポジトリの文書とフォルダ（/repositories/…）も同じ。見た記録は枠（/r/…）を配ったときに
 *                                   積むので、取り寄せただけでは「見た」にならない
 *                                   入口は src/app/_components/workspace-shell.tsx の IntentPrefetch
 *   資料（/internal/・/public/）               … ブラウザの標準の先読み（Speculation Rules）で、裏で資料を開いておき、押した瞬間に差し替える。
 *                                   とどまって 0.1 秒で、触れた 1 枚だけを裏で開き始める（IntentPrefetch が宣言を差し込む）。
 *                                   宣言を差し込めないとき・指で触れたときは、ブラウザが 0.2 秒か押し始めで始める（moderate）
 *
 * 見える範囲に入っただけでは取り寄せない（一覧の 50 行ぶんを毎回サーバーに描かせない）。触れたものだけ。
 * 先読みで開いた資料は、表に出るまで「見た」と控えない（src/widget/comments/comments.ts の rememberView）。
 */
import { HOME_PLACE, MINE_PLACE, FAVORITES_PLACE, ACTIVITY_PLACE, LIBRARY_PLACE } from "../workspace/places";

/** 触れたら中身を取り寄せてよい画面（道筋がこのどれかと完全に一致するもの。問い合わせ（?以降）は付いていてよい）。 */
export const PREFETCH_SCREENS: readonly string[] = [
  HOME_PLACE.href, MINE_PLACE.href, FAVORITES_PLACE.href, ACTIVITY_PLACE.href, LIBRARY_PLACE.href, "/settings",
];

/**
 * 同じ行き先をもう一度取り寄せるまでの間（ms）。Next が取り寄せた中身を使ってよい長さ（next.config.ts の
 * `experimental.staleTimes.static`）と同じにする——触れてから押すまでの数秒の間に古くならず、
 * 30 秒より前に触れた中身は使わずに取り直す。
 */
export const PREFETCH_FRESH_SECONDS = 30;

/**
 * リンクの上にこれだけとどまったら先読みを始める（ms）。通り過ぎただけ・すぐ押したときは始めない。
 * Next は届く前の先読みを待たずに同じ画面を取りに行くので、押す直前に始めるとサーバーが同じ画面を 2 度描く。
 * ブラウザの標準の先読み（moderate は 0.2 秒）より短くし、画面の先読みに使える時間を残す。
 */
export const PREFETCH_HOVER_MS = 100;

/**
 * 触れたリンクの行き先が、先読みしてよい画面か。よそのサイト・新しい窓・保存のリンク・いま居る画面は先読みしない。
 * 返すのは取り寄せる行き先（道筋＋問い合わせ）。先読みしないなら null。
 */
export function prefetchTarget(
  link: { href: string; target: string; hasDownload: boolean },
  here: { origin: string; pathname: string; search: string },
): string | null {
  if (link.hasDownload || (link.target !== "" && link.target !== "_self")) return null;
  let url: URL;
  try {
    url = new URL(link.href, here.origin);
  } catch {
    return null;
  }
  if (url.origin !== here.origin) return null;
  if (!PREFETCH_SCREENS.includes(url.pathname)) return null;
  if (url.pathname === here.pathname && url.search === here.search) return null;
  return `${url.pathname}${url.search}`;
}

/** 裏で開いてよい資料のリンク（行の題とサイドバーのお気に入り）。素材（画像・動画）や保存のリンクは資料ではないので含めない。 */
export const DOCUMENT_LINK_SELECTOR = "a.ws-row-title, a.ws-nav-item";

/**
 * 触れたリンクの行き先が、裏で開いてよい資料か。返すのは裏で開く行き先（同じ宛先の /internal/・/public/。問い合わせ・飛び先は付いたまま）。
 * 一覧の行の題とお気に入り（`listed`）だけ。よそのサイト・新しい窓・保存のリンク・いま居るページは開かない。
 */
export function prerenderTarget(
  link: { href: string; target: string; hasDownload: boolean; listed: boolean },
  here: { origin: string; pathname: string; search: string },
): string | null {
  if (!link.listed || link.hasDownload || (link.target !== "" && link.target !== "_self")) return null;
  let url: URL;
  try {
    url = new URL(link.href, here.origin);
  } catch {
    return null;
  }
  if (url.origin !== here.origin) return null;
  if (!url.pathname.startsWith("/internal/") && !url.pathname.startsWith("/public/")) return null;
  if (url.pathname === here.pathname && url.search === here.search) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * 触れた資料 1 枚を、すぐ裏で開く宣言。URL を並べる形の宣言は、書いた瞬間に始まる（決まりの既定・immediate）。
 * 古いブラウザが知らない名前で宣言ごと捨てないよう、始める時期は書かない。
 * 差し込むのはいつも 1 枚だけ（別の資料に触れたら差し替える。外した宣言の裏開きはブラウザがやめる）。
 */
export function documentPrerenderRules(target: string): string {
  return JSON.stringify({ prerender: [{ urls: [target] }] });
}

/**
 * 資料の先読みの宣言（`<script type="speculationrules">` の中身）。触れた 1 枚を 0.1 秒で開き始める差し込み
 * （`documentPrerenderRules`）の受け皿で、こちらは触れて 0.2 秒とどまったとき・押し始めたとき（moderate）。
 * 指で触れたとき（とどまらない）と、差し込みが動く前に押したときに効く。対応しないブラウザ・アプリでは何も起きない
 * （今までどおり押してから読む）。素材（画像・動画）や保存のリンクは資料ではないので、行の題のリンクだけに絞る。
 */
export const DOCUMENT_SPECULATION_RULES = JSON.stringify({
  prerender: [
    {
      where: {
        and: [
          { href_matches: ["/internal/*", "/public/*"] },
          { selector_matches: DOCUMENT_LINK_SELECTOR },
          { not: { selector_matches: "[download], [target=_blank]" } },
        ],
      },
      eagerness: "moderate",
    },
  ],
});
