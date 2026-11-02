import type { ReactNode } from "react";
import { BackLink } from "./back-link";

/**
 * 画面の頭。ワークスペースの全画面がこれ 1 つを使う。
 *
 *   ← 戻る先（あるときだけ）
 *   画面の名前                                  右端に操作
 *   補足の 1 行（あるときだけ。children）
 *
 * 題の行の高さは押す部品と同じなので、題と右の操作が 1 本の中心線にそろう。
 * 画面ごとに header を手で組むと、題の下の余白ぶんだけボタンが下にずれる（実際にずれていた）。
 */
export function PageHeader({
  title,
  back,
  actions,
  children,
}: {
  title: string;
  back?: { href: string; label: string };
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="ws-header">
      {back ? <BackLink href={back.href} label={back.label} /> : null}
      <div className="ws-header-row">
        <h1 className="ws-title">{title}</h1>
        {actions ? <div className="ws-header-actions">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
