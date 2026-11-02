/** Tracks work owned by one mounted widget feature. */
export function createWidgetLifetime() {
  const controller = new window.AbortController();
  const timers = new Set<number>();
  const frames = new Set<number>();
  const intervals = new Set<number>();
  let disposed = false;

  function clearTimeout(id: number) {
    window.clearTimeout(id);
    timers.delete(id);
  }
  function clearInterval(id: number) {
    window.clearInterval(id);
    intervals.delete(id);
  }
  return {
    signal: controller.signal,
    get disposed() { return disposed; },
    timeout(callback: () => void, delay: number) {
      if (disposed) return 0;
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (!disposed) callback();
      }, delay);
      timers.add(id);
      return id;
    },
    interval(callback: () => void, delay: number) {
      if (disposed) return 0;
      const id = window.setInterval(() => { if (!disposed) callback(); }, delay);
      intervals.add(id);
      return id;
    },
    frame(callback: FrameRequestCallback) {
      if (disposed) return 0;
      const id = window.requestAnimationFrame(time => {
        frames.delete(id);
        if (!disposed) callback(time);
      });
      frames.add(id);
      return id;
    },
    clearTimeout,
    clearInterval,
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      for (const id of timers) window.clearTimeout(id);
      for (const id of intervals) window.clearInterval(id);
      for (const id of frames) window.cancelAnimationFrame(id);
      timers.clear();
      intervals.clear();
      frames.clear();
    },
  };
}
