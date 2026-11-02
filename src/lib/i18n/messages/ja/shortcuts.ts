export const shortcuts = {
  // 一覧のまとまり（src/lib/workspace/keyboard-shortcuts.ts の SHORTCUT_GROUPS）
  groups: {
    general: "全体",
    go: "移動",
  },
  // 何が起きるかを動詞で（一覧・吹き出し・デスクトップアプリのメニューに出す）
  labels: {
    help: "キーボードショートカットを見る",
    search: "この画面の検索欄へ移る",
    goHome: "ホームへ",
    goFiles: "自分の資料へ",
    goFavorites: "お気に入りへ",
    goActivity: "自分の活動へ",
    goLibrary: "{organization} の資料へ",
    goSettings: "個人設定へ",
    newWindow: "新規ウィンドウ",
    back: "戻る",
    forward: "進む",
    reload: "再読み込み",
    settings: "設定…",
  },
  // 一覧の題の下の 1 行。{modifier} は ⌘ か Ctrl
  whileTyping: "文字を入力している間は、{modifier} と一緒に押すものだけが効きます。",
  // キーの札のつなぎ（押し方が 2 つあるとき・続けて押すとき）
  or: "または",
  then: "のあと",
} as const;
