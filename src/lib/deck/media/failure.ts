/** Stable recovery semantics across the upload API and editor; copy is not a protocol. */
export const MEDIA_FAILURE_CODES = ["format", "invalid-file", "empty", "size", "connection", "auth", "permission", "target", "save", "remote", "unknown"] as const;
export type MediaFailureCode = typeof MEDIA_FAILURE_CODES[number];
export class MediaFailure extends Error {
  constructor(readonly code: MediaFailureCode, message: string) { super(message); this.name = "MediaFailure"; }
}
export function isMediaFailureCode(value: unknown): value is MediaFailureCode {
  return typeof value === "string" && MEDIA_FAILURE_CODES.some(code => code === value);
}
