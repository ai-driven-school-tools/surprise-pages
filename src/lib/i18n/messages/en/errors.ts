import type { Messages } from "../types";

export const errors = {
  screen: {
    title: "Couldn't load this screen",
    detail: "Check your connection and try again.",
  },
  global: {
    title: "Couldn't display this screen",
    detail: "Please wait a moment and try again. If it keeps happening, the site settings or storage may have a problem.",
  },
  notFound: {
    title: "This page doesn't exist",
    detail: "The URL may have changed, or the page may have been deleted. Check the link with the person who sent it.",
    back: "Back to list",
  },
  digest: "If you contact us, please include this number: {digest}",
  setup: {
    title: "Setup isn't finished yet",
    intro: "The site is running, but the settings or storage needed to open files are missing.",
    missingNames: "These values are missing from Vercel's Environment Variables.",
    openGuide: "Open \"{chapter}\" in the setup guide to fix this. After changing settings, redeploy on Vercel to apply them.",
    checkLocally: "Check on your computer",
    checkLocallyDetail:
      "Run the following in a terminal in the downloaded files. It checks each setup step in order and shows the chapter where it stopped. Values aren't shown.",
    problems: {
      missing: "Site settings are missing",
      ownerEmail: "The owner's address (PAGES_OWNER_EMAIL) is not valid",
      siteUrl: "The site URL (PAGES_SITE_URL) is not valid",
      databaseUrl: "The storage connection (DATABASE_URL) is not valid",
      databaseUnreachable: "Can't connect to storage",
      notInitialized: "Storage hasn't been set up for personal use yet",
      ownerMismatch: "PAGES_OWNER_EMAIL doesn't match the address used to set up storage",
    },
  },
  delivery: {
    pageMissing: "Page not found (Pages)",
    pageMissingShort: "Page not found",
    pageForbidden: "You don't have permission to view this page (Pages)",
    assetReadFailed: "Couldn't load the file. Please reload",
    imageSizeInvalid: "The image size is invalid",
    imageMissing: "Image not found",
    vendorRouteMissing: "No such path",
    vendorPartMissing: "No such component",
  },
  request: {
    loginRequired: "Sign-in required",
    unreadable: "Couldn't read the request",
    pageInvalid: "The page is invalid",
    useScreen: "Please do this from the app screen",
    tooLarge: "The request is too large",
    checkInput: "Check the request",
    pageUnavailable: "Can't open this file",
  },
} as const satisfies Messages["errors"];
