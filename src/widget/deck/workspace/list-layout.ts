/**
 * スライドの一覧の並べ方（DOM に触らない決まりだけ・単体検査あり）。
 *
 * 一覧は 3 つの形を行き来する。
 * - rail : 今の縦一覧（1 列・番号の溝と字下げ）。右に 1 枚と調整パネル
 * - split: 一覧の右端を引いて広げた 2〜3 列の格子。右に 1 枚
 * - full : 「一覧で見る」。一覧が編集画面の全面に重なる 4・6・8 列（狭い画面は 1・2・3 列）
 * 番号はどの形でも通し番号（フッターの「n / N」・深いリンクの #7 と同じ）。階層は行の改め方と畳んだ紙の縁で見せる。
 */
export type ListMode = "rail" | "split" | "full";
export type ListView = { mode: ListMode; columns: number };

/** 縦一覧の絵の幅（一覧の幅 200 − 左右の余白 8・12 − 番号の溝 20 − 溝との間 8）。格子の 1 枚はこれより細くしない */
export const LIST_CELL_MIN = 152;
/** 格子の左右の余白（space-4 を両側）と、枚の間（space-4）。CSS（src/widget/deck/workspace/list-grid.ts の LIST_GRID_STYLES）と同じ値 */
export const GRID_PAD = 32, GRID_GAP = 16;
/** 格子の 1 枚の絵の下に並ぶ番号の行（space-5）と、その上の間（space-1） */
export const GRID_NUMBER_ROW = 24 + 4;
/** 縦一覧の幅（--studio-left の既定） */
export const LIST_RAIL_WIDTH = 200;
export const SPLIT_COLUMNS = [1, 2, 3] as const;
export const FULL_COLUMNS = [4, 6, 8] as const;
export const NARROW_FULL_COLUMNS = [1, 2, 3] as const;

/** 列の数ちょうどに収まる一覧の幅。1 列は縦一覧の幅 */
export function widthForColumns(columns: number): number {
  if (columns <= 1) return LIST_RAIL_WIDTH;
  return GRID_PAD + columns * LIST_CELL_MIN + (columns - 1) * GRID_GAP;
}

/** 一覧の幅 → 列の数（1〜3）。幅は指に付いて途切れず動き、列は閾値を越えたときだけ増減する */
export function columnsForWidth(width: number): number {
  if (width >= widthForColumns(3)) return 3;
  if (width >= widthForColumns(2)) return 2;
  return 1;
}

/** 引いて広げられる幅の範囲。一覧と 1 枚で分ける幅（作業場から右の調整パネルを除いた幅）の半分は 1 枚に残す（3 列ちょうどより 1 枚ぶんまでは広げられる） */
export function listWidthRange(workspace: number): { min: number; max: number } {
  const max = Math.max(LIST_RAIL_WIDTH, Math.min(Math.floor(workspace / 2), widthForColumns(3) + LIST_CELL_MIN));
  return { min: LIST_RAIL_WIDTH, max };
}

/** 列の数を 1 つ増やす・減らす（- と =）。その形の選択肢の中で隣へ。端では止まる */
export function stepColumns(choices: readonly number[], current: number, step: 1 | -1): number {
  const index = choices.indexOf(current);
  if (index < 0) return (step > 0 ? choices.find(value => value > current) : [...choices].reverse().find(value => value < current)) ?? current;
  return choices[Math.max(0, Math.min(choices.length - 1, index + step))];
}

/**
 * 格子で行を改める枚。子を持つ根の枚（章の頭）と、章が終わった直後の根の枚。
 * 章の子は章の頭と同じ行から続けて並べる（列の数で折り返すだけ）。畳んだ章は 1 枚として前後と同じ行に流す
 */
export function rowStarts(entries: readonly { id: string; parent: string | null }[], folded: ReadonlySet<string> = new Set()): Set<string> {
  const chapters = new Set(entries.flatMap(entry => entry.parent === null ? [] : [entry.parent]));
  const starts = new Set<string>();
  let inChapter = false;
  for (const entry of entries) {
    if (entry.parent !== null) continue;
    const chapter = chapters.has(entry.id) && !folded.has(entry.id);
    if (chapter || inChapter) starts.add(entry.id);
    inChapter = chapter;
  }
  return starts;
}

/** 格子の矢印の行き先。見えている枚の箱（上端・左端）から、同じ行の隣か、上下の行の一番近い列へ */
export function gridStep(boxes: readonly { id: string; top: number; left: number }[], current: string, key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown"): string | null {
  const index = boxes.findIndex(box => box.id === current);
  if (index < 0) return null;
  if (key === "ArrowLeft" || key === "ArrowRight") return boxes[index + (key === "ArrowRight" ? 1 : -1)]?.id ?? null;
  const here = boxes[index], rows = [...new Set(boxes.map(box => box.top))].sort((a, b) => a - b);
  const row = rows[rows.indexOf(here.top) + (key === "ArrowDown" ? 1 : -1)];
  if (row === undefined) return null;
  let best: { id: string; distance: number } | null = null;
  for (const box of boxes) if (box.top === row) {
    const distance = Math.abs(box.left - here.left);
    if (!best || distance < best.distance) best = { id: box.id, distance };
  }
  return best?.id ?? null;
}

/** 本人のブラウザに覚えた列の数を読む（読めない・壊れていれば既定）。形ごと（split / full）に別々 */
export function rememberedColumns(read: () => string | null, choices: readonly number[], fallback: number): number {
  let value: number;
  try { value = Number(read()); } catch { return fallback; }
  return choices.includes(value) ? value : fallback;
}
