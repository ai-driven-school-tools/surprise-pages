import { ImageResponse } from "next/og";

import {
  INK,
  GROUND,
  MARK_FOLD_PATH,
  MARK_ROUND,
  MARK_SHEET_PATH,
  MARK_VIEW_BOX,
} from "@/lib/settings/brand";

/**
 * iOS のホーム画面に並ぶ絵。
 *
 * 角丸は端末の側が付けるので、**こちらでは丸めない**（二重に丸まって縁が細る）。
 * 暗い側の色も持たない——ホーム画面の絵は 1 枚しか選べないため、明るい側だけで作る。
 * 形は src/lib/settings/brand.ts の写しではなく、そこから読んだものをそのまま描いている。
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: INK.light,
        }}
      >
        <svg width={size.width} height={size.height} viewBox={MARK_VIEW_BOX}>
          <path
            d={MARK_SHEET_PATH}
            fill={GROUND.light}
            stroke={GROUND.light}
            strokeWidth={MARK_ROUND}
            strokeLinejoin="round"
          />
          <path
            d={MARK_FOLD_PATH}
            fill={INK.light}
            stroke={INK.light}
            strokeWidth={MARK_ROUND}
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
