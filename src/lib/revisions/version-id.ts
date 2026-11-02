import { createHash } from "node:crypto";

/**
 * 版の目印（version_id）を計算する。
 *
 * git が黙って提供していた「あとから途中だけ差し替えられない」性質を、ここで作り直す。
 * 目印は **1 つ前の版の目印も材料に混ぜて** 作るので、版は数珠つなぎになる。
 * 途中の 1 枚を書き換えると、その先の目印が全部合わなくなり、必ず表に出る。
 *
 * ここには保管庫（Supabase）もファイルの読み書き（node:fs）も持ち込まない。
 * 検査表（tests/checks/check-revision-chain.mjs）がこのファイルだけを組み立てて
 * 実際に呼ぶので、外の世界に触る部品が混ざると走らせられなくなる。
 */

export type RevisionSeed = {
  /** 1 つ前の版の目印。最初の版は null */
  parentVersionId: string | null;
  /** ページの呼び名。`<見せ方>/<場所>`（例: internal/example/hello） */
  pageSlug: string;
  /** 版の番号。1 始まり */
  versionNumber: number;
  authorEmail: string;
  /** 積んだ時刻（ISO 文字列） */
  createdAt: string;
  html: string;
};

/**
 * 材料 1 つぶんの書き方。**中身の前にそのバイト数を書く**（`8:internal` の形）。
 *
 * 区切り文字（改行など）でつなぐ形にしない。あれは「どの材料にもその文字が入らない」
 * という前提の上に全部が乗っていて、前提が崩れた瞬間に別の組み合わせが同じ材料へ
 * 化ける。たとえば隣り合う 2 つが `a` と `b\nc` のとき、`a\nb` と `c` でも
 * つないだ結果は `a\nb\nc` で同じになり、**違う版に同じ目印が付く**。
 * 材料を足す人・順番を変える人・本文以外に改行が入る道を作る人が、
 * それに気づかずに衝突を作れてしまう。
 *
 * 長さを先に書いておけば、中身に何が入っていても切れ目が一意に決まる。
 * 前提が要らないので、あとから触る人が壊せない。
 *
 * **この順序と形は変えてはいけない。** 変えると、すでに積んである版の目印を
 * 二度と計算し直せなくなる（＝改ざんを見つける手立てを自分で捨てることになる）。
 */
function measured(value: string): string {
  return `${Buffer.byteLength(value, "utf8")}:${value}`;
}

/**
 * 目印の長さ。
 *
 * sha256 は 64 桁だが、git のコミット sha と同じ 40 桁に切ってある。
 * 形をそろえておくと、いま動いている次のものが 1 つも変更なしでそのまま生きる:
 *   ・過去の版を見る URL（`?v=<目印>`）
 *   ・当時の素材の URL（`/@v/<目印>/<ファイル>`）
 *   ・版の指定が正しいかの判定（src/lib/revisions/revisions.ts の isVersionSha）
 *   ・画面に出す短縮表示（先頭 7 桁）
 */
export const VERSION_ID_LENGTH = 40;

export function computeVersionId(seed: RevisionSeed): string {
  const material = [
    seed.parentVersionId ?? "",
    seed.pageSlug,
    String(seed.versionNumber),
    seed.authorEmail,
    seed.createdAt,
    seed.html,
  ]
    .map(measured)
    .join("");

  return createHash("sha256").update(material, "utf8").digest("hex").slice(0, VERSION_ID_LENGTH);
}

/** 40 桁の 16 進小文字。データベース側の制約（0004_pages.sql）と同じ形。 */
const VERSION_ID = /^[0-9a-f]{40}$/;

export function isVersionId(value: unknown): value is string {
  return typeof value === "string" && VERSION_ID.test(value);
}
