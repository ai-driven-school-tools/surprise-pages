/**
 * ターミナルから開かれた画面が「どこへ届けるか」を決める。
 *
 * この画面はターミナルが開くもので、開くときに *手元の受け口の番号* と
 * *その場かぎりの合図* が付いてくる。届け先を素直に信じてしまうと、
 * 別のサイトから開かれたときに好きな相手へ投げさせられる。だから
 * ここで「番号として通せる形か」を先に落としてから組み立てる。
 *
 * 保管庫にもネットにも触らない。だから検査表からそのまま呼んで確かめられる。
 */

/** 通す番号の下限。1023 までは特別な用途に予約されている。 */
export const MIN_PORT = 1024;

/** 通す番号の上限。 */
export const MAX_PORT = 65535;

/** 数字だけ・4〜5 桁。頭に 0 が付くもの（08080）や符号付き（+80）は落とす。 */
const DIGITS = /^[1-9][0-9]{3,4}$/;

/** その場かぎりの合図。ターミナルが作る乱数と同じ形だけ通す。 */
const HANDSHAKE = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * 届け先を組み立てる。通せない番号なら null。
 *
 * 行き先は必ず自分のパソコン（127.0.0.1）に固定する。番号だけを外から受け取る。
 * ホスト名まで受け取れるようにすると、この画面が他所へ値を運ぶ道具になってしまう。
 */
export function localTarget(port: unknown): string | null {
  if (typeof port !== "string") return null;
  if (!DIGITS.test(port)) return null;

  const value = Number(port);
  if (!Number.isInteger(value)) return null;
  if (value < MIN_PORT || value > MAX_PORT) return null;

  return `http://127.0.0.1:${value}/`;
}

/** その場かぎりの合図を読む。形が違えば null。 */
export function usableState(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return HANDSHAKE.test(value) ? value : null;
}

/**
 * ターミナルが送ってきたパソコンの名前を、一覧に並べられる形にする。
 *
 * この名前は URL から来る。改行や制御文字が混ざると、一覧の 1 行が崩れたり、
 * 端末に貼ったときに見た目を作り替えられたりする。文字として無害なものだけ残す。
 * 長さを切るのは呼び出し側（覚え書きの長さの決めは 1 か所しかない）。
 */
export function computerName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ");
}

/** 画面から渡ってきた 1 つ目の値だけを見る（?port=1&port=2 のような形を弾く）。 */
export function firstValue(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * 投稿コマンドが「組織を選ばせて」と頼んだか（`choose=1`）。知らない値は無いものとして扱う。
 * 頼まない古い投稿コマンドには、今までどおり根の組織の許可だけを出す（選んだ組織の鍵を、古い道具は 最初の組織 の鍵として控えてしまう）。
 */
export function chooseRequested(value: unknown): boolean {
  return value === "1";
}
