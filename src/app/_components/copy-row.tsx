"use client";

import { useState } from "react";
import { writeClipboardText } from "@/lib/workspace/clipboard";

import { useT } from "./i18n";
import { CODE, META, QUIET } from "./styles";

/**
 * 「そのまま貼る 1 行」と、そのコピー。
 *
 * 貼る先が別の道具（ターミナル・Cursor の Secrets）なので、人は必ず**写して持っていく**。
 * だから貼るものは 1 か所にまとめて、字面のまま（等幅＋面）出し、押すだけで写せるようにする。
 * 役割ごとに部品を 1 つにしておかないと、画面ごとに違う写し方が生えて揃わなくなる。
 *
 * **値そのものを見せたくない行もある**（投稿に使う名乗り）。そのときは `display` に
 * 伏せ字を渡す。画面に出るのは伏せ字だけで、クリップボードへ入るのは `value`。
 * 画面に出した瞬間、スクリーンショットや画面共有に残って消して回れなくなる。
 *
 * 押せるかどうかで描き分けない。Node にも navigator はあるがクリップボードは無いので、
 * 「使えるか」で出し分けると、サーバーが作った HTML とブラウザの 1 回目が必ず食い違う。
 */
export function CopyRow({
  label,
  value,
  display,
  name,
  failNote,
}: {
  /** 何の 1 行かを言う短い札（「名前」「クラウド環境から」）。 */
  label: string;
  /** クリップボードへ入れる中身。 */
  value: string;
  /** 画面に出す字。省略すると value をそのまま出す。 */
  display?: string;
  /** 読み上げ用の呼び名（「クラウド環境からのコマンド」）。 */
  name: string;
  /** 写せなかったときの案内。省略すると「自分で選んでコピーして」と言う。 */
  failNote?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const t = useT();
  const shown = display ?? value;

  return (
    <div className="py-3">
      <p className={META}>{label}</p>
      <div className="mt-1 flex items-baseline gap-3">
        <code className={`min-w-0 grow ${CODE}`}>{shown}</code>
        <button
          type="button"
          className={`shrink-0 ${QUIET}`}
          // 読み上げの名前も状態で変える。見えている字だけ変えても、名前を上書きしている
          // 間は「押した結果」が読み上げに届かない。
          aria-label={t(state === "copied" ? "common.copiedNamed" : "common.copyNamed", { name })}
          onClick={() => {
            void writeClipboardText(value).then((written) =>
              setState(written ? "copied" : "failed"),
            );
          }}
        >
          {state === "copied" ? t("common.copied") : t("common.copy")}
        </button>
      </div>
      {state === "failed" ? (
        <p className={`mt-1 ${META}`}>
          {failNote ?? t("common.copyFailed")}
        </p>
      ) : null}
    </div>
  );
}
