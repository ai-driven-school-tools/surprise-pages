/**
 * 見られない人に返す 403 の画面。
 *
 * 302 でログイン画面へ送らない。送られた人は「ログインし直せば開く」と思って
 * 同じことを繰り返すだけで、**誰に頼めば開くのか**が最後まで分からない。
 * だから状態は 403 のまま、その場で「見せてほしい」と言える導線を出す。
 *
 * **中身に触れる文字を 1 つも置かない。** ページの名前も、書き出しの要約も、
 * 誰が持ち主かも出さない。断られている人に見せてよい情報が無いため
 * （社内ページの見出しカードに中身を載せない決まりと同じ筋。src/lib/pages/og.ts）。
 *
 * 素の HTML を組み立てているのは、ここを返すのが画面（React）ではなく
 * 配信の口（Route Handler）だから。外枠（余白・ボタンの形・検索よけ・印）は
 * src/lib/pages/plain-page.ts が 1 つ持っていて、ここはその中に入れる文字だけを決める。
 */

import { escapeHtml, plainPage } from "../pages/plain-page";
import { rt } from "../i18n/request";

/**
 * 押したときの動き。
 *
 * どのページの話かは **URL から自分で組み立てる**（`/internal/foo/bar` → `internal/foo/bar`）。
 * 呼び名を本文に埋め込むと、断った相手に返す紙の上へ、そのページを指す文字が載る。
 * ここに置かなければ、載っていないことを目で確かめられる。
 *
 * 押したあとの字（送っています…・もう一度送る）は見ている人の言語で、組み立てるときに埋め込む。
 */
const script = (sending: string, retry: string) => `
(function () {
  var ask = document.getElementById("ask");
  var sent = document.getElementById("sent");
  if (ask === null || sent === null) return;
  ask.addEventListener("click", function () {
    ask.disabled = true;
    ask.textContent = ${JSON.stringify(sending)};
    var slug = "internal" + location.pathname.replace(/^\\/internal(?=\\/|$)/, "").replace(/\\/$/, "");
    fetch("/api/access-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageSlug: slug }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("ng");
        ask.hidden = true;
        sent.hidden = false;
      })
      .catch(function () {
        ask.disabled = false;
        ask.textContent = ${JSON.stringify(retry)};
      });
  });
})();
`;

/** すでにお願いを出してあるか。出してあるならボタンを出さない（二重に送らせない）。 */
export type NoAccessState = { requested: boolean };

/**
 * 断りの紙 1 枚。
 *
 * 受け取るのは「もう頼んであるか」だけ。ページを指す値は一切受け取らない
 * ——受け取れないようにしてあるので、うっかり載せようがない。
 * 文は見ている人の言語（要求の外では日本語）。
 */
export function noAccessPage(state: NoAccessState): string {
  const ask = state.requested
    ? ""
    : `<button type="button" id="ask">${escapeHtml(rt("app.noAccess.request"))}</button>`;

  const sent = `<p id="sent"${state.requested ? "" : " hidden"}>${escapeHtml(rt("app.noAccess.sent"))}</p>`;

  return plainPage({
    title: escapeHtml(rt("app.noAccess.title")),
    body:
      `<h1>${escapeHtml(rt("app.noAccess.title"))}</h1>` +
      `<p>${escapeHtml(rt("app.noAccess.detail"))}</p>` +
      ask +
      sent +
      `<a href="/">${escapeHtml(rt("app.noAccess.backToList"))}</a>`,
    script: script(rt("app.noAccess.sending"), rt("app.noAccess.retry")),
  });
}

/** 403 として返す。社内の中身と同じ扱いで、どこにも残さない。 */
export function noAccessResponse(state: NoAccessState): Response {
  return new Response(noAccessPage(state), {
    status: 403,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
    },
  });
}
