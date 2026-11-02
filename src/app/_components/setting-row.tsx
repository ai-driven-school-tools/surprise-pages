import type { ReactNode } from "react";

/**
 * 設定の 1 行。左に「何の設定か」（名前と補足）、右に操作か今の値。
 *
 *   名前                                        右端に操作か今の値
 *   補足（12 灰。無くてもよい）
 *
 * 個人設定と録音の設定が同じ形を使う。寸法と余白は src/app/globals.css の `.ws-setting` が正本。
 *
 * - **線を引かない。** 行ごとに右端の部品が違うので、行の境は余白と右端の部品で足りる。線を引くと
 *   1 画面に 8 本並び、題（h1）→ 節（h2）→ 行の序列より線のほうが先に目に入る。
 * - **絵を置かない。** 絵のある行と無い行で名前の左端が割れ、節の見出しと行の左端が 1 本にそろわない。
 *   行の見分けは名前が担う（絵は読み上げにも届かない飾りだった）。
 * - 行は節（h2）の下に並べる。見出しの無い行を画面の題の直下に置かない。
 */
export function SettingRow({
  title,
  detail,
  children,
}: {
  title: ReactNode;
  detail?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="ws-setting">
      <div className="ws-setting-main">
        <div className="ws-setting-title">{title}</div>
        {detail ? <p className="ws-setting-detail">{detail}</p> : null}
      </div>
      {children ? <div className="ws-setting-action">{children}</div> : null}
    </div>
  );
}
