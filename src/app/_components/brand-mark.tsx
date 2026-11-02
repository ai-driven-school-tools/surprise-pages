import {
  MARK_FOLD_PATH,
  MARK_ROUND,
  MARK_SHEET_PATH,
  MARK_TILE_RADIUS,
  MARK_VIEW_BOX,
} from "@/lib/settings/brand";

/**
 * 画面に出す印。タブの印（src/app/icon.svg）・ホーム画面の絵と**同じ形**を、正本（src/lib/settings/brand.ts）から描く。
 *
 * 以前はここだけ別のアイコンを黒い角丸に入れていて、タブやアプリの印と違う絵になっていた。
 * 色は画面の墨（--ws-text）と、印を置く場所の地（--ws-side。サイドバーの地）。
 * 暗い側ではタブの印の紙と同じ #0a0a0a になり、明暗の切り替えにも付いてくる。
 */
export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      className="ws-mark"
      width={size}
      height={size}
      viewBox={MARK_VIEW_BOX}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx={MARK_TILE_RADIUS} fill="var(--ws-text)" />
      <path
        d={MARK_SHEET_PATH}
        fill="var(--ws-side)"
        stroke="var(--ws-side)"
        strokeWidth={MARK_ROUND}
        strokeLinejoin="round"
      />
      <path
        d={MARK_FOLD_PATH}
        fill="var(--ws-text)"
        stroke="var(--ws-text)"
        strokeWidth={MARK_ROUND}
        strokeLinejoin="round"
      />
    </svg>
  );
}
