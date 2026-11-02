export const activity = {
  // 画面の名前とタブの入れ物の名前は workspace.places.activity（サイドバーと同じ名前）
  tabs: {
    viewed: "見たページ",
    comments: "書いたコメント",
  },
  comments: {
    loadFailed: "書いたコメントを読み込めませんでした。画面を読み込み直してください。",
    empty: "書いたコメントはまだありません",
    resolved: "解決済",
    open: "未解決",
  },
  viewed: {
    loadFailed: "見た記録を読み込めませんでした。画面を読み込み直してください。",
    times: { one: "{count} 回", other: "{count} 回" },
    localOnly: "このブラウザのみ",
    localOnlyHint: "ブラウザの設定で、早く消えることがあります",
    forgetRow: "「{title}」を見た記録を消す",
    forgetAll: "見たページの記録を全部消す",
    menu: "見たページの記録の操作",
    summary: { one: "{count} 件 · {days} 日で消えます", other: "{count} 件 · {days} 日で消えます" },
    paused: "記録を残していません",
    empty: "見たページはまだありません",
    keep: "記録を残す",
    stop: "記録を残さない",
    deleteAll: "すべて消す",
    confirmRow: {
      title: "記録を消す",
      detail: "「{title}」を見た記録を消します。元には戻せません。",
    },
    confirmAll: {
      title: "すべての記録を消す",
      settingsDetail: "見たページの記録を全部消します。このブラウザとアカウントに残っている分を消します。元には戻せません。",
      detail: {
        one: "見たページの記録を全部消します。{count} 件が消え、元には戻せません。このブラウザにだけ残っている分も一緒に消えます。",
        other: "見たページの記録を全部消します。{count} 件が消え、元には戻せません。このブラウザにだけ残っている分も一緒に消えます。",
      },
    },
    confirmStop: {
      settingsDetail: "これから見たページを控えません。このブラウザとアカウントに残っている記録も消え、元には戻せません。",
      detail: {
        one: "これから見たページを控えません。残っている {count} 件も消え、元には戻せません。",
        other: "これから見たページを控えません。残っている {count} 件も消え、元には戻せません。",
      },
      action: "消して残さない",
    },
  },
} as const;
