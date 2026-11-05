/**
 * スライドの編集画面の「並べる」まわりの文言（docs/guides/i18n.md）。deckEditor.layers・deckEditor.align・deckEditor.elementMenu の中身。
 * - layers: 右のペインの下端の「レイヤー」の一覧（src/widget/deck/edit/layer-panel.ts）。上ほど前面
 * - align: 揃え・まとめて大きさを変える持ち手・図形の持ち手（src/widget/deck/canvas-*.ts）
 * - elementMenu: キャンバスの右クリックで出す要素の操作（src/widget/deck/edit/element-menu.ts）
 */
export const deckEditorLayers = {
  title: "レイヤー",
  resize: "レイヤーの高さを変更",
  list: "このスライドのレイヤー（上ほど前面）",
  empty: "このスライドには要素がありません",
  expand: "{label}を開く",
  collapse: "{label}を閉じる",
  row: "レイヤー「{label}」",
  locked: "レイヤー「{label}」（位置を固定中）",
  box: "囲み",
  cannotMove: "その位置には移動できません。別の行の上か下へドラッグしてください",
  otherBox: "別の囲みの中へは移動できません。移動するときは、切り取って貼り付けてください",
  unchanged: "並び順は変わりませんでした",
};

export const deckEditorAlign = {
  horizontal: "左右",
  vertical: "上下",
  centerShort: "中央",
  middleShort: "中央",
  toSlide: "スライドの{action}に揃える",
  resizeSelection: "選んだ要素をまとめて拡大・縮小",
  resizeShape: "図形の大きさを変更（矢印キーでも調整できます）",
};

export const deckEditorElementMenu = {
  title: "要素の操作",
  action: "{action} — 要素",
  cut: "切り取り",
  copy: "コピー",
  paste: "貼り付け",
  selectAll: "すべて選択",
};
