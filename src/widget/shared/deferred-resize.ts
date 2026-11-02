/** Deliver size changes outside ResizeObserver's layout pass, in the owner's window. */
export function observeDeferredSize(doc: Document, resized: (targets: readonly Element[]) => void) {
  const view = doc.defaultView;
  if (!view || typeof view.ResizeObserver !== "function") return null;
  const pending = new Set<Element>();
  let frame: number | null = null;
  let disposed = false;
  function cancel(target: Element) {
    pending.delete(target);
    if (!pending.size && frame !== null) { view?.cancelAnimationFrame(frame); frame = null; }
  }
  const observer = new view.ResizeObserver(entries => {
    if (disposed) return;
    for (const entry of entries) pending.add(entry.target);
    if (frame !== null) return;
    frame = view.requestAnimationFrame(() => {
      frame = null;
      const targets = [...pending].filter(target => target.isConnected);
      pending.clear();
      if (!disposed && targets.length) resized(targets);
    });
  });
  return {
    observe(target: Element) { if (!disposed) observer.observe(target); },
    unobserve(target: Element) { cancel(target); observer.unobserve(target); },
    cancel,
    disconnect() {
      disposed = true;
      observer.disconnect();
      if (frame !== null) view.cancelAnimationFrame(frame);
      frame = null;
      pending.clear();
    },
  };
}
