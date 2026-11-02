import type { Messages } from "../types";

export const home = {
  sections: {
    comments: "Comments and replies",
    shared: "Shared with you",
    recent: "Recently opened",
    fresh: "New from others",
  },
  count: { one: "{count}", other: "{count}" },
  seeAll: "See all",
  commented: { one: "{count} comment from {name}", other: "{count} comments from {name}" },
  replied: "Reply from {name}",
  sharedBy: "Shared by {name}",
  sharedWithYou: "Shared with you",
  mine: "You",
  recentEmpty: "Nothing opened yet",
  recentPaused: "Viewing history is turned off.",
  recentPausedLink: "Change in Settings",
  freshEmpty: "No new files",
} as const satisfies Messages["home"];
