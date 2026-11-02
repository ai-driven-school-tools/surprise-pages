// i18n-keep-file: 見本の原稿と、見本集（src/lib/deck/design/library.generated.json）に入る構図の名前と説明
/** Image sequences are ordinary editable HTML; these describe composition, not saved content. */
export const DECK_PROCESS_COMPOSITIONS = [
  { id: "process-images", name: "3枚の画像で手順を見せる", purpose: "同じ大きさの画像と番号を横につなぎ、三つの手順を順番に説明する。" },
  { id: "process-rows", name: "画像と説明を3段で追う", purpose: "上から下へ、一枚の画像とその手順を一対で読む。長めの説明に向く。" },
  { id: "process-feature", name: "最初の一歩を大きく見せる", purpose: "最初に行うことを左に大きく、続く二つを右にまとめる。" },
] satisfies readonly { id: string; name: string; purpose: string }[];

export const PROCESS_ITEMS = [
  { id: "capture", title: "一文を残す", description: "会議のあとに、\n気づいたことを記録する。", image: "assets/concept-capture.svg", alt: "ペンと一枚の記録用紙" },
  { id: "organize", title: "意味でまとめる", description: "記録を見返して、\n関連する内容を整理する。", image: "assets/concept-organize.svg", alt: "分類ごとに整理された三つの記録" },
  { id: "share", title: "相手へ渡す", description: "共有先と権限を選び、\n必要な人に届ける。", image: "assets/concept-share.svg", alt: "一つの記録から三人へつながる共有経路" },
];
