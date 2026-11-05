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
  list: {
    open: "一覧で見る",
    close: "一覧を閉じる",
    columns: "列の数",
    columnsLabel: {
      one: "{count}列",
      other: "{count}列",
    },
    resize: "一覧の幅を変更",
  },
  zoom: {
    guide: "拡大・縮小",
    guideKeysApple: "⌘ を押しながらスクロール、またはピンチ",
    guideKeysOther: "Ctrl を押しながらスクロール、またはピンチ",
  },
  guide: {
    slide: "スライドの操作",
    slideKeys: "一覧で選んで ⌘C・⌘V・⌘D・Delete、⌥↑↓ で並べ替え",
    copyAcross: "別の資料へ貼り付け",
    copyAcrossKeys: "⌘C でコピーし、別のタブ・窓の資料で ⌘V",
    list: "一覧の並べ方",
    listKeys: "下の「一覧で見る」と列の数（一覧で O・-・=）。ドラッグで並べ替え",
  },
  audio: {
    insert: "音声",
    section: "音声",
    note: "発表中は再生バーを隠します。読む表示では再生バーから聴けます。",
    playStart: "発表での始まり",
    playArrive: "スライドに着いたら",
    playClick: "クリックで",
    playManual: "再生ボタンで",
    playRepeat: "繰り返し",
    playLoop: "繰り返す",
    playOnce: "1 回だけ",
    sound: "音",
    soundOn: "出す",
    soundMuted: "消す（ミュート）",
    saved: "音声を置きました（{size}）。発表でスライドに着くと流れます",
    sending: "音声を送っています… {percent}%",
    chooseAudio: "MP3 か M4A の音声を選んでください",
    tooLarge: "音声は{limit}MBまでです（選んだファイルは{size}）",
    replace: "音声を差し替え",
    label: "音声",
  },
} as const;
