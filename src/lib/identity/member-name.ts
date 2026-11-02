/**
 * 人の呼び方と、「同じ人か」の見分け。**どちらもここ 1 つ。**
 *
 * どちらもアドレスと名前の 2 つだけから決まる計算で、保管庫にもログインにも触らない。
 * だからここは何も読み込まない葉っぱの置き場にしてある——名乗り（src/lib/identity/identity.ts）の中に
 * 置くと、版を読むだけの処理までログインの仕掛けを引き連れることになる。
 *
 * ## なぜ 1 つに集めたか
 *
 * 「名前が無い人はアドレスの @ より前で呼ぶ」という同じ 1 行が、4 か所に写してあった
 * （セッション・コメントの行・版の書き手・履歴）。写しは静かにずれる: 版の書き手だけ
 * `??` で書かれていたので、名前の欄が**空の文字**だった版は名前ごと消えて出ていた。
 * 呼び方を変えるなら 4 か所とも変わるのが正しいので、置き場も 1 つにする。
 */

/**
 * 画面に出す名前。名前が無い（空も同じ）ときはアドレスの @ より前で代える。
 *
 * `??` ではなく長さも見るのは、名前の欄に空の文字が入った行が現にあるため
 * （投稿の鍵に持ち主の名前が載っていなかった頃のもの）。空の名前は
 * 「名前が無い」と同じ扱いにする——出すと、そこに人が居ないように見える。
 */
export function displayNameOf(email: string, name: string | null): string {
  if (name !== null && name.trim().length > 0) return name;
  return email.split("@")[0];
}

/**
 * 同じ人か。大文字小文字と前後の空白は揃えてから比べる。
 *
 * アドレスは保存する側で小文字に揃えているものと、届いたままのものが混ざる
 * （版の書き手はログインや鍵から届いたまま）。素の `===` で比べると、
 * **同じ人が別人として出る**——名乗りの並びでは「検査用の人 ・ 検査用の人 が更新」に見える。
 */
export function sameEmail(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return false;
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * 保存先に置く・保存先で引くときのアドレスの形（小文字・前後の空白なし）。`sameEmail` がそろえる形と同じ。
 * 所属の名簿（organization_members）はこの形しか受けない（DB の check も同じ `lower(btrim())`）。
 */
export function emailKey(email: string): string {
  return email.trim().toLowerCase();
}
