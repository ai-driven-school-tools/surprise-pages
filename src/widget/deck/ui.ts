import {
  icon,
  ICON_PLUS,
  ICON_COPY,
  ICON_TRASH,
  ICON_CHEVRON_DOWN,
  ICON_CHECK,
  ICON_USERS,
  ICON_CLOSE,
  ICON_FILE_TEXT,
} from "../shared/util";

/** The editor shares the application's Lucide stroke vocabulary. All controls use a 16px glyph. */
const icons = {
  upload: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m17 8-5-5-5 5", "M12 3v12"],
  file: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z", "M14 2v6h6"],
  link: ["M10 13a5 5 0 0 0 7 .54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71", "M14 11a5 5 0 0 0-7-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"],
  text: ["M4 4h16", "M12 4v16", "M8 20h8"],
  image: ["M3 3h18v18H3Z", "m3 16 5-5 4 4 4-6 5 7", "M8 7h.01"],
  video: ["M3 5h12v14H3Z", "m15 10 6-4v12l-6-4"],
  square: ["M4 4h16v16H4Z"],
  circle: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"],
  line: ["m4 20 16-16"],
  arrow: ["M4 12h16", "m14 6 6 6-6 6"],
  table: ["M3 4h18v16H3Z", "M3 10h18", "M9 4v16"],
  chart: ["M3 3v18h18", "M8 17v-6", "M13 17V7", "M18 17V4"],
  plus: ICON_PLUS,
  copy: ICON_COPY,
  trash: ICON_TRASH,
  chevron: ICON_CHEVRON_DOWN,
  check: ICON_CHECK,
  users: ICON_USERS,
  close: ICON_CLOSE,
  notes: ICON_FILE_TEXT,
  undo: ["M3 10h11a6 6 0 0 1 0 12", "m7 6-4 4 4 4"],
  redo: ["M21 10H10a6 6 0 0 0 0 12", "m17 6 4 4-4 4"],
  more: [
    "M6 12a1 1 0 1 1-2 0a1 1 0 1 1 2 0",
    "M13 12a1 1 0 1 1-2 0a1 1 0 1 1 2 0",
    "M20 12a1 1 0 1 1-2 0a1 1 0 1 1 2 0",
  ],
  skip: ["m2 2 20 20", "M10.58 10.59a2 2 0 0 0 2.83 2.82", "M9.88 5.09A10.94 10.94 0 0 1 12 5c7 0 11 7 11 7a13.16 13.16 0 0 1-3.24 3.86", "M6.61 6.61A13.53 13.53 0 0 0 1 12s4 7 11 7a10.94 10.94 0 0 0 5.39-1.61"],
  play: ["m8 5 11 7-11 7Z"],
  pause: ["M8 5v14", "M16 5v14"],
  previous: ["m15 18-6-6 6-6"],
  next: ["m9 18 6-6-6-6"],
  monitor: ["M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z", "M8 21h8", "M12 17v4"],
  presenter: ["M2 3h20", "M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3", "m7 21 5-5 5 5"],
  layers: ["m12 3 10 6-10 6L2 9Z", "m2 15 10 6 10-6"],
  grid: ["M3 3h7v7H3Z", "M14 3h7v7h-7Z", "M3 14h7v7H3Z", "M14 14h7v7h-7Z"],
  minus: ["M5 12h14"],
  fit: ["M8 3H3v5", "M16 3h5v5", "M3 16v5h5", "M21 16v5h-5"],
  up: ["m6 12 6-6 6 6", "M12 6v14"],
  down: ["m6 12 6 6 6-6", "M12 4v14"],
  front: ["M8 8h13v13H8Z", "M16 8V3H3v13h5"],
  back: ["M3 3h13v13H3Z", "M16 8h5v13H8v-5"],
  reset: ["M3 11a9 9 0 1 1 2.6 6.4", "M3 3v8h8"],
  bold: ["M6 4h8a4 4 0 0 1 0 8H6Z", "M6 12h9a4 4 0 0 1 0 8H6Z"],
  italic: ["M19 4h-9", "M14 20H5", "M15 4 9 20"],
  left: ["M3 6h18", "M3 10h12", "M3 14h18", "M3 18h12"],
  center: ["M3 6h18", "M6 10h12", "M3 14h18", "M6 18h12"],
  right: ["M3 6h18", "M9 10h12", "M3 14h18", "M9 18h12"],
  lock: ["M5 11h14v10H5Z", "M8 11V7a4 4 0 0 1 8 0v4"],
  help: [
    "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
    "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3",
    "M12 17h.01",
  ],
};
export type DeckIcon = keyof typeof icons;
export function deckIcon(name: DeckIcon) {
  return icon(icons[name], 16, 1.7);
}
export function styleDeckButton(
  button: HTMLButtonElement,
  name: DeckIcon,
  only = false,
  label?: string,
) {
  const accessible =
    button.getAttribute("aria-label") || button.textContent || "";
  button.setAttribute("aria-label", accessible);
  button.replaceChildren(deckIcon(name));
  if (only) {
    button.classList.add("ds-icon-button");
    button.dataset.tooltip = label || accessible;
  } else {
    const text = document.createElement("span");
    text.textContent = label || accessible;
    button.append(text);
  }
  return button;
}
