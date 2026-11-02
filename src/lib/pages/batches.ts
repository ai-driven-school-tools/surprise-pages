/** Keep page-ID filters small enough for REST, with bounded database concurrency. */
export async function readPageBatches<T>(
  pageIds: readonly string[],
  read: (ids: string[]) => Promise<readonly T[]>,
): Promise<T[]> {
  const ids = [...new Set(pageIds)];
  const results: (readonly T[])[] = [];
  let next = 0;
  async function worker() {
    for (;;) {
      const start = next;
      next += 40;
      const chunk = ids.slice(start, start + 40);
      if (chunk.length === 0) return;
      results[start / 40] = await read(chunk);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, Math.ceil(ids.length / 40)) }, worker));
  return results.flat();
}
