import type { Messages } from "../types";

export const settings = {
  title: "Settings",
  account: "Account",
  screen: "Display",
  decks: "Slides",
  appearance: {
    title: "Appearance",
    group: "Screen appearance",
    system: "Match device",
    light: "Light",
    dark: "Dark",
  },
  language: {
    title: "Language",
    detail: "Auto follows your browser's language",
    group: "Screen language",
    auto: "Auto",
  },
  devices: {
    title: "Signed-in devices",
    detail: "Devices and apps used for publishing",
  },
  themes: {
    title: "My themes",
    detail: "Colors and logos saved for slides",
    loadFailed: "Couldn't load your themes.",
    empty: "No themes yet. You can save one from the slide editor.",
    name: "Theme name",
    deleteNote: "This theme will be deleted. Existing files won't change.",
    delete: "Delete",
    deleteTheme: "Delete theme",
    saveName: "Save name",
  },
  views: {
    title: "Viewing history",
    detail: {
      one: "Pages you've viewed. Deleted after {count} day",
      other: "Pages you've viewed. Deleted after {count} days",
    },
  },
  readAloud: {
    title: "Read aloud",
    voice: {
      title: "Voice",
      detail: "Choose from the voices installed on this device. Saved in this browser.",
      label: "Reading voice",
      auto: "Automatic",
      option: "{name} ({lang})",
      none: "No voices are available on this device",
    },
    rate: {
      title: "Speed",
      detail: "The speed reading starts at. Speed changes made while reading are saved here too.",
      group: "Reading speed",
    },
  },
  beta: {
    title: "Beta features",
    group: "Use {feature}",
  },
  usage: {
    title: "Storage usage",
    database: "Text and history storage",
    databaseDetail:
      "Neon Free allows up to 0.5 GB of storage (as of September 2026). As you get close, delete files you don't need or choose another plan.",
    databaseValue: "{size} · Files: {pages} · Versions: {revisions}",
    assets: "Image storage",
    assetsDetail: "Check the limit on the Vercel Blob pricing page. Images from past versions are included.",
    assetsValue: "{size} · Items: {files}",
    assetsValueAtLeast: "{size} · Items: {files}+",
    uncounted: "Couldn't count",
  },
} as const satisfies Messages["settings"];
