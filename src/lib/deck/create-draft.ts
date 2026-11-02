import { z } from 'zod';
import { deckCreateRequestSchema, deckCreateResultSchema } from './create-model';

const PREFIX = 'surprise-deck-create:';
const MAX_AGE = 3 * 24 * 60 * 60 * 1000;
const schema = z.object({
  createdAt: z.number(), request: deckCreateRequestSchema,
  url: deckCreateResultSchema.shape.url.optional(),
});
export type PendingDeckCreation = z.infer<typeof schema>;
const key = (account: string) => PREFIX + encodeURIComponent(account.trim().toLowerCase());

export function readPendingDeckCreation(storage: Storage, account: string): PendingDeckCreation | null {
  const raw = storage.getItem(key(account));
  if (!raw) return null;
  try {
    const result = schema.safeParse(JSON.parse(raw));
    if (result.success && result.data.createdAt <= Date.now() && Date.now() - result.data.createdAt < MAX_AGE) return result.data;
  } catch { /* Broken or expired records are never submitted. */ }
  storage.removeItem(key(account));
  return null;
}
export function writePendingDeckCreation(storage: Storage, account: string, value: PendingDeckCreation): void {
  storage.setItem(key(account), JSON.stringify(schema.parse(value)));
}
export function clearPendingDeckCreation(storage: Storage, account: string): void {
  storage.removeItem(key(account));
}
/** Clear only after the destination editor actually opens, not before navigation. */
export function completeDeckCreation(storage: Storage, pathname: string): void {
  for (let index = storage.length - 1; index >= 0; index--) {
    const name = storage.key(index);
    if (!name?.startsWith(PREFIX)) continue;
    try {
      const parsed = schema.safeParse(JSON.parse(storage.getItem(name) ?? 'null'));
      if (parsed.success && parsed.data.url?.split('?')[0] === pathname) storage.removeItem(name);
    } catch { /* A browser draft must not prevent opening a document. */ }
  }
}
