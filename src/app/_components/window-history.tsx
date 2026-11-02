"use client";
import { useSyncExternalStore } from "react";
import { NO_STEPS, readHistorySteps, watchHistorySteps, type HistorySteps } from "@/lib/revisions/history-steps";
import { IconButton } from "./controls";
import { useT } from "./i18n";

/**
 * 窓の上端の、戻る・進む。デスクトップアプリの窓の中でだけ出る（信号機ボタンの右隣）。
 *
 * 出すかどうかは CSS が決める（`src/app/globals.css` の `.ws-titlebar`）。ブラウザが知らせる窓の枠の幅だけで
 * 見分けるので、ふつうのブラウザでは場所ごと無く、描いたあとで出たり引っ込んだりもしない。
 * ページを開いたときの上端の行（`src/widget/reading/location-bar.ts`）と同じ位置・同じ絵・同じ押せるかどうかの読み方
 * （`src/lib/revisions/history-steps.ts`）なので、一覧とページを行き来しても動かない。
 */
let snapshot: HistorySteps = NO_STEPS;

function subscribe(onChange: () => void): () => void {
  return watchHistorySteps(window, onChange);
}

/** 同じ答えなら同じものを返す（返すたびに別物だと、描き直しが止まらない）。 */
function current(): HistorySteps {
  const next = readHistorySteps(window);
  if (next.back !== snapshot.back || next.forward !== snapshot.forward) snapshot = next;
  return snapshot;
}

export function WindowHistory() {
  const steps = useSyncExternalStore(subscribe, current, () => NO_STEPS);
  const t = useT();
  return (
    <div className="ws-titlebar">
      <div className="ws-window-history" role="group" aria-label={t("common.history")}>
        <IconButton label={t("common.back")} icon="previous" disabled={!steps.back} onClick={() => window.history.back()} />
        <IconButton label={t("common.forward")} icon="next" disabled={!steps.forward} onClick={() => window.history.forward()} />
      </div>
    </div>
  );
}
