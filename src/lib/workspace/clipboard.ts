/**
 * 文字をクリップボードへ写す、ただ 1 つの口（画面もページの道具箱もここを通る）。
 *
 * まず新しい口（`navigator.clipboard.writeText`）で写し、断られたら同じ押した操作の中で
 * 昔の口（`copy` の出来事を起こして中身を差し替える）で写す。
 *
 * 新しい口だけに頼らないのは、ブラウザによっては書き込みの許可そのものを拒むため。
 * アプリの中のブラウザなどで `NotAllowedError: Write permission denied` になり、
 * 本文の小窓のコピーが「コピーできませんでした」で止まっていた（2026-10-02）。
 * 昔の口は**選んでいる文字にも焦点にも触らない**（隠した入力欄を選ぶ形にしない）——
 * 選び直すと本文の書きかけの印や小窓の見張りが動いてしまうため。
 *
 * 写せたら true。どちらでも写せなかったときだけ false（呼ぶ側が断り書きを出す）。
 */
export async function writeClipboardText(text: string): Promise<boolean> {
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (clipboard !== undefined) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // 許可が下りない・焦点が無い、など。昔の口で写し直す
    }
  }
  return copyThroughCopyEvent(text);
}


function copyThroughCopyEvent(text: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;
  let written = false;
  const fill = (event: ClipboardEvent): void => {
    if (event.clipboardData === null) return;
    event.clipboardData.setData("text/plain", text);
    // ブラウザが選んでいる文字で上書きしないように止め、ページの他の受け手にも渡さない
    event.preventDefault();
    event.stopImmediatePropagation();
    written = true;
  };
  document.addEventListener("copy", fill, true);
  try {
    document.execCommand("copy");
  } catch {
    written = false;
  } finally {
    document.removeEventListener("copy", fill, true);
  }
  return written;
}
