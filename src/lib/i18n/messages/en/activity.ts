import type { Messages } from "../types";

export const activity = {
  tabs: {
    viewed: "Viewed pages",
    comments: "My comments",
  },
  comments: {
    loadFailed: "Couldn't load your comments. Please reload the page.",
    empty: "No comments yet",
    resolved: "Resolved",
    open: "Open",
  },
  viewed: {
    loadFailed: "Couldn't load your viewing history. Please reload the page.",
    times: { one: "{count} time", other: "{count} times" },
    localOnly: "This browser only",
    localOnlyHint: "Your browser settings may delete this sooner",
    forgetRow: "Delete viewing history for \"{title}\"",
    forgetAll: "Delete all viewing history",
    menu: "Viewing history actions",
    summary: { one: "{count} item · Deleted after {days} days", other: "{count} items · Deleted after {days} days" },
    paused: "Viewing history is off",
    empty: "No viewed pages yet",
    keep: "Keep history",
    stop: "Stop keeping history",
    deleteAll: "Delete all",
    confirmRow: {
      title: "Delete history",
      detail: "Delete the viewing history for \"{title}\". This can't be undone.",
    },
    confirmAll: {
      title: "Delete all history",
      settingsDetail: "Delete all viewing history in this browser and in your account. This can't be undone.",
      detail: {
        one: "Delete all viewing history. {count} item will be deleted. This can't be undone. History kept only in this browser will also be deleted.",
        other: "Delete all viewing history. {count} items will be deleted. This can't be undone. History kept only in this browser will also be deleted.",
      },
    },
    confirmStop: {
      settingsDetail: "Pages you view from now on won't be recorded. History in this browser and in your account will also be deleted. This can't be undone.",
      detail: {
        one: "Pages you view from now on won't be recorded. The remaining {count} item will also be deleted. This can't be undone.",
        other: "Pages you view from now on won't be recorded. The remaining {count} items will also be deleted. This can't be undone.",
      },
      action: "Delete and stop",
    },
  },
} as const satisfies Messages["activity"];
