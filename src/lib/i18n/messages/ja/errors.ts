export const errors = {
  screen: {
    title: "画面を読み込めませんでした",
    detail: "接続を確認して、もう一度お試しください。",
  },
  global: {
    title: "画面を表示できませんでした",
    detail: "時間をおいて、もう一度お試しください。続くときは、サイトの設定か保存先に問題があるかもしれません。",
  },
  notFound: {
    title: "このページはありません",
    detail: "URL が変わったか、削除された可能性があります。資料のリンクは、送ってくれた人に確かめてください。",
    back: "一覧へ戻る",
  },
  // エラー画面の問い合わせの番号（src/app/_components/error-mark.tsx）。{digest} の所に番号を置く
  digest: "お問い合わせのときは、この番号をお伝えください: {digest}",
  // 配布版の設置が足りないときの案内（src/app/_components/setup-guide.tsx・src/lib/settings/setup-error.ts）
  setup: {
    title: "設置がまだ終わっていません",
    intro: "サイトは動いていますが、資料を開くための設定か保存先が足りません。",
    missingNames: "Vercel の Environment Variables に、次の名前の値が入っていません。",
    openGuide: "導入ガイドの「{chapter}」を開いて直してください。設定を変えたら、Vercel で再デプロイすると反映されます。",
    checkLocally: "手元で確かめる",
    checkLocallyDetail:
      "配布物を開いたターミナルで次を実行すると、どこまで設置できているかを順に確かめ、止まった所の章を示します。値は表示しません。",
    problems: {
      missing: "サイトの設定が足りません",
      ownerEmail: "設置した本人のアドレス（PAGES_OWNER_EMAIL）の形が正しくありません",
      siteUrl: "サイトの URL（PAGES_SITE_URL）の形が正しくありません",
      databaseUrl: "保存先の接続（DATABASE_URL）の形が正しくありません",
      databaseUnreachable: "保存先に繋がりません",
      notInitialized: "保存先がまだ個人用として初期化されていません",
      ownerMismatch: "保存先を初期化したときのアドレスと、PAGES_OWNER_EMAIL が違います",
    },
    // 本番の配備でないサーバーが本番の保管庫を指していたとき。題は社内版の作業場の脚本が字面で探していたもの。同じ字
  },
  // 配信の口（/i・/p・/h・素材・部品）が返す短い文
  delivery: {
    pageMissing: "そのページはありません（Pages）",
    pageMissingShort: "そのページはありません",
    pageForbidden: "このページを見る許可がありません（Pages）",
    assetReadFailed: "素材を読み込めませんでした。読み直してください",
    imageSizeInvalid: "画像のサイズ指定が正しくありません",
    imageMissing: "画像が見つかりません",
    vendorRouteMissing: "そのような行き先はありません",
    vendorPartMissing: "そのような部品はありません",
  },
  // ワークスペースの窓口（/api/workspace・/api/views）の断り文
  request: {
    loginRequired: "ログインが必要です",
    unreadable: "送信された中身が読めませんでした",
    pageInvalid: "ページの指定が正しくありません",
    useScreen: "この画面から操作してください",
    tooLarge: "指定が大きすぎます",
    checkInput: "指定を確認してください",
    pageUnavailable: "資料を開けません",
  },
} as const;
