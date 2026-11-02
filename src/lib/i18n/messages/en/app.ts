import type { Messages } from "../types";

export const app = {
  description: "Diagrams and reports — {organization}",
  versionBanner: {
    showing: "Showing a past version ({sha})",
    showingNumber: "Showing a past version ({version})",
    latest: "View latest version",
  },
  noAccess: {
    title: "This page is restricted",
    detail: "Only people who have been given access can open this page. You don't have access yet.",
    request: "Request access",
    sending: "Sending…",
    retry: "Send again",
    sent: "Your request has been sent. You'll be able to open this page once it's approved.",
    backToList: "Back to pages",
  },
} as const satisfies Messages["app"];
