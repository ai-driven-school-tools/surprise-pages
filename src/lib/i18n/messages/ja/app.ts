export const app = {
  description: "{organization} の図解・レポート置き場",
  // 過去の版を開いたときの上端の帯（src/lib/pages/content.ts の withVersionBanner）
  versionBanner: {
    showing: "過去の版（{sha}）を表示しています",
    showingNumber: "過去の版（{version}）を表示しています",
    latest: "最新の版を見る",
  },
  // 名簿に無い人へ返す 403 の紙（src/lib/access/no-access.ts）。中身に触れる文字を置かない
  noAccess: {
    title: "限定公開のページです",
    detail: "このページは、許可された人だけが開けます。あなたはまだ許可されていません。",
    request: "閲覧をリクエスト",
    sending: "送っています…",
    retry: "もう一度送る",
    sent: "お願いを送ってあります。許可されると、このページが開けるようになります。",
    backToList: "ページの一覧へ",
  },
} as const;
