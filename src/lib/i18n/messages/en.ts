import type { Messages } from "./types";
import { app } from "./en/app";
import { common } from "./en/common";
import { errors } from "./en/errors";
import { workspace } from "./en/workspace";
import { settings } from "./en/settings";
import { api } from "./en/api";
import { library } from "./en/library";
import { home } from "./en/home";
import { activity } from "./en/activity";
import { shortcuts } from "./en/shortcuts";
import { admin } from "./en/admin";
import { auth } from "./en/auth";
import { decks } from "./en/decks";
import { deckEditor } from "./en/deckEditor";
import { deckStudio } from "./en/deckStudio";
import { toolbox } from "./en/toolbox";
import { server } from "./en/server";
import { organization } from "./en/organization";
import { notes } from "./en/notes";

/**
 * 画面の文言の辞書（英語）。形は日本語の辞書（`./ja.ts`）が正本で、鍵が欠けると型の誤りになる。
 * 訳すときも DESIGN.md の「言葉」に従う（ボタンは動詞 1 つ・説明を常に置かない）。
 */
export const en = {
  app,
  common,
  errors,
  workspace,
  settings,
  api,
  library,
  home,
  activity,
  shortcuts,
  admin,
  auth,
  decks,
  deckEditor,
  deckStudio,
  toolbox,
  server,
  organization,
  notes,
} as const satisfies Messages;
