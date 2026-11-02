import { listRevisionsOf, readRevisionHtmlOf, toPageVersion, type StoredPage } from "../pages/store";
import type { PageVersion } from "../comments/types";
import { defaultTranslate } from "../i18n/default";

/**
 * ページ本文の履歴の読み口。
 *
 * 正本は保管庫（pages / page_revisions）。ここはそれを画面の形に移すだけで、
 * 版の写しも本文の写しも持たない。積むほう（投稿）は src/lib/pages/store.ts。
 *
 * 以前は GitHub の API を叩いていた。読み口をこちらへ寄せたことで
 * 履歴に外部の鍵が要らなくなり、版を開くたびの通信も無くなっている。
 */

/**
 * 履歴を出せるか。**いまは必ず出せる**（保管庫が正本になり、鍵が要らなくなったため）。
 *
 * 常に true なのに関数を残しているのは、ブラウザ側が `features.history` の旗を見て
 * 履歴のボタンを出し分けているから。関数ごと消すと出し分けの筋が切れる。
 * 旗そのものは残し、値だけを「いつでも真」に変える。
 */
export function historyAvailable(): boolean {
  return true;
}

/**
 * 版の指定として受け付ける形（7〜40 桁の 16 進）。
 *
 * 40 桁ちょうどが版の目印そのもの。短い桁も受けるのは、
 * `?v=` に画面の短縮表示（先頭 7 桁）を貼る使い方が既にあるため。
 */
const SHA = /^[0-9a-f]{7,40}$/i;

export function isVersionSha(value: unknown): value is string {
  return typeof value === "string" && SHA.test(value);
}

/**
 * 保存された一言から、人に読ませる部分だけを取り出す。
 *
 * 版の一覧で主役にしたいのは「誰が・いつ・どれだけ直したか」で、
 * `feat:` のような書き分けの記号や末尾のチケット番号は、読む人の用事ではない。
 * 落とすのは頭と尻の決まった形だけで、本文には手を入れない。
 *
 * 投稿の入口（src/app/api/pages/route.ts）でも同じ関数を通してから保存している。
 * 2 度通しても結果は変わらない形にしてあるので、読む側にも置いて、
 * 引っ越し前に入った古い一言も同じ見た目にそろえる。
 */
const MACHINE_PREFIX =
  /^(feat|fix|docs|chore|refactor|style|test|perf|build|ci|revert|pages)(\([^)）]*\))?!?\s*[:：]\s*/i;
const TICKET_SUFFIX = /\s*[（(][A-Za-z][A-Za-z0-9]*-\d+[）)]\s*$/;

export function humanMessage(message: string): string {
  const line = message.split("\n")[0].trim();
  const plain = line.replace(MACHINE_PREFIX, "").replace(TICKET_SUFFIX, "").trim();
  // 投稿の入口でも通して保存するので、保存先には日本語の正本の文を置く（出す側が localizeStored で訳す）
  return plain.length > 0 ? plain : defaultTranslate("common.noDescription");
}

/** 版の一覧と、「これより前にもまだ版があるか」。 */
export type VersionPage = { versions: PageVersion[]; more: boolean };

/**
 * そのページの版を新しい順に返す。
 *
 * 頼まれた数より 1 つ多く取りに行く。多く取れたら「まだ前がある」と分かり、
 * 一覧の最下段を「これが最初の版です」と言い切ってよいかを判断できる。
 * 多く取った 1 つは返さない（頼まれた数までに切る）。
 *
 * 赤入れの件数は積むときに数えて列に入れてあるので、ここでは読むだけ。
 * 履歴を開くたびに版の本文を何本も取り直して数え直すことはしない。
 */
export async function listVersions(page: StoredPage, limit = 30): Promise<VersionPage> {
  const wanted = Math.min(99, Math.max(1, limit));
  const found = await listRevisionsOf(page, wanted + 1);

  const more = found.length > wanted;
  const versions = found.slice(0, wanted).map((revision) => {
    const version = toPageVersion(revision);
    return { ...version, message: humanMessage(version.message) };
  });
  return { versions, more };
}

/**
 * その版のときの本文。無ければ null。短い桁の指定でも、そのページの中から引く。
 *
 * 受け取るのが呼び名ではなく**引き当て済みのページ**なのは、門（src/lib/access/access.ts の
 * `openPage`）を通らずに過去の本文へ手が届く道を残さないため。
 */
export async function readFileAt(page: StoredPage, versionId: string): Promise<string | null> {
  if (!isVersionSha(versionId)) return null;
  return readRevisionHtmlOf(page, versionId);
}
