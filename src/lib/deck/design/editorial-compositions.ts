// i18n-keep-file: 見本の原稿と、見本集（src/lib/deck/design/library.generated.json）に入る構図の名前と説明
/** Authored composition choices. Content remains ordinary source HTML. */
export const DECK_EDITORIAL_COMPOSITIONS = [
  {id:"cover-left",family:"cover",format:"title",name:"文字を左に集める",purpose:"題名を入口にし、補足と発表者へ自然に読み進める。"},
  {id:"cover-center",family:"cover",format:"title",name:"中央にそろえる",purpose:"短い題名と発表者を、落ち着いた一つのまとまりで見せる。"},
  {id:"cover-editorial",family:"cover",format:"title",name:"題名と発表者を分ける",purpose:"大きな題名を左に置き、発表者情報を右の独立した列で読む。"},
  {id:"cover-window",family:"cover",format:"title",name:"写真の窓を添える",purpose:"題名と補足を左へまとめ、右の写真で場の空気を伝える。"},
  {id:"cover-horizon",family:"cover",format:"title",name:"写真を下帯にする",purpose:"上段で資料の目的を伝え、下段の横長写真で印象を残す。"},
  {id:"divider-number",family:"divider",format:"divider",name:"章番号で切り替える",purpose:"章番号と題名を並べ、話の区切りをはっきり示す。"},
  {id:"divider-center",family:"divider",format:"divider",name:"中央の一文で区切る",purpose:"短い題名と補足だけに視線を集め、次の話へ切り替える。"},
  {id:"divider-split",family:"divider",format:"divider",name:"章名と問いを左右に",purpose:"左で現在地、右でこの章の問いを伝える。"},
  {id:"divider-photo",family:"divider",format:"divider",name:"写真を上に添える",purpose:"横長の写真と章題を一組にし、区切りに変化をつける。"},
  {id:"list-bullets",family:"list",format:"summary",name:"箇条書きを縦に",purpose:"三つの要点と理由を、上から順に読む。",images:0},
  {id:"list-numbered",family:"list",format:"summary",name:"番号・要点・理由の3列",purpose:"順番、要点、理由を列で分け、一項目ずつ説明する。",images:0},
  {id:"list-columns",family:"list",format:"summary",name:"文字を3列に",purpose:"同じ重さの三つの特徴を、横に並べて比較する。",images:0},
  {id:"list-image-top",family:"list",format:"image-many",name:"3画像の下に説明",purpose:"画像から要点へ。三つの体験を同じ大きさで紹介する。",images:3},
  {id:"list-image-bottom",family:"list",format:"image-many",name:"説明の下に3画像",purpose:"要点を先に読み、画像で具体的なイメージを補う。",images:3},
  {id:"list-image-rows",family:"list",format:"image-many",name:"画像と説明を3段に",purpose:"画像と説明を一対にし、縦の読み順で丁寧に伝える。",images:3},
  {id:"list-image-feature",family:"list",format:"image-many",name:"大きな1項目と小さな2項目",purpose:"最初の一歩を大きく見せ、続く二つを右側にまとめる。",images:3},
  {id:"list-photo-aside",family:"list",format:"image-one",name:"写真と3つの要点",purpose:"左の写真で全体の場面を伝え、右で三つの価値を読む。",images:1},
  {id:"list-symbols",family:"list",format:"summary",name:"絵記号と3つの要点",purpose:"要点ごとに意味のある印を添え、同じ重さで紹介する。",images:0},
] satisfies readonly {id:string;family:"cover"|"divider"|"list";format:"title"|"divider"|"summary"|"image-one"|"image-many";name:string;purpose:string;images?:number}[];

export const EDITORIAL_ITEMS = [
  {id:"capture",title:"すぐに残せる。",description:"分類を決める前に、\n一文から保存できる。",alt:"ペンを添えた記録用紙。一文を残すことを表す。",image:"assets/concept-capture.svg"},
  {id:"organize",title:"あとで整えられる。",description:"記録を見返しながら、\n意味のある分類を付ける。",alt:"三つの紙を分類ごとに束ねた図。記録の整理を表す。",image:"assets/concept-organize.svg"},
  {id:"share",title:"必要な人に届く。",description:"相手と権限を選び、\n次の判断に役立てる。",alt:"一つの記録を三人へつなぐ図。必要な相手への共有を表す。",image:"assets/concept-share.svg"},
];
