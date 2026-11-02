/**
 * 門（見てよいかの判定）を付けるべき入口の一覧。check-gate.mjs が「全部の入口が門を通るか」を、
 * check-tenant-isolation.mjsが「全部の入口を組織の境の総当たりに入れたか」を、同じ一覧から見る（書き写さない）。
 */
/** 入口 → その入口が必ず呼ぶ門。 */
export const GATE_ENTRIES = [
  ["src/lib/pages/private-page.ts", ["openPage(", "openAssetPage("]],
  /*
   * 公開の経路が通る門は専用の 2 つ。/public/… が指す場所には呼び名が 2 通りありうる
   * （公開として投稿した `public/…` と、公開に切り替えた `internal/…`）ので、
   * 呼び名を 1 本に決め打つ openPage では引けない。中で通す判定は同じ 1 つ。
   */
  ["src/app/public/[...slug]/route.ts", ["openPublicPage(", "openPublicAssetPage("]],
  ["src/app/api/comments/route.ts", ["openPage("]],
  ["src/app/api/comments/[id]/route.ts", ["openPage("]],
  ["src/app/api/comments/outcomes/route.ts", ["openPage("]],
  ["src/app/api/history/route.ts", ["openPage("]],
  ["src/app/api/og/route.tsx", ["openPage("]],
  ["src/app/api/access-requests/route.ts", ["requestPageAccess("]],
  ["src/app/api/pages/access/route.ts", ["openPage(", "canManageSharing("]],
  ["src/app/_components/library-screen.tsx", ["workspaceRows("]],
  // 見たページを控える口。呼び名で受けて門を通す（台帳の目印は受け取らない）
  ["src/app/api/views/route.ts", ["openPage("]],
  // 見たページの一覧。見える行を先に確定させてから、その中だけを引く
  ["src/app/(workspace)/(screens)/activity/page.tsx", ["visiblePagesFor("]],
  // 控えを消す口。消すときも呼び名で受けて、控える口とまったく同じ門を通す
  ["src/app/activity/actions.ts", ["openPage("]],
  /*
   * 本文の取り寄せ（直す前に、いま出ている本文を手元へ戻す口）。
   *
   * 名乗り方は投稿の鍵で、画面のログインとは別。だからといって門を省かない——
   * 鍵は投稿するためのもので、名簿で絞ったページの中身を読んでよい理由にはならない。
   */
  ["src/app/api/pages/source/route.ts", ["openPage("]],
  /*
   * 本文をブラウザから直す口（取り寄せと保存）。
   *
   * 名乗り方は画面のログインだが、門は他の入口とまったく同じ openPage。
   * 直してよいかは src/lib/access/access.ts の canEditPage ただ 1 つが決める
   * （決まりそのものは check-page-edit.mjs が見る。ここが見るのは付け忘れ）。
   */
  ["src/app/api/pages/edit/route.ts", ["loadEditable(", "@/lib/access/page-edit-access"]],
  ["src/app/api/pages/deck-edit/route.ts", ["loadEditablePage("]],
  ["src/app/api/pages/deck-edit/assets/route.ts", ["loadEditablePage("]],
  /*
   * 原本の鮮度と取り込み。直してよいかは本文を直す口と同じ canEditPage。
   * GitHub を叩くのは編集できる人の 1 往復だけ（コメント一覧では叩かない）。
   */
];
