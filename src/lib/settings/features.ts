// i18n-keep-file: 機能の台帳の purpose は開発者向けの説明で、画面に出ない
import { isPersonalEdition } from "./site-settings";

/**
 * 社内版と配布版で「その機能があるか」の台帳。ここが正本。
 *
 * 入口は `featureAvailable` / `featureEnabled` で引くだけにし、`isPersonalEdition()` を
 * 直に呼ばない。直に呼んでよいのは、機能のあるなしではなく**振る舞いそのもの**が
 * 違うところだけで、その一覧は `tests/checks/check-features.mjs` が持つ。口を足したらここに
 * 載せる。載せ忘れた口と、閉じるはずなのに関門を通らない口はその検査が落とす。
 *
 * 台帳に無い機能は配布版では既定で閉じる、が守りの向き。配布版で開けるのは
 * `personal: true` と書いたものだけ。
 */
export type Feature = {
  /** 何のための機能か。配布版で閉じる理由もここに書く。 */
  purpose: string;
  /** 配布版で使えるか。 */
  personal: boolean;
  /**
   * off にすると止まる環境変数（止めても閲覧は残す機能だけが持つ）。未設定で入るので、機能のスイッチの決まり
   * （docs/guides/feature-switches.md）では決まりより前からある例外。新しく足さない。台帳は src/lib/settings/environment.json の featureSwitch。
   */
  switch?: string;
  /** この機能だけの API の口（`src/app/api/**` の route があるフォルダ）。 */
  routes: readonly string[];
  /**
   * 閉じる判定を route の中ではなく別のファイルで行う口。値はそのファイル。
   * route はそのファイルを読み込み、そのファイルが台帳の関門を通る。
   */
  guardedBy?: string;
  /** 配布用リポジトリへ書き出さないファイルとフォルダ（会社の中でしか意味が無いもの）。 */
  companyOnly?: readonly string[];
};

export const FEATURES = {
  "first-paint": {
    purpose: "本文を描く前の待ちを配信時に外す（見た目の指定を先に作る・書体の指定で描画を止めない）。配布版は本文ごとに実行の制限を計算していて差し込みの形が合わないので出さない",
    personal: false,
    routes: [],
  },
  core: {
    purpose: "資料の投稿・閲覧・コメント・履歴・編集・共有。どちらの版でも使う",
    personal: true,
    routes: [
      "src/app/api/access-requests",
      "src/app/api/auth/[...nextauth]",
      "src/app/api/avatars/[id]",
      "src/app/api/cli-login/pending",
      "src/app/api/cli-login/pending/claim",
      "src/app/api/comments",
      "src/app/api/comments/[id]",
      "src/app/api/comments/outcomes",
      "src/app/api/cron/views",
      "src/app/api/deck-themes",
      "src/app/api/deck-themes/[id]/logo/[version]",
      "src/app/api/history",
      "src/app/api/og",
      "src/app/api/og/locked",
      "src/app/api/pages",
      "src/app/api/pages/access",
      "src/app/api/pages/deck-edit",
      "src/app/api/pages/deck-edit/assets",
      "src/app/api/pages/deck-edit/clipboard",
      "src/app/api/pages/deck-edit/create",
      "src/app/api/pages/deck-edit/duplicate",
      "src/app/api/pages/deck-edit/image-library",
      "src/app/api/pages/deck-edit/image-library/preview",
      "src/app/api/pages/deck-edit/media/import",
      "src/app/api/pages/deck-edit/media/upload",
      "src/app/api/pages/edit",
      "src/app/api/pages/logo",
      "src/app/api/pages/prepare",
      "src/app/api/pages/source",
      "src/app/api/pages/upload",
      "src/app/api/tokens",
      "src/app/api/tokens/[id]",
      "src/app/api/views",
      "src/app/api/workspace",
    ],
  },
  "diagram-prerender": {
    purpose: "図（Mermaid）のページで、サーバーのブラウザで版ごとに 1 回描いておいた図を本文と一緒に配り、図の道具を描画のあとで読む（src/lib/first-paint/diagram-prerender.ts）。絵は非公開の画像の置き場に控える。機能のスイッチ PAGES_DIAGRAM_PRERENDER=on のときだけ動く",
    personal: true,
    routes: ["src/app/api/pages/diagrams"],
  },
  notes: {
    purpose: "メモ帳。清書のページを、ブラウザで本文の上のまま直す（ProseMirror の編集の部品・「/」のブロックの一覧・手を止めるたびに 1 版）。直せるのは canEditPage の人だけ。サーバーは有料の資源を使わない",
    personal: true,
    routes: ["src/app/api/pages/notes", "src/app/api/pages/notes/assets"],
  },
  "page-agent": {
    purpose: "手元の AI（bin/pages-agent.mjs）から資料を直す口。サーバーは有料の資源を起動しない",
    personal: true,
    switch: "PAGES_AGENT_EDITING",
    routes: ["src/app/api/pages/agent"],
  },
} as const satisfies Record<string, Feature>;

export type FeatureName = keyof typeof FEATURES;

/** その版にその機能があるか。止める設定は見ない（止めても閲覧を残す機能のため）。 */
export function featureAvailable(name: FeatureName): boolean {
  const feature: Feature = FEATURES[name];
  return feature.personal || !isPersonalEdition();
}

/** その版にその機能があり、止める設定も入っていないか。作る・直す口はこちらを通す。 */
export function featureEnabled(name: FeatureName): boolean {
  const feature: Feature = FEATURES[name];
  if (!featureAvailable(name)) return false;
  return feature.switch === undefined || process.env[feature.switch] !== "off";
}
