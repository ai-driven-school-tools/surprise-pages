/** 発表者画面（src/widget/deck/present/presenter.ts）がこの端末に覚える好みと、時計の字。 */

/** 端末に覚えるのはノートの字の段（0〜3）だけ。本文は持たない。使えない環境では既定の段で動く。 */
const NOTE_SIZE_KEY = "surprise:presenter-note-size";
export const NOTE_SIZES = ["--font-notes-1", "--font-notes-2", "--font-notes-3", "--font-notes-4"];
const NOTE_SIZE_DEFAULT = 1;
export function readNoteSize(): number {
  try {
    const raw = localStorage.getItem(NOTE_SIZE_KEY), value = Number(raw);
    return raw !== null && Number.isInteger(value) && value >= 0 && value < NOTE_SIZES.length ? value : NOTE_SIZE_DEFAULT;
  } catch { return NOTE_SIZE_DEFAULT; }
}
export function writeNoteSize(value: number): void {
  try { localStorage.setItem(NOTE_SIZE_KEY, String(value)); } catch { /* 覚えられなくても、この発表の間は効く */ }
}

export function clockText(seconds: number): string {
  const absolute = Math.abs(seconds), hours = Math.floor(absolute / 3600), minutes = Math.floor(absolute / 60) % 60, rest = String(absolute % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}
