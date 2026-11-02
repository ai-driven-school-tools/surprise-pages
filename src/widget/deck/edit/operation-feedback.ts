import { el } from "../../shared/util";
import { t } from "../../shared/i18n";

/** Delayed, local feedback. Saving has its own receipt and is never cancelled
 * or described as complete merely because a preview has finished. */
export function createDeckOperationFeedback() {
  const root = el("span", "deck-operation-status");
  root.setAttribute("aria-label", t("deckEditor.view.preparing"));
  root.hidden = true; root.setAttribute("role", "status"); root.setAttribute("aria-live", "polite");
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let detailTimer: ReturnType<typeof setTimeout> | undefined;
  function clear() { clearTimeout(timer); clearTimeout(detailTimer); root.hidden = true; }
  return {
    root,
    start(label: string) {
      clear(); const ticket = ++generation; const started = performance.now();
      let lastPaint = 0;
      let progress: { completed: number; total: number } | null = null;
      function paint() {
        if (ticket !== generation) return;
        if (!root.hidden && performance.now() - lastPaint < 100) return;
        lastPaint = performance.now();
        root.hidden = false;
        root.textContent = progress && performance.now() - started >= 1000
          ? t("deckEditor.view.progress",{label,completed:progress.completed,total:progress.total}) : `${label}…`;
      }
      timer = setTimeout(paint, 400); detailTimer = setTimeout(paint, 1000);
      return {
        progress(completed: number, total: number) { progress = { completed, total }; if (performance.now() - started >= 400) paint(); },
        finish() { if (ticket === generation) clear(); },
      };
    },
    dispose() { generation++; clear(); root.remove(); },
  };
}
