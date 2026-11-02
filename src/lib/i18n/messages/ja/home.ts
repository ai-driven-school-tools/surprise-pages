export const home = {
  // 画面の名前は workspace.places.home（サイドバーと同じ名前）
  // 節の名前は中身の種類をそのまま言う（まとめる造語を作らない）。件数は見出しの横に小さく
  sections: {
    comments: "コメントと返信",
    shared: "共有された資料",
    recent: "最近開いたもの",
    fresh: "ほかの人の新しい資料",
  },
  count: { one: "{count} 件", other: "{count} 件" },
  // 節の右端の行き先
  seeAll: "すべて見る",
  // 行の添え書き。{name} は書いた人・共有した人の表示名
  commented: { one: "{name} がコメント {count} 件", other: "{name} がコメント {count} 件" },
  replied: "{name} から返信",
  sharedBy: "{name} が共有",
  sharedWithYou: "共有されました",
  mine: "自分",
  // 「最近開いたもの」が空のとき。記録を残さない設定の人には理由と設定への入口
  recentEmpty: "開いた資料はまだありません",
  recentPaused: "見たページの記録を残さない設定です。",
  recentPausedLink: "個人設定で変えられます",
  freshEmpty: "新しい資料はありません",
} as const;
