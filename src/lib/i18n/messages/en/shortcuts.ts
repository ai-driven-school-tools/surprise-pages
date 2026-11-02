import type { Messages } from "../types";

export const shortcuts = {
  groups: {
    general: "General",
    go: "Go to",
  },
  labels: {
    help: "Show keyboard shortcuts",
    search: "Move to the search field",
    goHome: "Go to home",
    goFiles: "Go to My files",
    goFavorites: "Go to Favorites",
    goActivity: "Go to My activity",
    goLibrary: "Go to Files — {organization}",
    goSettings: "Go to Settings",
    newWindow: "New window",
    back: "Back",
    forward: "Forward",
    reload: "Reload",
    settings: "Settings…",
  },
  whileTyping: "While you're typing, only shortcuts that use {modifier} work.",
  or: "or",
  then: "then",
} as const satisfies Messages["shortcuts"];
