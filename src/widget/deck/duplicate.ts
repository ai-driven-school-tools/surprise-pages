/**
 * 道具箱の ⋯ の「この資料を複製」（スライドのいまの版を、直せる人が開いているときだけ）。
 *
 * 押すと複製の窓口（src/app/api/pages/deck-edit/duplicate）へ、このページと見ている版だけを送る。本文は送らない
 * （サーバーが直せる人の門を通して読む）。できた資料の編集画面へそのまま移る。断られたら理由の 1 行を知らせに出す。
 * 送っている間に押し直しても 2 つ作らない（同じ目印で送り直すと、サーバーは同じ写しを返す）。
 */
import { t } from "../shared/i18n";

const DUPLICATED_URL = /^\/internal\/decks\/[a-f0-9]{32}\?edit=1$/;
let pending: { requestId: string; versionId: string } | null = null;

export async function duplicateDeck(page: string, versionId: string, fail: (message: string) => void): Promise<void> {
  if (pending?.versionId !== versionId) pending = { requestId: crypto.randomUUID(), versionId };
  let status = 0, body: unknown = null;
  try {
    const response = await fetch("/api/pages/deck-edit/duplicate", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: pending.requestId, page, versionId }),
    });
    status = response.status;
    body = await response.json().catch(() => null);
  } catch {
    // 届かなかったときは目印を残す。押し直せば同じ写しになる
    fail(t("toolbox.bar.duplicateFailed"));
    return;
  }
  const url = typeof body === "object" && body !== null && "url" in body ? body.url : null;
  if (status >= 200 && status < 300 && typeof url === "string" && DUPLICATED_URL.test(url)) {
    pending = null;
    location.assign(url);
    return;
  }
  // 断られた（作られていないと分かる）ので目印を捨てる
  pending = null;
  const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : t("toolbox.bar.duplicateFailed");
  fail(message);
}
