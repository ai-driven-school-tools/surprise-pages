import { app } from "./ja/app";
import { common } from "./ja/common";
import { errors } from "./ja/errors";
import { workspace } from "./ja/workspace";
import { settings } from "./ja/settings";
import { api } from "./ja/api";
import { library } from "./ja/library";
import { home } from "./ja/home";
import { activity } from "./ja/activity";
import { shortcuts } from "./ja/shortcuts";
import { admin } from "./ja/admin";
import { auth } from "./ja/auth";
import { decks } from "./ja/decks";
import { deckEditor } from "./ja/deckEditor";
import { toolbox } from "./ja/toolbox";
import { server } from "./ja/server";
import { organization } from "./ja/organization";

/**
 * 画面の文言の辞書（日本語）。**これが正本**。ほかの言語はこの形に合わせて訳す（`./en.ts`）。
 *
 * - 分野ごとのファイル（`./ja/<分野>.ts`）を束ねるだけ。どのファイルも辞書のほかは何も読み込まない葉にしてある
 *   （関所 `src/proxy.ts` が読む `src/lib/api-v1-problem.ts` からも使うため）。分野を足すときは `en.ts` にも同じ名前で足す。
 * - 鍵の名前は「どこの・何か」で付ける（`settings.appearance.title`）。字面（「保存」）で付けない——
 *   同じ字でも場所で訳が変わる。
 * - 差し込みは `{name}`。数で形が変わる文は `{ one, other }` にして `{count}` を渡す（日本語は 2 つとも同じ字）。
 * - 言葉の決まりは DESIGN.md の「言葉」。ボタンは動詞 1 つ、絵文字は使わない。
 * - 足し方・訳さないもの・移し方は docs/guides/i18n.md。
 */
export const ja = {
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
  toolbox,
  server,
  organization,
} as const;
