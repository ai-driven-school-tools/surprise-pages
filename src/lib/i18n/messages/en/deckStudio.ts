import type { Messages } from "../types";

export const deckStudio = {
  clipboard: {
    copy: "Copy",
    cut: "Cut",
    paste: "Paste",
    copied: {
      one: "Copied {count} slide",
      other: "Copied {count} slides",
    },
    elementsCopied: {
      one: "Copied {count} element",
      other: "Copied {count} elements",
    },
    nothing: "Nothing to paste. Copy a slide or an element first",
    carrying: "Copying media from the source deck…",
    failed: "Could not paste. Check that you can still open the source deck",
    publicTitle: "Paste into a public deck?",
    publicBody: "This content comes from a deck only invited people can see. After you paste it, anyone who opens this deck can see it.",
    publicAccept: "Paste",
    slidesIntoElements: "Slides are pasted into the slide list",
  },
  clipboardApi: {
    missing: "The source deck was not found",
    publicConsent: "Confirmation is required to paste into a public deck",
    invalid: "The paste request is invalid",
    tooLarge: "Too much to paste at once",
  },
  list: {
    open: "Grid view",
    close: "Close grid",
    columns: "Columns",
    columnsLabel: {
      one: "{count} column",
      other: "{count} columns",
    },
    resize: "Resize the slide list",
  },
  zoom: {
    guide: "Zoom",
    guideKeysApple: "Scroll while holding ⌘, or pinch",
    guideKeysOther: "Scroll while holding Ctrl, or pinch",
  },
  guide: {
    slide: "Slides",
    slideKeys: "Select in the list, then ⌘C, ⌘V, ⌘D, Delete; ⌥↑↓ to reorder",
    copyAcross: "Paste into another deck",
    copyAcrossKeys: "⌘C here, then ⌘V in a deck open in another tab or window",
    list: "Slide list layout",
    listKeys: "Grid view and columns at the bottom (O, -, = in the list). Drag to reorder",
  },
} as const satisfies Messages["deckStudio"];
