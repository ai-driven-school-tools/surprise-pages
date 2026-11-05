export const settings = {
  title: "個人設定",
  account: "アカウント",
  /** 節の見出し。外観と言語（どちらも「画面の〜」）をまとめる */
  screen: "画面",
  /** 節の見出し。スライドのための設定（マイテーマ） */
  decks: "スライド",
  appearance: {
    title: "外観",
    group: "画面の外観",
    system: "端末に合わせる",
    light: "ライト",
    dark: "ダーク",
  },
  language: {
    title: "言語",
    detail: "自動はブラウザの言語に合わせます",
    group: "画面の言語",
    auto: "自動",
  },
  devices: {
    title: "ログイン中のデバイス",
    detail: "投稿に使う端末とアプリ",
  },
  themes: {
    title: "マイテーマ",
    detail: "スライド用に保存した配色とロゴ",
    loadFailed: "マイテーマを読み込めませんでした。",
    empty: "テーマはまだありません。スライドの編集画面で保存できます。",
    name: "テーマ名",
    deleteNote: "このテーマを消します。作成済みの資料は変わりません。",
    delete: "消す",
    deleteTheme: "テーマを消す",
    saveName: "名前を保存",
  },
  views: {
    title: "閲覧記録",
    detail: {
      one: "見たページの記録。{count} 日で消えます",
      other: "見たページの記録。{count} 日で消えます",
    },
  },
  // 読み上げ（端末の声だけ）。控えるのはこのブラウザの中だけ（src/lib/read-aloud/settings.ts）
  readAloud: {
    title: "読み上げ",
    voice: {
      title: "声",
      detail: "この端末に入っている声から選びます。設定はこのブラウザに残ります",
      label: "読み上げの声",
      auto: "自動",
      option: "{name}（{lang}）",
      none: "この端末で使える声がありません",
    },
    rate: {
      title: "速さ",
      detail: "読み上げを始めるときの速さ。読んでいる途中に変えた速さも、ここに残ります",
      group: "読み上げの速さ",
    },
  },
  beta: {
    title: "ベータ機能",
    group: "{feature}を使うか",
  },
  usage: {
    title: "保存の使用量",
    database: "本文と履歴の保管庫",
    databaseDetail:
      "Neon Free の保存は 0.5 GB まで（2026年9月時点の条件）。近づいたら使わない資料を消すか、プランを選び直してください。",
    databaseValue: "{size} · 資料 {pages} 件 · 版 {revisions} 件",
    assets: "画像の置き場",
    assetsDetail: "上限は Vercel Blob の料金のページで確かめてください。過去の版の画像も数えています。",
    assetsValue: "{size} · {files} 件",
    assetsValueAtLeast: "{size} · {files} 件以上",
    uncounted: "数えられませんでした",
  },
} as const;
