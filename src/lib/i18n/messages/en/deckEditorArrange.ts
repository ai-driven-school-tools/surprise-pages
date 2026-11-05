import type { Messages } from "../types";

/** Arranging elements in the deck editor: the Layers list, alignment and resize grips, and the element context menu. */
export const deckEditorLayers = {
  title: "Layers",
  resize: "Resize layers",
  list: "Layers on this slide (front to back)",
  empty: "This slide has no elements",
  expand: "Expand {label}",
  collapse: "Collapse {label}",
  row: "Layer “{label}”",
  locked: "Layer “{label}” (position locked)",
  box: "Box",
  cannotMove: "You can't move it there. Drag it above or below another row.",
  otherBox: "You can't move an element into a different box. Cut and paste it instead.",
  unchanged: "The order didn't change",
} as const satisfies Messages["deckEditor"]["layers"];

export const deckEditorAlign = {
  horizontal: "Horizontal",
  vertical: "Vertical",
  centerShort: "Center",
  middleShort: "Middle",
  toSlide: "Align to slide: {action}",
  resizeSelection: "Resize the selected elements together",
  resizeShape: "Resize shape (arrow keys also work)",
} as const satisfies Messages["deckEditor"]["align"];

export const deckEditorElementMenu = {
  title: "Element actions",
  action: "{action} — element",
  cut: "Cut",
  copy: "Copy",
  paste: "Paste",
  selectAll: "Select all",
} as const satisfies Messages["deckEditor"]["elementMenu"];
