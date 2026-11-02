export const server = {
  // Web と投稿コマンドの窓口（/api/**、/api/v1 を除く）と関所の断り文。要求の言語で引く（src/lib/i18n/request.ts の rt）。
  // 「トークン」という語は使わない（人に見せない決まり）。断る相手にページの題名を教えない
  internalError: "サーバー側で問題が起きました。しばらくしてからもう一度お試しください",
  // 配布版の回数の上限（src/lib/access/request-security.ts）。接続先も残り回数も書かない
  rateLimited: "アクセスが集中しています。少し待ってからもう一度お試しください",
  // 関所（src/proxy.ts）の断り。GET 以外を、鍵も同じサイトの画面も無しに送ってきたとき
  sameSiteOnly: "このサイトの画面から操作してください",
  // 関所の断り。本番で組織の表に無い宛先を開いたとき。どの組織の宛先かも、在るか無いかも書かない
  unknownHost: "この宛先には Pages はありません",
  gate: {
    signin: "ログインが必要です",
    restricted: "このページを見る許可がありません",
    notFound: "そのページはありません",
  },
  publish: {
    unreadableBody: "送信された中身が読めませんでした",
    invalidPage: "ページの指定が正しくありません（slug は英小文字・数字・- _ . / だけ、visibility は internal か public）",
    emptyHtml: "ページの本文（html）が空です",
    tooLarge: "本文が大きすぎます（{size}MB・上限 {limit}MB）。画像は本文に埋め込まず、素材として別に上げてください",
    invalidKeep: "使う素材の一覧（keep）に、URL に使えない名前が混ざっています",
    invalidRestricted: "「選んだ人だけ」の指定（restricted）が読めませんでした",
    invalidGrantGroups: "見せる閲覧グループの並び（grantGroups）が読めませんでした",
    groupsNeedRestricted: "閲覧グループへの許可は「選んだ人だけ」（restricted: true）と一緒に指定してください",
    publicCannotRestrict: "門なし公開のページに「選んだ人だけ」は指定できません。組織の中だけに見せるページとして投稿してください",
    // {names} は groupNameSeparator でつないだ名前の並び
    missingGroups: "閲覧グループ「{names}」が見つかりません。管理画面で作ってから投稿してください",
    groupNameSeparator: "」「",
    deckNeedsLatest: "スライドの最新版を読み取り、変更案を比較してから反映してください",
    grantFailed:
      "ページは「選んだ人だけ」で作られましたが、閲覧グループへの許可付けに失敗しました。同じ内容をもう一度投稿すると、許可だけやり直せます",
  },
  deletePage: {
    invalidPage: "ページの指定が正しくありません",
    alreadyGone: "そのページはありません（すでに消されています）",
    done: "URL は開けなくなりますが、本文と素材は残ります（消した印を立てるだけです）。同じ場所へもう一度投稿すれば元に戻ります。",
  },
  // src/lib/pages/store.ts の型つきの例外（打ち直しで直る・待っても直らない断り）
  pagesStore: {
    restrictedExisting:
      "その場所（{page}）にはすでにページがあり、いまは「選んだ人だけ」ではありません。見せ方を変えるにはページの共有範囲の画面を使うか、新しい場所に投稿してください。",
    revisionRace: "ほかの投稿と重なりました。もう一度投稿してください（同じ内容なら二重にはなりません）。",
    staleBase: "ほかの直しが先に入っています。ページを開き直して、いまの本文の上で直してください。",
    // 名前が、その下のページの置き場所として使われている
    slugTakenBelow:
      "`{here}` という名前は、すでに `{other}` の置き場所として使われています。ページと、その下のページを同じ名前にはできません（画像の置き場所がぶつかります）。`{here}/index` のように 1 段下げてください。",
    // 名前が、上のページの置き場所の中にある
    slugInsideAbove:
      "`{here}` という名前は、すでにある `{other}` というページの置き場所の中にあります。ページと、その下のページを同じ名前にはできません（画像の置き場所がぶつかります）。`{other}` を `{other}/index` のように 1 段下げてから投稿してください。",
    deckTooLarge: "保存設定を引き継ぐと本文が上限の{limit}MBを超えます。原稿を小さくしてください",
  },
  // 配布版の本文の検査（src/lib/html/document-security.ts）。見つかった問題を separator でつないで 1 通にする
  document: {
    separator: "。",
    designInvalid: "スライドのデザイン設定が正しくありません",
    customizationInvalid: "スライドの焦点・ロゴ設定が正しくありません",
    embeds: "埋め込み・フォーム・独自の基準URLは配布版では使えません",
    autoRedirect: "自動で別のページへ移動する指定は使えません",
    eventHandlers: "クリック等の仕掛けは、配布された雛形のものだけ使えます",
    scriptLinks: "仕掛けを実行するリンクは使えません",
    srcdoc: "別のHTMLを埋め込む指定は使えません",
    externalStyles: "配布版のスタイルはHTML内のstyleにまとめてください",
    themeInvalid: "テーマの指定が正しくありません",
    designPlacement: "スライドのデザイン設定の置き方が正しくありません",
    customizationPlacement: "スライドの焦点・ロゴ設定の置き方が正しくありません",
    chartSource: "図表の材料の形または置き方が正しくありません",
    unapprovedScript: "未確認の仕掛けが含まれています。配布された雛形の仕掛けをそのまま使ってください",
  },
} as const;
