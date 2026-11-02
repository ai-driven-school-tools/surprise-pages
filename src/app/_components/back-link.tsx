"use client";
import Link, { useLinkStatus } from "next/link";
import { Icon } from "./icons";
import { useT } from "./i18n";

/**
 * 画面の頭（`page-header.tsx`）の「← 戻る先」。読み上げの名前（「録音に戻る」）を、その人の言語の辞書から引く。
 *
 * 画面の頭そのものはサーバーの画面からも置かれるので、辞書を引くこの 1 行だけをブラウザ側の部品にしてある。
 * 持つのは戻る先の道筋と名前だけ（画面の中身は持たない）。
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  const t = useT();
  return (
    <Link href={href} className="ws-back" aria-label={t("common.backTo", { label })}>
      <Icon name="back" small />
      {label}
      <LinkPending />
    </Link>
  );
}

/**
 * 押したリンクの画面がまだ届いていない間だけ、そのリンクの中に印を 1 つ立てる（`Link` の子に置く）。
 * 見た目は CSS が `:has([data-link-pending])` で受ける——押した項目をその場で「選んだ」地にし、
 * 待ちが長いときだけ本文を薄くする（src/app/globals.css）。
 *
 * ワークスペースの画面は待ちの表示（loading.tsx）を持たない。待ちの表示を出すと、React は中身が届いても
 * 出してから 300ms は差し替えないので、応答が 20ms で届いても切り替えが必ず 0.3 秒かかっていた。待っている間は前の画面を残し、押した手応えはここで返す。
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return pending ? <span hidden data-link-pending="" /> : null;
}
