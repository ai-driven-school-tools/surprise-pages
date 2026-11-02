/**
 * ブラウザへ配る量の基準線の判断。ファイルは読まない。
 *
 * 増えること自体は正当な場合があるので、増えても赤にしない。警告を出し、増やすと決めたら控えを取り直す
 * （取り直した差分が PR に残り、それが「増やすと決めた」記録になる）。
 */

/** 量は gzip で縮めた後のバイト数（回線を流れる量に近い）。 */
export const UNIT = "gzip";

/**
 * 控えからこれ以上増えたら警告。組み立てる機械の違いで数十バイトは揺れるので、0 にはしない。
 * 「1% と 2KB の大きいほう」——小さい入口では 2KB、大きい入口では割合で見る。
 */
export const TOLERANCE_RATIO = 0.01;
export const TOLERANCE_BYTES = 2048;

export const allowance = (baseline) => Math.max(TOLERANCE_BYTES, Math.round(baseline * TOLERANCE_RATIO));

/** 画面の名前。道筋のまとめ用の区切り（かっこ付き）と末尾の /page は、URL に出ないので落とす。 */
export function screenName(key) {
  const parts = key.split("/").filter((part) => part && !/^\(.+\)$/.test(part));
  if (parts.at(-1) === "page") parts.pop();
  return `/${parts.join("/")}`;
}

export function parseBaseline(text) {
  const value = JSON.parse(text);
  const entries = value?.entries;
  if (value?.unit !== UNIT || entries === null || typeof entries !== "object" || !Object.keys(entries).length ||
      Object.values(entries).some((bytes) => !Number.isInteger(bytes) || bytes < 1)) {
    throw new Error("配る量の控えが空か、形式が正しくありません");
  }
  return entries;
}

/**
 * 控えと測った値を比べる。
 *   grown   … 余裕を超えて増えた（警告）
 *   added   … 控えに無い入口（警告。控えを取り直すと消える）
 *   removed … 控えにあるのに測れなかった入口（警告。黙って見張りから外れるのを防ぐ）
 *   shrunk  … 余裕を超えて減った（知らせるだけ。控えを取り直すと、次に増えたときに気づける）
 */
export function compare(baseline, measured) {
  const result = { grown: [], added: [], removed: [], shrunk: [] };
  for (const [name, bytes] of Object.entries(measured)) {
    const was = baseline[name];
    if (was === undefined) result.added.push({ name, bytes });
    else if (bytes > was + allowance(was)) result.grown.push({ name, was, bytes });
    else if (bytes < was - allowance(was)) result.shrunk.push({ name, was, bytes });
  }
  for (const [name, was] of Object.entries(baseline)) if (measured[name] === undefined) result.removed.push({ name, was });
  return result;
}

export const kb = (bytes) => `${(bytes / 1024).toFixed(1)}KB`;
export const signed = (bytes) => `${bytes >= 0 ? "+" : "-"}${kb(Math.abs(bytes))}`;
