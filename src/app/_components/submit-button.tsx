"use client";

import { useFormStatus } from "react-dom";

/**
 * 送信ボタン。「発行する」と「止める」で同じものを使い回す。
 *
 * 押している間は文字を差し替え、押せなくする。二重に押すと鍵が 2 本できてしまい、
 * どちらが手元に写したものか一覧から見分けられなくなる（一覧に出せるのは
 * 覚え書きと日時だけで、生の値もハッシュも出せないため）。
 *
 * 待っているかどうかは自分では持たず、囲んでいるフォームから受け取る（useFormStatus）。
 * だからこの部品は発行にも停止にもそのまま置ける。
 */
export function SubmitButton({
  idle,
  busy,
  className,
  label,
}: {
  /** ふだんの文字 */
  idle: string;
  /** 送信している間の文字 */
  busy: string;
  /** 見た目（主要ボタン／控えめなボタン） */
  className: string;
  /** 読み上げ用の名前。何を止めるのかをボタン単体で言い切りたいときに渡す */
  label?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} aria-label={label} className={className}>
      {pending ? busy : idle}
    </button>
  );
}
