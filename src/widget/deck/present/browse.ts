import { t } from "../../shared/i18n";
import { el } from "../../shared/util";

/** 並びの中の 1 枚（枚の ID と、その枚の中の段階）。 */
export type PresenterSpot = { id: string | null; step: number };

/**
 * 発表者画面の「手元だけで見る」（src/widget/deck/present/presenter.ts）。
 * 観客用の窓に出す枚（onAir）を覚えておき、入っている間のめくり・飛ぶ操作は手元（現在の枚・次の見本・ノート）だけに効かせる。
 * 抜けると手元が onAir へ戻り、そこからは今までどおり手元と観客用の窓が一緒に動く。「この枚を観客に出す」は、抜けて手元の枚を観客に出す。
 * 入っていることは、現在の枚の行の札（観客には何枚目を出しているか）と、押している間のボタンの字で出す（色・線は足さない）。
 */
export function presenterBrowse(root: HTMLElement, button: HTMLButtonElement, show: HTMLButtonElement) {
  const state = el("span", "dp-browse");
  state.setAttribute("role", "status"); state.hidden = true;
  let on = false, onAir: PresenterSpot = { id: null, step: 0 };

  /** 入っているかを、ボタン・現在の枚の行・画面の根の印に出す。entries は観客用の窓の枚が何枚目かを数える並び。 */
  function paint(entries: readonly { id: string }[]) {
    root.toggleAttribute("data-browsing", on);
    const label = on ? t("deckStudio.presenter.backToShown") : t("deckStudio.presenter.browse");
    if (button.textContent !== label) button.textContent = label;
    button.title = `${label} (V)`;
    button.setAttribute("aria-keyshortcuts", "V");
    button.setAttribute("aria-pressed", String(on));
    state.hidden = !on; show.hidden = !on;
    if (!on) return;
    const text = t("deckStudio.presenter.browsing", { number: entries.findIndex(item => item.id === onAir.id) + 1, total: entries.length });
    if (state.textContent !== text) state.textContent = text;
  }

  return {
    state, paint,
    get on() { return on; },
    /** 観客用の窓に出す枚。手元だけで見ていなければ手元（here）と同じ */
    aired: (here: PresenterSpot): PresenterSpot => (on ? onAir : here),
    /** 入る（here を観客用の窓の枚として覚える）・抜ける。返すのは、そのあと手元に映す枚 */
    toggle(here: PresenterSpot): PresenterSpot {
      if (on) { on = false; return onAir; }
      on = true; onAir = { ...here };
      return here;
    },
    /** 抜けて、手元の枚をそのまま観客に出す（手元は動かさない） */
    air() { on = false; },
    /** 抜ける（発表を止めた・観客用の窓を閉じた） */
    leave(): PresenterSpot { on = false; return onAir; },
  };
}
