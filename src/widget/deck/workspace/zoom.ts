/** 拡大・縮小の下限と上限（右下の −・＋ と ⌘ スクロールで同じ） */
export const ZOOM_MIN = 0.1, ZOOM_MAX = 2;

/** 枠に収まる倍率（「全体表示」の倍率）。周りに 32px ずつ机を残す */
export function deckFitScale(frame: HTMLElement): number {
  return Math.max(ZOOM_MIN, Math.min((frame.clientWidth - 64) / 1280, (frame.clientHeight - 64) / 720, 1));
}

type ZoomHost = { attached: Document | null; frame: HTMLElement; zoom: number | null };

/**
 * ⌘（Windows は Ctrl）を押しながらのスクロールと、トラックパッドのピンチ（ブラウザは Ctrl 付きのスクロールとして送る）で拡大・縮小する。
 * 指している点を動かさずに倍率だけを変える（redraw で描き直してから、ずれた分をスクロールで戻す）。修飾キーの無いスクロールは何もしない。
 */
export function deckWheelZoom(event: WheelEvent, host: ZoomHost, redraw: () => void): void {
  const doc = host.attached;
  if (!(event.metaKey || event.ctrlKey) || !doc) return;
  event.preventDefault();
  const before = host.zoom ?? deckFitScale(host.frame);
  const delta = Math.max(-25, Math.min(25, event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY));
  const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, before * Math.exp(-delta * 0.01)));
  if (next === before) return;
  const slide = () => doc.querySelector<HTMLElement>("[data-deck-frame][data-studio-active],main[data-deck-slides]>section[data-studio-active]")?.getBoundingClientRect();
  const was = slide();
  host.zoom = next;
  redraw();
  const now = slide();
  if (was && now) doc.body.scrollBy((now.left - was.left) + (event.clientX - was.left) * (next / before - 1), (now.top - was.top) + (event.clientY - was.top) * (next / before - 1));
}
