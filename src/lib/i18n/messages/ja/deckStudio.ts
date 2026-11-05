/**
 * スライドの編集画面・発表者画面に足した道具の文言（docs/guides/i18n.md）。
 * 資料をまたぐコピー・貼り付け、一覧の並べ方・拡大・操作ガイド、音声、発表者画面の手元で見る・時計・キー。
 */
export const deckStudio = {
  clipboard: {
    copy: "コピー",
    cut: "カット",
    paste: "貼り付け",
    copied: {
      one: "{count}枚をコピーしました",
      other: "{count}枚をコピーしました",
    },
    elementsCopied: {
      one: "{count}個の要素をコピーしました",
      other: "{count}個の要素をコピーしました",
    },
    nothing: "貼り付けるものがありません。先にスライドか要素をコピーしてください",
    carrying: "コピー元の資料から素材を写しています…",
    failed: "貼り付けられませんでした。コピー元の資料を開けるか確かめてください",
    publicTitle: "公開の資料に貼り付けますか",
    publicBody: "招待した人だけが見られる資料の中身を、誰でも見られる資料に貼り付けます。貼り付けると、この資料を開いた人は誰でも見られます。",
    publicAccept: "貼り付ける",
    slidesIntoElements: "スライドは一覧に貼り付けます",
  },
  clipboardApi: {
    missing: "コピー元の資料が見つかりません",
    publicConsent: "公開の資料に貼り付けるには確認が必要です",
    invalid: "貼り付けの指定が正しくありません",
    tooLarge: "一度に貼り付ける量が大きすぎます",
  },
} as const;
