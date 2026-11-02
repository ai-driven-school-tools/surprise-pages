import type { Messages } from "../types";

export const server = {
  internalError: "Something went wrong on the server. Please try again later",
  rateLimited: "Too many requests right now. Please wait a moment and try again",
  sameSiteOnly: "Use this site to do this",
  unknownHost: "There is no Pages site at this address",
  gate: {
    signin: "Sign-in required",
    restricted: "You don't have permission to view this page",
    notFound: "That page doesn't exist",
  },
  publish: {
    unreadableBody: "The request body couldn't be read",
    invalidPage: "The page is invalid (slug may use only lowercase letters, digits, and - _ . /; visibility must be internal or public)",
    emptyHtml: "The page body (html) is empty",
    tooLarge: "The page body is too large ({size} MB; limit {limit} MB). Don't embed images in the body. Upload them separately as assets",
    invalidKeep: "The list of assets to keep (keep) contains names that can't be used in a URL",
    invalidRestricted: "The \"selected people only\" setting (restricted) couldn't be read",
    invalidGrantGroups: "The list of viewer groups (grantGroups) couldn't be read",
    groupsNeedRestricted: "Viewer groups can only be granted together with \"selected people only\" (restricted: true)",
    publicCannotRestrict: "A public page can't be limited to selected people. Publish it as a page for the organization only instead",
    missingGroups: "Viewer groups not found: \"{names}\". Create them in the admin screen, then publish again",
    groupNameSeparator: "\", \"",
    deckNeedsLatest: "Read the latest version of the slides and compare your changes before applying them",
    grantFailed:
      "The page was created for selected people only, but granting access to the viewer groups failed. Publish the same content again to retry just the access",
  },
  deletePage: {
    invalidPage: "The page is invalid",
    alreadyGone: "That page doesn't exist (it was already deleted)",
    done: "The URL no longer opens, but the content and assets are kept (the page is only marked as deleted). Publish to the same place again to restore it.",
  },
  pagesStore: {
    restrictedExisting:
      "A page already exists at {page} and isn't limited to selected people. To change who can see it, use the page's sharing screen, or publish to a new place.",
    revisionRace: "This collided with another publish. Publish again (the same content won't be added twice).",
    staleBase: "Someone else saved changes first. Reopen the page and make your changes on the current version.",
    slugTakenBelow:
      "The name `{here}` is already used as the folder for `{other}`. A page and a page under it can't share a name (their image folders would collide). Move it down a level, for example `{here}/index`.",
    slugInsideAbove:
      "The name `{here}` is inside the folder of the existing page `{other}`. A page and a page under it can't share a name (their image folders would collide). Move `{other}` down a level, for example `{other}/index`, then publish again.",
    deckTooLarge: "With the saved settings carried over, the body exceeds the {limit} MB limit. Make the source smaller",
  },
  document: {
    separator: ". ",
    designInvalid: "The slide design settings are invalid",
    customizationInvalid: "The slide focus and logo settings are invalid",
    embeds: "Embeds, forms, and custom base URLs can't be used in this edition",
    autoRedirect: "Automatic redirects to another page can't be used",
    eventHandlers: "Click handlers and other scripts can only be used as provided in the distributed templates",
    scriptLinks: "Links that run scripts can't be used",
    srcdoc: "Embedding other HTML can't be used",
    externalStyles: "In this edition, put styles in a style element inside the HTML",
    themeInvalid: "The theme settings are invalid",
    designPlacement: "The slide design settings are in the wrong format or place",
    customizationPlacement: "The slide focus and logo settings are in the wrong format or place",
    chartSource: "The chart data is in the wrong format or place",
    unapprovedScript: "The page contains unapproved scripts. Use the scripts from the distributed templates as they are",
  },
} as const satisfies Messages["server"];
