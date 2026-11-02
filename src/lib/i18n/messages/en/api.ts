import type { Messages } from "../types";

export const api = {
  gate: {
    pageMissing: "That page doesn't exist",
  },
} as const satisfies Messages["api"];
