/** Reading order for the example library; stable slide IDs never depend on position. */
export const CATALOG_CHAPTERS = [
 {id:'editorial-covers-guide',name:'表紙・人物紹介',description:'資料を始める形を選ぶ。題名・補足・組織名・発表者を、必要に応じて添えられます。',slides:[
  ['title','基本の表紙'],['editorial-cover-left','文字を左に集める'],['editorial-cover-center','中央にそろえる'],['editorial-cover-editorial','題名と発表者を分ける'],['editorial-cover-window','写真の窓を添える'],['editorial-cover-horizon','写真を下帯にする'],['composition-wide-margin','大きな言葉と小さな写真'],['composition-photo-bleed','全面写真の表紙'],['profile','登壇者・担当者を紹介する']]},
 {id:'editorial-dividers-guide',name:'見出し・章扉',description:'話題の切り替わりを伝える。章名・番号・問いを主役にし、本文へ進む前に区切りをつくります。',slides:[
  ['divider','問いで話題を切り替える'],['editorial-divider-center','中央の一文で区切る'],['editorial-divider-number','章番号を添える'],['editorial-divider-split','章名と問いを左右に置く'],['editorial-divider-photo','写真を上に添える'],['composition-photo-panel','写真に文字の面を重ねる'],['composition-photo-rail','縦帯の写真で区切る']]},
 {id:'compositions-guide',name:'一文・引用・問い',description:'伝える主張、示す定義、考えてほしい問いを一つに絞ります。本文は、その理解を支えるために置きます。',slides:[
  ['message','一文と根拠'],['quote','証言で裏づける'],['definition','用語を定義する'],['question','判断を問いかける'],['qa','問いと判断材料']]},
 {id:'editorial-lists-guide',name:'箇条書き・目次',description:'複数の項目を読む順番にそろえる。文字、絵記号、3つの画像など、項目の内容に合う形を選びます。',slides:[
  ['agenda','話す内容を案内する'],['summary','要点をまとめる'],['editorial-list-bullets','箇条書きを縦に並べる'],['editorial-list-numbered','番号・要点・理由をそろえる'],['editorial-list-columns','文字を3列に並べる'],['editorial-list-symbols','絵記号を添える'],['editorial-list-image-top','3画像の下に説明'],['editorial-list-image-bottom','説明の下に3画像'],['editorial-list-image-rows','画像と説明を3段に'],['editorial-list-image-feature','1項目を大きく見せる'],['editorial-list-photo-aside','写真と3つの要点']]},
 {id:'catalog-images-guide',name:'画像・製品紹介',description:'一枚の画像から、比較・複数画像・注釈へ。写真や画面を、主張の具体例として見せます。',slides:[
  ['image-one','画像一枚と説明'],['composition-split-right','写真を右に置く'],['composition-split-left','写真を左に置く'],['composition-headline-top','言葉の下に写真'],['composition-headline-bottom','写真の下に言葉'],['composition-photo-strip','横帯の写真を添える'],['composition-circle-crop','丸い写真を添える'],['image-two','2画像を比較する'],['image-three','3画像を並べる'],['image-many','複数の画像を一覧にする'],['image-captioning','画像ごとに説明を添える'],['image-treatment','画像の見せ方を変える'],['product','製品でできることを示す'],['screenshot','画面の見る場所を示す']]},
 {id:'catalog-diagrams-guide',name:'流れ・関係の図',description:'順番・分岐・担当・時間など、伝えたい関係に合う図を選びます。',slides:[
  ['process-images','画像で追う3ステップ'],['process-rows','画像と説明を3段に'],['process-feature','最初の一歩を大きく'],
   ['flow-sequence','順番'],['flow-state','状態の変化'],['flow-input-output','入力と出力'],['flow-causal','原因と結果'],['flow-branch','条件で分かれる'],['flow-converge','一つに集まる'],['flow-parallel','同時に進める'],['flow-cycle','循環する'],['flow-swimlane','担当を渡す'],['flow-time','期間を示す'],['flow-hierarchy','階層を示す'],['flow-network','関係をつなぐ'],['flow-set-overlap','条件の重なり'],['flow-quadrant','二つの軸で位置づける']]},
 {id:'catalog-charts-guide',name:'数字・グラフ',description:'主張を決める数字を先に示し、比較・推移・分布などの読み取りを支えます。',slides:[
  ['evidence','重要な数字と背景'],['chart-size','大きさを比べる'],['chart-rank','順位を比べる'],['chart-time','時間の変化'],['chart-composition','全体の内訳'],['chart-change','増減を比べる'],['chart-contribution','増減の内訳'],['chart-distribution','分布とばらつき'],['chart-correlation','二つの量の関係'],['chart-target','実績と目標'],['chart-flow','量の流れ'],['chart-heatmap','濃淡で分布を示す'],['chart-geography','地域ごとの違い'],['chart-forecast','予測とその幅']]},
 {id:'catalog-tables-guide',name:'表・比較・行動計画',description:'条件をそろえて比較し、判断につなげる。担当・期限まで決める表もここにまとめています。',slides:[
  ['table-plain','基本の表'],['table-comparison','案を比較する'],['table-spec-pricing','仕様・料金を比べる'],['table-actual-target','実績と目標を比べる'],['table-evaluation','評価して選ぶ'],['table-roles-dates','担当と期限'],['action','次の行動を決める'],['table-risk','リスクと対策'],['table-checklist','確認項目'],['table-grouped','まとまりごとに読む'],['table-sparklines','表に推移を添える']]},
 {id:'catalog-practice-guide',name:'補足・実演・演習',description:'コードや数式で仕組みを示す。動画・音声・演習で理解を深め、最後に出典へ戻れます。',slides:[
  ['code','コードと出力'],['formula','数式と定義'],['video','動画で見せる'],['audio','音声で伝える'],['exercise','演習する'],['reference','出典をたどる']]},
];
