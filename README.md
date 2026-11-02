# Surprise Pages（自分専用の資料置き場）— 導入と使い方

AI が作ったドキュメント・図解・スライドを、他者に共有するためのツールです。

この README は、設置の手順書を兼ねています。第 3 章を上から順に進めると、アカウントの準備から、最初の資料の投稿までが終わります。

- 提供元: 株式会社Surprise（ADS Pro 受講生向けの配布版）
- 利用規約: ルートの [LICENSE](LICENSE)。**受講生と提供元が個別に許可した方が、個人の学習と本人の業務で使えます。** ソフトウェア本体・改変版の販売・有料サービス化・有料教材への組み込み配布には、提供元の事前の許可（メール可・申請は所定の窓口）が必要です。作った資料の共有・有料納品・販売は認められます。
- 開発するの決まりは [AGENTS.md](AGENTS.md)。


| 章   | 内容                                      |
| --- | --------------------------------------- |
| 1   | これは何か（できること・費用・規約の要点）                   |
| 2   | 全体の形（どこで何が動くか）                          |
| 3   | セットアップ（3-1 〜 3-11。設置はこの 1 回だけ）          |
| 4   | 普段の使い方（作る・投稿する・招待する・コメントを受けて直す・更新を受け取る） |
| 5   | 困ったとき（症状から戻る・問い合わせ先）                    |




## 1. これは何か

Surprise Pages は、文章や図解・スライドを、自分で招待した相手に共有するためのツールです。

```text
 自分のパソコン                          自分のサイト（Vercel）            招待した相手
 ┌──────────────────────┐   投稿   ┌──────────────────────┐   招待   ┌────────────┐
 │ 原本（企画書・議事録）│ ──────▶ │ 資料の画面・ログイン │ ──────▶ │ 読む       │
 │ AI＋この配布物のスキル│         │  本文: Neon          │         │ コメントする│
 │                      │ ◀────── │  画像: Vercel Blob   │ ◀────── │            │
 └──────────────────────┘ 取り寄せ └──────────────────────┘ コメント └────────────┘
```

できること

- 原本（マークダウンやテキスト）を、内容は変えずに見やすい共有ページにする。
- 図解・レポート・スライドを AI に作らせて共有する。
- 招待した人だけに見せる。相手は Google アカウントでログインして読む。
- 共有した文章や図解にコメントを付ける。
- コメントを元にAIに修正させる 、同じ URL の新しい版として直す。

費用と契約

- この手順は Vercel **Hobby**（個人の非商用）・Neon **Free** で作る構成です。仕事で使う場合は、各サービスの契約条件を確認してください。[Vercel の利用条件](https://vercel.com/docs/limits/fair-use-guidelines)、[Neon の料金](https://neon.com/pricing)。
- 無料枠の目安と、超えたときに起きることは第 4-6 章を参照。

利用規約の要点（全文は [LICENSE](LICENSE)。）

- 受講生と提供元が個別に許可した方が、個人の学習・趣味・本人の業務（勤務先で担当する業務を含む）のために、自分が管理する環境へ置いて使い、複製し、改変できます。卒業後も継続利用できます。
- 勤務先の環境にも設置できますが、管理は利用を許可された本人が行います。同僚などは資料の閲覧・コメントができます。共同管理や第三者への管理の引継ぎには、提供元の別途の許可が必要です。退職などで管理できなくなるときは、作った資料を勤務先に残せます。ソフトウェアは止めるか、提供元に相談します。
- 資料を作る・管理する機能を使えるのは本人だけです。無償でも、ほかの人に使わせることはできません。
- 本人が作った資料（文章・図解・スライド）は、顧客などへ共有し、業務で使い、有償で納品・販売し、教材に使えます。成果物に含まれる第三者の著作物などの利用条件は、本人が確認します。
- このソフトウェア本体・改変版の販売、有料サービス化、有料教材・講座・会員特典への組み込み配布には、提供元の事前の許可（メール可・申請は所定の窓口）が必要です。
- 原則として、無償でもソフトウェア本体・改変版をほかの人（ほかの受講生を含む）へ再配布できません。ただし、本人の設置・運用・改変に必要な外部サービスへの保存・送信、保管サービスの規約で認められる公開リポジトリの閲覧・フォーク、資料の共有・表示に必要なコードの同梱など、LICENSE に定める例外は認められます。公開リポジトリから取得できても、誰でも設置・利用できるわけではありません。改変を加えた自分のリポジトリは非公開にします。
- 著作権・許諾表示を残し、提供元が運営・承認・保証していると誤認させなければ、サイト名・ロゴ・アイコンを変更できます。「Surprise Pages」の名前は、このソフトウェアを指して説明するときだけ使え、サイト名や改変版の名前にはできません。
- 運用・費用・設定・セキュリティ・バックアップは本人が管理します。稼働・データ保存・改変版の動作は保証せず、継続的な更新、個別の設置代行や改変版の修復作業も約束しません。受講期間中の講座における質問対応は、この制限とは別です。
- 違反があると提供元が是正を求めます。是正されないときは許可が終わり、ソフトウェアを削除します（作った資料はそのまま使えます）。
- 適用されるのは、ソフトウェアを取得した時点で付いていた版の LICENSE です。



## 2. 全体の形

```text
 ┌─ 自分のパソコン ─────────────────────────────────────────────────┐
 │ Cursor / Claude Code（AI）                                       │
 │ 配布物のフォルダ: スキル・雛形・投稿コマンド・設定の控え(.env)   │
 └──────────────┬──────────────────────────┬────────────────────────┘
                │ git push                 │ node bin/pages-publish.mjs（投稿）
                ▼                          ▼
 ┌─ GitHub ─────────────┐   ┌─ Vercel ─────────────────────────────────────────────────────┐
 │ surprise-pages       │──▶│ プロジェクト surprise-pages（サイトの画面・ログイン）        │
 │ 自分用のコードの複製 │   │   Storage ┬ Neon  surprise-pages-db  （本文・コメント・版）  │
 └──────────────────────┘   │           └ Blob  surprise-pages-blob（画像。非公開）        │
                            │   Environment Variables（9 項目の設定）                      │
                            └───────────────────────┬──────────────────────────────────────┘
                                                    │ Google でログイン
                                                    ▼
                            ┌─ Google Cloud ───────────────────────────────────────────────┐
                            │ プロジェクト Surprise Pages（ログインの入口・テストユーザー）│
                            └──────────────────────────────────────────────────────────────┘
```


| 名前                   | 何か                  | 今回の役割                |
| -------------------- | ------------------- | -------------------- |
| GitHub               | コードと変更履歴を置くサービス     | 自分用に受け取ったサイトのコードを置く  |
| Vercel               | サイトを動かすサービス         | 資料を開く画面とログインの仕組みを動かす |
| Neon                 | データベースのサービス         | 本文・コメント・過去の版を保存する    |
| Vercel Blob          | ファイルを置くサービス         | 画像を非公開で保存する          |
| Google Cloud         | Google のサービスを設定する画面 | 「Google でログイン」の入口を作る |
| Cursor / Claude Code | AI を使う道具            | 資料を作り、投稿し、コメントを取り寄せる |


設置で手元に作る設定ファイルは `.env.setup` の 1 つだけです。3-7 で作り、以後の手順で値を足していきます。秘密の値を含むので GitHub へは送られません（`.gitignore` に入っています）。


| 行                                                          | 中身                                       | 足す手順 |
| ---------------------------------------------------------- | ---------------------------------------- | ---- |
| `DATABASE_ADMIN_URL`                                       | データベースを初期化・復旧するための接続情報。**Vercel へは入れない** | 3-7  |
| `PAGES_OWNER_EMAIL`                                        | 自分の Google アドレス                          | 3-7  |
| `DATABASE_URL`                                             | サイトの通常運転用の接続情報（初期化コマンドが追記する）             | 3-7  |
| `AUTH_GOOGLE_ID` `AUTH_GOOGLE_SECRET`                      | Google ログインの Client ID と Client secret   | 3-8  |
| `AUTH_SECRET` `CRON_SECRET`                                | 乱数の鍵 2 つ（コマンドが追記する）                      | 3-9  |
| `BLOB_READ_WRITE_TOKEN` `PAGES_SITE_URL` `PAGES_SITE_NAME` | 画像の置き場の鍵・サイトの URL・ツールの名前                 | 3-9  |


`DATABASE_ADMIN_URL` 以外の 9 行を Vercel へ入れます。診断（3-11）と控え（4 章）もこのファイルを読みます。

## 3. セットアップ

設置は 1 回きりです。3-1 から 3-11 まで順に進めます。所要時間は 1 時間ほどです。

### 進め方

各手順は同じ形で書いてあります。

```text
 ### 3-n. 手順の名前
 目的        この手順で何ができるようになるか
 画面        どのサービスの、どの画面を開くか
 操作        1 行 1 動作。押す・入力する・確認する
 済んだ目印  これが見えていれば次へ進める
 止まったら  よくある止まり方と、戻る場所
```

ログイン、本人確認、規約への同意、秘密の値の貼り付けは本人が行います。それ以外の操作は、本人が行っても AI が行っても構いません。

AI に手伝わせるときは、1 手順ずつ区切って頼みます。

```text
README の第 3-○ 章だけを進めてください。
対象は、今回作る私個人のサイトです。
手順の「操作」を上から順に行い、「済んだ目印」が見えたら止まって報告してください。
ログイン、規約への同意、秘密の値の貼り付けは私が行います。その手前で止めて、何をすればよいか教えてください。
既に済んでいる設定は作り直さず、確認して飛ばしてください。
パスワードや秘密の鍵をチャット・ログ・画像に出さないでください。
有料への変更、別の環境の変更、データの削除は行わないでください。
```

画面の文字は **太字** で、画面に出ているとおりに書いています。日本語表示の名前は括弧で添えています。コマンドは、ターミナルに貼り付けて Enter を押します。

### 設置の全体


| 手順   | すること                                     | 済んだ目印                               |
| ---- | ---------------------------------------- | ----------------------------------- |
| 3-1  | Google・GitHub・Vercel のアカウントを用意する         | Vercel の画面に自分の名前と **Hobby** が出る     |
| 3-2  | 配布物を取得し、部品を入れる                           | `corepack pnpm install` がエラー無く終わる   |
| 3-3  | 自分の非公開 GitHub リポジトリ `surprise-pages` に置く | GitHub にコードが見える                     |
| 3-4  | Vercel にプロジェクト `surprise-pages` を作る      | サイトの URL が控えてある                     |
| 3-5  | Neon `surprise-pages-db` を作ってつなぐ         | Storage に **Available** で並ぶ         |
| 3-6  | 非公開 Blob `surprise-pages-blob` を作ってつなぐ   | Storage に 2 つ並ぶ                     |
| 3-7  | 本文の保管庫を初期化する                             | `.env.setup` に `DATABASE_URL` が足される |
| 3-8  | Google でログインする入口を作る                      | `.env.setup` に Google の 2 つの値がある    |
| 3-9  | Vercel に 9 項目の設定を入れ、再ビルドしてログインする         | 自分のサイトのホームが開く                       |
| 3-10 | このパソコンから投稿できるようにする                       | 「ログインしました」と出る                       |
| 3-11 | 見本を投稿し、設置を診断する                           | 「設置はそろっています。」と出る                    |




### 3-1. アカウントを用意する

**目的** 自分のサイトを、自分のアカウントで管理できるようにします。GitHub・Vercel・Google Cloud の 3 つを、すべて自分の個人用アカウントでそろえます。

**画面** ブラウザで、Google・GitHub・Vercel・Google Cloud Console をそれぞれ開きます。

**操作**

1. [Google アカウント](https://accounts.google.com/)を開き、画面右上の丸いプロフィール画像を押します。表示されたメールアドレスが、このサイトの持ち主にする自分のアドレスであることを確認し、控えます。この後、データベースの初期化、Vercel の設定、サイトへのログインで、すべて同じアドレスを使います。
2. [GitHub](https://github.com/)を開き、自分の個人用アカウントにログインします。アカウントがない場合は、右上の **Sign up** から登録します。
3. 右上のプロフィール画像を押し、自分の GitHub のユーザー名を控えます。
4. [Vercel](https://vercel.com/login)を開きます。**Continue with GitHub** を押し、手順 2 の個人用 GitHub アカウントを選びます。新しく登録する場合は **Sign Up** から進めます。
5. Vercel のダッシュボードが開いたら、画面左上のアカウント・チームの切り替えを押します。自分の個人用の置き場を選び、名前の横に **Hobby** と表示されていることを確認します。
6. [Google Cloud Console](https://console.cloud.google.com/)を開きます。右上のプロフィール画像から、手順 1 の Google アカウントになっていることを確認します。

**済んだ目印** GitHub と Vercel の両方で、所有者が自分の個人用アカウントになっています。Vercel の置き場の横に **Hobby** が出ています。

**止まったら**

- 新規登録で規約が表示された。内容を確認して同意します。パスキーや認証アプリの本人確認も本人の端末で行います。
- 復旧コードが表示された。パスワード管理アプリの自分専用の保管庫に保存し、件数を確認してから「保存した」のチェックを入れて進みます。
- Vercel の置き場に会社のチームしか出ない。右上のプロフィールから一度ログアウトし、個人用の GitHub アカウントでログインし直します。



### 3-2. 配布物を取得して部品を入れる

**目的** サイトを動かすコードと、手元から投稿する道具を自分のパソコンに用意します。

**画面** Cursor（Claude Code を使う場合も、同じフォルダで同じコマンドを実行します）。

**操作**

1. 次の道具が入っていることを確認します。講座のパソコン準備で済んでいるはずです。Windows は WSL2 と、Cursor から WSL2 へ接続する準備も済ませます。以後のコマンドは WSL 側のターミナルで実行し、配布物も WSL 側のホームフォルダに置きます。Node.js は 24 系の最新版を入れます。25 以降の版には、3-2 で使う corepack が付いていないため、途中で止まります。


| 道具      | 何に使うか             | 必要な版              | 公式の案内                                      |
| ------- | ----------------- | ----------------- | ------------------------------------------ |
| Node.js | サイトの準備や投稿コマンドを動かす | 24 系の最新版         | [Node.js](https://nodejs.org/en/download)  |
| Python  | 清書やスライドの補助処理を動かす  | 3.10 以降           | [Python](https://www.python.org/downloads) |
| Git     | コードの変更履歴を扱う       | 入っていればよい          | [Git](https://git-scm.com/downloads)       |
| GitHub CLI（`gh`） | 3-3 で自分の GitHub へ送るときの認証 | 入っていればよい | [GitHub CLI](https://cli.github.com/) |
| pnpm    | サイトに必要な部品をそろえる    | corepack が自動でそろえる | 用意不要                                       |


GitHub CLI（`gh`）は、講座のパソコン準備に含まれていません。手順 2 でターミナルを開いたら、`gh --version` を実行します。版の数字が出なければ、次のどちらかで入れます。AI に「GitHub CLI を入れて」と頼んでも構いません。

- Mac：`brew --version` で版の数字が出れば、`brew install gh` を実行します。出なければ、[GitHub CLI](https://cli.github.com/) の **Download for Mac** から入れ物（`.pkg`）を取り、開いて画面のとおりに入れます。
- Windows（WSL2）：WSL 側のターミナルで `sudo apt update && sudo apt install -y gh` を実行します。途中で聞かれるパスワードは、WSL を作ったときに決めたものです。

1. Cursor を起動し、画面上部の **Terminal → New Terminal**（ターミナル → 新しいターミナル）を押します。画面下に文字を入力できる欄が開きます。以降の「実行する」は、この欄へ貼り付けて Enter を押す操作です。
2. 次を実行し、ホームフォルダに講座用のフォルダを作ります。

```bash
mkdir -p ~/pages-course
cd ~/pages-course
```

1. 次の `配布物のURL` を、いま読んでいるこのリポジトリの URL に置き換えて実行します。URL は、GitHub のこのリポジトリの画面で緑の **Code** ボタンを押し、**HTTPS** の欄に出ているものです。後ろの `surprise-pages-distribution` はそのまま使います。**ZIP のダウンロード（Download ZIP）ではなく、必ずこのコマンドで取得します。** ZIP には、3-3 以降と更新の受け取りで使う git の記録が入っていません。既にこのコマンドで取得済みなら、この手順は飛ばします。

```bash
git clone 配布物のURL surprise-pages-distribution
```

1. ダウンロードが終わったら、Cursor 上部の **File → Open Folder…**（ファイル → フォルダーを開く）を押し、ホームフォルダの **pages-course → surprise-pages-distribution** を開きます。
2. 左側のファイル一覧に `README.md`、`package.json`、`deployment.json`、`src`、`scripts`、`bin` が並んでいることを確認します。
3. もう一度 **Terminal → New Terminal** を押します。このフォルダを開いた状態のターミナルを、以後ずっと使います。
4. 次を 1 行ずつ実行し、版を確認します。

```bash
node --version
python3 --version
git --version
gh --version
corepack enable
corepack pnpm --version
```

1. Node.js は `v24.` で始まる数字、Python は `Python 3.10` 以上、Git・GitHub CLI・pnpm は版の数字が表示されることを確認します。
2. 次を実行し、サイトが使う部品を入れます。

```bash
corepack pnpm install --frozen-lockfile
```

1. 処理が終わり、次のコマンドを入力できる状態に戻るまで待ちます。途中で `esbuild` の build script を無視したという警告が出ても、そのまま進めて構いません。

**済んだ目印** Cursor の左側に配布物のファイルが並び、部品の導入が終わって、ターミナルで次の入力ができます。

**止まったら**

- ZIP で取得していた（フォルダに `.git` が無い、フォルダ名が `-main` で終わる）。そのフォルダは使わず、手順 4 のコマンドで取り直し、手順 5 から進めます。
- `gh: command not found` と出る。GitHub CLI が入っていません。手順 1 の表の下の方法で入れ、手順 8 からやり直します。Mac の `.pkg` で入れた直後は、ターミナルを開き直してから試します。
- `corepack: command not found` と出る。`node --version` が `v25.` 以降なら、その版には corepack が付いていません。Node.js 24 系の最新版を入れ直し、手順 8 からやり直します。`v24.` なのに出る場合は、別のフォルダへ移ると Node.js が見つからなくなる環境です。入れたときの案内どおりに有効化してから、手順 8 からやり直します。
- Python が `3.9` などと出る。Mac 標準の Python です。Homebrew などで入れた別の Python が入っている場合は `python3.12 --version` のように版を付けて確かめ、見つかった方を使います。無ければ公式の案内から 3.10 以降を入れます。
- Windows / WSL2 で、以後の「**Command + S**」は **Ctrl + S** に読み替えます。



### 3-3. GitHub に自分の複製を置く

**目的** 配布物を自分の非公開リポジトリに置き、Vercel がそこからサイトを作れるようにします。

**画面** GitHub の [リポジトリ作成画面](https://github.com/new)。画面上部に **Create a new repository** と出ています。

**操作**

1. **Owner** を押し、自分の個人用 GitHub ユーザーを選びます。
2. **Repository name** に `surprise-pages` と入力します。**Description** は空欄のままで構いません。
3. **Choose visibility** の選択欄を押し、**Private** を選びます。表示が **Private** に変わったことを確認します。
4. **Start with a template** は **No template**、**Add README** はオフ、**Add .gitignore** は **No .gitignore**、**Add license** は **No license** のままにします。
5. 画面下部の緑色の **Create repository** を押します。
6. 作成後の **Quick setup** で **HTTPS** を選び、`https://github.com/自分のユーザー名/surprise-pages.git` の右にあるコピーのアイコンを押します。
7. Cursor のターミナルへ戻り、次を実行します。配布元を `upstream` という名前に変え、更新を受け取れるようにします。

```bash
git remote rename origin upstream
```

1. 次を実行し、GitHub CLI で自分の個人用 GitHub アカウントにログインします。GitHub はパスワードでの送信を受け付けないので、git がパスワードを聞いてくる状態のままでは、正しいパスワードを入れても手順 11 が失敗します。

```bash
gh auth login --hostname github.com --git-protocol https --web
```

1. ターミナルに `First copy your one-time code: XXXX-XXXX` と 8 文字のコードが出ます。控えてから Enter を押します。ブラウザで GitHub の画面が開くので、コードを入れて **Continue**、続けて **Authorize github** を押します。ブラウザが開かない（WSL で多い）ときは、ターミナルに出た `https://github.com/login/device` を自分でブラウザに貼って開きます。`Authenticate Git with your GitHub credentials?` と聞かれたら、Enter（Yes）を押します。
2. ターミナルに `Logged in as 自分のユーザー名` と出たことを確認し、次を実行します。git が送信のときの認証を GitHub CLI に任せるようになり、以後パスワードを聞かれません。

```bash
gh auth setup-git
```

1. 次の `自分のリポジトリのURL` を、手順 6 でコピーした URL に置き換えて実行します。

```bash
git remote add origin 自分のリポジトリのURL
git push -u origin main
```

1. ブラウザの GitHub リポジトリ画面を再読み込みします。

**済んだ目印** リポジトリ名の横に **Private**、枝の選択欄に **main** と表示され、`src`、`scripts`、`README.md` などのファイルが並んでいます。

**止まったら**

- `No such remote` や `not a git repository` と出る。ZIP で取得したフォルダで作業しています。3-2 の手順 4 に戻り、`git clone` で取り直します。
- `remote origin already exists` と出る。手順 7 を飛ばしています。手順 7 を実行してから手順 11 をやり直します。
- `Username for 'https://github.com':` とユーザー名やパスワードを聞かれる。手順 8〜9 のログインが済んでいません。Ctrl + C で止め、`gh auth status` で `Logged in` と出るか確かめます。出なければ手順 8 から、出れば手順 10 の `gh auth setup-git` からやり直し、手順 11 の `git push -u origin main` だけをもう一度実行します。
- `Permission denied` や `403` と出る。別の GitHub アカウントでログインしています。`gh auth status` で出たユーザー名が 3-1 で控えた自分のユーザー名と同じか確かめ、違えば `gh auth logout` してから手順 8 からやり直します。
- `Logged in as` に出たユーザー名が自分のものでない。ブラウザで別のアカウントにログインしたまま承認しています。ブラウザの GitHub から一度ログアウトし、`gh auth logout` してから手順 8 からやり直します。



### 3-4. Vercel にサイトを作る

**目的** 自分の GitHub リポジトリから、サイトを動かす Vercel のプロジェクトを作り、サイトの URL を決めます。

**画面** [Vercel](https://vercel.com/) のダッシュボード。

**操作**

1. 左上の切り替え欄で、自分の個人用の置き場を選びます。名前の横の **Hobby** を確認します。
2. **Add New… → Project** を押します。画面によっては **Create New → Project** です。[New Project](https://vercel.com/new)を直接開いても同じです。
3. **Import Git Repository** の下で GitHub のユーザー選択欄を押し、自分のユーザー名を選びます。
4. 検索欄に `surprise-pages` と入力し、一覧に出た `surprise-pages` の行の右端にある **Import** を押します。
5. GitHub との接続を求める画面が出た場合は、**Continue with GitHub** から自分の個人用アカウントへ進みます。リポジトリの許可は **Only select repositories** を選び、`surprise-pages` を指定してから **Install** を押します。
6. **New Project** の画面で、取り込むリポジトリが `自分のユーザー名/surprise-pages` であることを確認します。
7. **Vercel Team** に自分の置き場と **Hobby**、**Project Name** に `surprise-pages`、**Root Directory** に `./`、**Application Preset** に **Next.js** が入っていることを確認します。
8. **Build and Output Settings** と **Environment Variables** は開かず、そのままにします。
9. **Deploy** を押します。
10. プロジェクトが作成されたら **Continue to Dashboard** を押します。最初のビルドは待たずに進めて構いません。設定を入れた後の 3-9 でもう一度ビルドします。
11. プロジェクトの **Settings → Domains** を開きます。左側のメニューの **Domains** でも同じです。
12. 割り当てられた `○○.vercel.app` のドメインを確認し、先頭に `https://` を付けた URL を控えます。例は `https://surprise-pages-example.vercel.app` です。末尾に `/` やページのパスは付けません。

**済んだ目印** Vercel に `surprise-pages` のプロジェクトがあり、自分のサイトの URL が控えてあります。以後の **自分のサイトのURL** は、この URL を指します。

**止まったら**

- 一覧に `surprise-pages` が出ない。手順 3 で選んだ GitHub ユーザーが自分か、手順 5 の許可に `surprise-pages` が入っているかを確認します。
- 組織のリポジトリを選んで **Pro** が必要と出た。配布元のリポジトリを直接は取り込めません。3-3 で作った自分の `surprise-pages` を選びます。



### 3-5. Neon を作る

**目的** 本文・コメント・過去の版を保存するデータベースを Neon に作り、サイトにつなぎます。

**画面** Vercel の `surprise-pages` プロジェクトの **Storage**。左側のメニュー、または上部の **Storage** にあります。

**操作**

1. **Storage** を開き、右上の **Create Storage** を押します。
2. **Browse Storage** の **Marketplace Database Providers** から **Neon / Serverless Postgres** を押し、右下の **Continue** を押します。
3. 初回は **Install Integration** の規約画面が出ます。規約と、Vercel から Neon へ共有される情報を確認し、同意する場合は下部の **Accept and Create** を押します。
4. **Configuration and Plan** の **Region** の選択欄を押し、**Singapore (Southeast) / sin1** を選びます。
5. **Region** の下の **Auth** のスイッチを押し、オフにします。オフではスイッチが灰色になり、丸が左側に寄ります。
6. **Installation Plan** に **Free** と表示されていることを確認し、**Continue** を押します。
7. **Confirmation** の **Resource Name** に `surprise-pages-db` と入力します。確認欄に **Region Singapore**、**Auth False**、**Free** と出ていることを確認し、**Create** を押します。
8. **Connect a Project** が表示されたら、プロジェクトに `surprise-pages` を選びます。
9. **Environments** で **Production** だけにチェックを入れます。**Preview** と **Development** は外します。**Sensitive** が表示されている場合はオンにします。
10. デプロイ用ブランチを追加する項目は選ばず、**Connect** を押します。

**済んだ目印** Neon の詳細画面の **Connected Projects** に `surprise-pages` と **Production** が表示されています。**Storage** の一覧に `surprise-pages-db` が **Available** で並んでいます。

**止まったら**

- 規約画面で止まっている。AI に進めさせている場合は、ここは本人が同意します。
- 作成後に Vercel の **Environment Variables** に `DATABASE_URL` などが増えている。Neon が自動で入れた管理用の接続情報です。3-9 で控えを取ってから外します。ここでは触りません。



### 3-6. 画像の保管先を作る

**目的** 資料に載せる画像を、非公開のまま置く場所を作り、サイトにつなぎます。

**画面** Vercel の `surprise-pages` プロジェクトの **Storage**。

**操作**

1. **Storage** で、右上の **Create Storage** を押します。
2. **Browse Storage** の上のほうにある **Blob / Fast object storage** を押し、右下の **Continue** を押します。
3. **Create Blob Store** の **Store Name** に `surprise-pages-blob` と入力します。
4. **Region** を押し、**Asia Pacific** の **Tokyo, Japan (Northeast) – hnd1** を選びます。
5. **Access** の 2 つの候補のうち、上の **Private** が選ばれていることを確認します。
6. **Custom Environment Variable Prefix** は空欄のままにします。
7. 下部の **Add a read-write token env var to this connection** の四角にチェックを入れます。
8. **Environment variables that will be created** に **BLOB_READ_WRITE_TOKEN** が増えたことを確認し、**Create** を押します。

**済んだ目印** 作成後の Blob の画面で、名前の横に **Private**、地域に **HND1** が出ています。**Storage** の一覧に `surprise-pages-db` と `surprise-pages-blob` の 2 行があり、どちらも接続先に `surprise-pages` が出ています。

**止まったら**

- **BLOB_READ_WRITE_TOKEN** が一覧に無い。手順 7 のチェックを入れずに作っています。Blob の画面の **Settings** から `surprise-pages` への接続を開き、読み書きの鍵を追加するか、Blob を作り直します。



### 3-7. 本文の保管庫を初期化する

**目的** 新しい空のデータベースに必要な表を作り、サイトの通常運転用の接続情報を用意します。初期化は最初の 1 回だけ行います。

初期化用の接続情報（`DATABASE_ADMIN_URL`）と、通常運転用の接続情報（`DATABASE_URL`）は別の値です。前者は `.env.setup` に手で書き、後者は初期化コマンドが同じ `.env.setup` の末尾に足します。Vercel へ登録するのは `DATABASE_URL` の方だけです。

**画面** Vercel の **Storage** で `surprise-pages-db` を開いた画面と、Cursor。

**操作**

1. `surprise-pages-db` の **Getting Started** を開き、環境変数の案内の **.env.local** を押します。
2. **DATABASE_URL_UNPOOLED** の行を探します。これが初期化に使う接続情報です。
3. 値が隠れている場合は **Show secret** を押し、`postgresql://` または `postgres://` で始まる接続情報全体をコピーします。
4. Cursor の左側のファイル一覧で、一番上の `surprise-pages-distribution` フォルダを右クリックし、**New File**（新しいファイル）を押します。ファイル名に `.env.setup` と入力して Enter を押します。先頭の点も入れます。
5. 開いたファイルに次の 4 行を入れます。`< >` の中を自分の値に置き換え、`< >` 自体も消します。接続情報が引用符で囲まれていた場合は外側の引用符を除き、途中で改行せず 1 行にします。`#` で始まる 2 行は自分への注意書きで、そのまま残します。

```dotenv
# この 1 行だけは Vercel に入れない（初期化・復旧用）
DATABASE_ADMIN_URL=<コピーしたNeonの初期化用接続情報>
# ---- ここから下の行を Vercel へ入れる ----
PAGES_OWNER_EMAIL=<自分のGoogleメールアドレス>
```

1. **Command + S** で保存します。
2. ブラウザへ戻り、**Hide secret** を押して接続情報を隠します。
3. ターミナルで次を実行します。`chmod 600` は、ファイルを本人だけが読み書きできるようにするコマンドです。

```bash
chmod 600 .env.setup
```

1. 対象が今回新しく作った `surprise-pages-db` であることを確認し、次を実行します。

```bash
node --env-file=.env.setup scripts/setup/database.mjs init --confirm-new
```

1. 「初期化しました」と表示されたら、Cursor で `.env.setup` を開き直します。末尾に `DATABASE_URL=` の行が足されています。これが通常運転用の接続情報で、`DATABASE_ADMIN_URL` とは別の値です。
2. 次を実行します。`git check-ignore` は、GitHub へ送らないファイルに指定されているかを確かめるコマンドです。

```bash
git check-ignore .env.setup
```

**済んだ目印** `.env.setup` と表示され、`.env.setup` の末尾に通常運転用の `DATABASE_URL` が入っています。

**止まったら**

- 初期化を断られた。今回専用の空の保存先か、既に初期化済みではないかを確認します。保存先を削除して通そうとしないでください。
- 「Neon only supports being given plaintext passwords」と出る。古い版の配布物です。第 4-5 章の手順で更新を取り込んでから、手順 9 をやり直します。



### 3-8. Google でログインする入口を作る

**目的** 自分と招待相手が、Google アカウントでサイトへ入れるようにします。Google Cloud にこのサイト専用のプロジェクトを作り、ログインの入口（OAuth クライアント）を発行します。

**画面** [Google Cloud Console](https://console.cloud.google.com/)。右上のプロフィール画像が、3-1 で控えた Google アカウントになっていることを確認します。

**操作**

プロジェクトを作る

1. 画面上部の **Google Cloud** ロゴの右にある、プロジェクト名の選択ボタンを押します。
2. 右上の **新しいプロジェクト** を押します。
3. **プロジェクト名** に `Surprise Pages` と入力します。個人用アカウントでは **組織** または **場所** が **組織なし** になっていることを確認します。
4. **作成** を押します。作成が終わったら、上部の選択ボタンをもう一度開き、`Surprise Pages` を選びます。上部に `Surprise Pages` が表示されていることを確認します。

同意画面を作る

1. 左上の三本線のメニューから **API とサービス → OAuth 同意画面** を押します。**Google Auth Platform** の画面が開きます。
2. 中央の **開始** を押します。
3. **アプリ情報** の **アプリ名** に `Surprise Pages` と入力し、**ユーザー サポートメール** で自分の Google アドレスを選び、**次へ** を押します。
4. **対象** で **外部**（External）を選び、**次へ** を押します。
5. **連絡先情報** に自分のメールアドレスを入れ、**次へ** を押します。
6. **終了** の画面で、Google API サービスのユーザーデータポリシーを確認し、同意する場合はチェックを入れます。**続行** を押し、**作成** を押します。

ログインの入口を作る

1. 左側のメニューで **クライアント** を押し、**クライアントの作成** を押します。
2. **アプリケーションの種類** を押し、一番上の **ウェブ アプリケーション** を選びます。
3. **名前** に `Surprise Pages Web` と入力します。
4. 下へ進み、**承認済みのリダイレクト URI** の下の **URI を追加** を押します。上にある **承認済みの JavaScript 生成元** のボタンとは別です。
5. **URI 1** の欄に、自分のサイトの URL の後ろへ `/api/auth/callback/google` を付けて入力します。

```text
https://自分のドメイン.vercel.app/api/auth/callback/google
```

1. 先頭が `https://`、末尾が `/api/auth/callback/google` であることを確認します。**承認済みの JavaScript 生成元** は空欄、**Use this client for an AI-powered agent** はチェック無しのままにします。
2. **作成** を押します。

2 つの値を保存する

1. 作成結果に **クライアント ID**（Client ID）と **クライアント シークレット**（Client secret）が表示されます。この画面は、保存が済むまで閉じません。
2. Cursor で `.env.setup` を開き、末尾に次の 2 行を足します。

```dotenv
AUTH_GOOGLE_ID=<Client ID>
AUTH_GOOGLE_SECRET=<Client secret>
```

1. Client ID のコピーアイコンを押し、`AUTH_GOOGLE_ID=` の右側へ貼り付けます。Client secret も同じように `AUTH_GOOGLE_SECRET=` の右側へ貼り付けます。見本の `<Client ID>` と `<Client secret>` が残っていないことを確認し、保存してから Google の作成結果の画面を閉じます。

自分をテストユーザーに登録する

1. 左側の **対象**（Audience）を押します。**公開ステータス** が **テスト中**、**ユーザーの種類** が **外部** であることを確認します。
2. **テストユーザー** の下の **ユーザーを追加**（Add users）を押します。
3. 自分の Google アドレスを入れて Enter を押し、1 つの項目として確定したら **保存**（Save）を押します。

**済んだ目印** `.env.setup` に Google の 2 つの値が入り、Google Auth Platform の **クライアント** に `Surprise Pages Web`、**対象** のテストユーザーに自分のアドレスが表示されています。

**止まったら**

- 会社のアカウントで **組織なし** に作れない。会社の組織の中に専用のプロジェクトを新しく作ります。既存のプロジェクトは使いません。
- 作成結果の画面を閉じてしまった。**クライアント** の一覧で `Surprise Pages Web` を開くと Client ID は見えます。Client secret は再発行が必要なので、新しいクライアントを作り直します。



### 3-9. サイトへ設定を渡し、起動する

**目的** ここまでに手元へ集めた設定 9 項目を Vercel の本番に入れ、サイトを起動して、自分の Google アカウントで入ります。ツールの名前もここで決めます。

**環境変数** は、コードとは別にサイトへ渡す設定です。`名前=値` の左が設定名、右がその値です。まず手元の `.env.setup` に残りの値を足して 9 項目をそろえ、それを Vercel へ 1 項目ずつ入力します。

**画面** Cursor と、Vercel の `surprise-pages` の **Settings → Environment Variables**。

**操作**

乱数の鍵を 2 つ作る

1. 次を実行します。ログイン用の `AUTH_SECRET` と、毎日の片付け用の `CRON_SECRET` を、画面に表示せずに `.env.setup` の末尾へ足します。`CRON_SECRET` がないと、古い閲覧記録を消す日次の片付けが断られるため、必ず登録します。

```bash
node scripts/setup/secrets.mjs
```

1. 「2 つの鍵を .env.setup に追記しました。」と表示されることを確認します。

残りの 3 項目を `.env.setup` に足す

1. Vercel の **Storage** で `surprise-pages-blob` を開き、左側の **Getting Started** を押し、中央のコード欄の **.env.local** を押します。
2. **Show secret** を押し、**BLOB_READ_WRITE_TOKEN=** の右側の値をコピーします。コピーしたら **Hide secret** に戻します。
3. Cursor で `.env.setup` を開き、末尾に次の 3 行を足します。
4. `< >` の部分を下の表のとおりに置き換えます。各行の右側には値だけを入れ、`BLOB_READ_WRITE_TOKEN=` などの名前を二重に貼り付けないようにします。

```dotenv
BLOB_READ_WRITE_TOKEN=<Blobの読み書きの鍵>
PAGES_SITE_URL=<自分のサイトのURL>
PAGES_SITE_NAME=Surprise Pages
```


| 名前                      | 右側に入れる内容                          |
| ----------------------- | --------------------------------- |
| `BLOB_READ_WRITE_TOKEN` | 手順 2 でコピーした Blob の読み書きの鍵          |
| `PAGES_SITE_URL`        | 3-4 で控えた `https://○○.vercel.app`  |
| `PAGES_SITE_NAME`       | 画面に表示するツールの名前。例は `Surprise Pages` |


1. 見本の `< >` が残っていないことを確認し、保存します。`.env.setup` は次の形になっています。`# ---- ここから下` の注意書きより下の 9 行が Vercel へ入れる項目で、上の `DATABASE_ADMIN_URL` は入れません。

```dotenv
# この 1 行だけは Vercel に入れない（初期化・復旧用）
DATABASE_ADMIN_URL=…
# ---- ここから下の行を Vercel へ入れる ----
PAGES_OWNER_EMAIL=…
DATABASE_URL=…
AUTH_GOOGLE_ID=…
AUTH_GOOGLE_SECRET=…
AUTH_SECRET=…
CRON_SECRET=…
BLOB_READ_WRITE_TOKEN=…
PAGES_SITE_URL=…
PAGES_SITE_NAME=…
```

1. 鍵の控えを、本人だけが開ける場所へ保存します。パスワード管理アプリの自分専用の保管庫に `Surprise Pages の設定と鍵` という記録を作り、`.env.setup` の中身をすべて保存します（`DATABASE_ADMIN_URL` の行に「初期化・復旧用」と明記）。GitHub リポジトリの URL、Vercel・Neon・Blob・Google Cloud の各名前、Google の戻り先 URL も書き添えます。管理アプリを使わない場合の保存の仕方と、記録の形式は [鍵の保管ガイド](docs/guides/secret-storage.md)にあります。1Password などの契約は、この配布物の動作条件ではありません。

Neon が自動で入れた接続情報を控えて外す

Neon を作ったとき、Vercel の環境変数に管理用の接続情報が自動で入っています。通常運転には使わないので、控えを取ってから外し、通常運転用の `DATABASE_URL` に入れ替えます。

1. Vercel の **Storage** で `surprise-pages-db` を開き、**Getting Started** の **.env.local** を選びます。
2. **Show secret** を押し、コード欄の右上の **Copy Snippet** を押します。手順 9 と同じ保管庫に「Neon 初期接続の控え」という記録を作り、コピーした内容をそのまま貼り付けて保存します。ブラウザの **Hide secret** を押します。手元のファイルには書きません（`DATABASE_URL` という同じ名前が `.env.setup` の通常運転用の行と混ざるため）。
3. **Settings → Environment Variables** の一覧に **NEON_PROJECT_ID** がある場合は、その行の **Reveal Value** で値を表示し、`NEON_PROJECT_ID=値` の形で同じ記録へ書き添えます。
4. 記録の各行が元の画面と一致することを確認します。
5. **Settings → Environment Variables** の一覧で、次の名前のうち自動追加されているものを探します。この手順で新しく作った `surprise-pages` の環境変数だけを操作します。

```text
DATABASE_URL
DATABASE_URL_UNPOOLED
NEON_PROJECT_ID
PGHOST
PGHOST_UNPOOLED
PGUSER
PGDATABASE
PGPASSWORD
POSTGRES_URL
POSTGRES_URL_NON_POOLING
POSTGRES_USER
POSTGRES_HOST
POSTGRES_PASSWORD
POSTGRES_DATABASE
POSTGRES_URL_NO_SSL
POSTGRES_PRISMA_URL
```

1. 対象の行の右端の **…**（Menu）を押し、**Delete** を選びます。確認画面に表示された変数名が今選んだ名前であることを確認し、確認欄がある場合は変数名を入力して **Delete** を押します。
2. 一覧にある同じ名前の項目すべてに同じ操作をします。自動追加されていない名前は操作不要です。Blob の **BLOB_READ_WRITE_TOKEN**、**BLOB_STORE_ID**、**BLOB_WEBHOOK_PUBLIC_KEY** は残します。

通常運転の設定を 1 項目ずつ入れる

1. 一覧の右上の **Add Environment Variable** を押します。
2. **Type** の上側の **Secret** を選びます。
3. **Key** に設定名を入れます。最初は `DATABASE_URL` です。
4. **Value** に、`.env.setup` の同じ名前の行の右側の値だけを貼り付けます。`DATABASE_ADMIN_URL` の行と取り違えないように、名前を見てから貼ります。
5. **Environments** で **Production** だけを選びます。**Preview** と **Development** は外します。
6. **Save** を押し、一覧に追加した名前と **Production** が出ていることを確認します。
7. 手順 18〜23 を、次の 7 項目にも繰り返します。

```text
PAGES_SITE_NAME
PAGES_OWNER_EMAIL
PAGES_SITE_URL
AUTH_SECRET
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
CRON_SECRET
```

1. 自動追加済みの **BLOB_READ_WRITE_TOKEN** が一覧にあり、**Production** を含んでいることを確認します。追加し直す必要はありません。
2. 下の 9 項目がすべてそろっていることを確認します。値を表示する必要はありません。

```text
PAGES_SITE_NAME
PAGES_OWNER_EMAIL
PAGES_SITE_URL
DATABASE_URL
AUTH_SECRET
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
BLOB_READ_WRITE_TOKEN
CRON_SECRET
```

本番を再ビルドする

1. `surprise-pages` の **Deployments** を押し、**Production** のデプロイの行を開きます。
2. 右上の **…** を押し、**Redeploy** を選びます。確認画面で対象が **Production** であることを確認し、**Redeploy** を押します。
3. 新しいデプロイが **Building** から **Ready** になるまで待ちます。

サイトに入る

1. 自分のサイトの URL をブラウザで開きます。ログイン画面に、`PAGES_SITE_NAME` に入れた名前が表示されます。
2. **Google でログイン** を押し、`PAGES_OWNER_EMAIL` に設定したアドレスを選びます。Google の確認画面が出たら、アプリ名と共有される内容を確認して進めます。

**済んだ目印** **Deployments** の新しい行に **Ready** と **Production** が出ています。自分のサイトの **ホーム** が開き、左側に **自分の資料**、**個人設定**、**管理** が表示されています。

**止まったら**

- 「設置がまだ終わっていません」と出る。画面が示す章を開きます。足りない項目か、値の貼り間違いです。
- 設定を変えたのに直らない。対象が **Production** か、設定後に **Redeploy** したかを確認します。
- ログイン後の戻り先が違うと出る。3-8 手順 15 の URL と、実際のサイト URL を文字単位で照合します。
- 任意の設定。サイトへの要求の回数を制限する場合は、プロジェクトの **Firewall** で `/` から始まる Request Path に **Rate Limit**（送信元 IP ごとに 60 秒で 1000 回、超過時は 429）を設定します。件数や料金は [Vercel の公式案内](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)で確認します。



### 3-10. 投稿先を設定する

**目的** このパソコンの投稿コマンドに自分のサイトを教え、投稿の許可を受け取ります。同時に、配布物のスキルを Claude Code・Cursor・Codex から使えるようにします。

**画面** Cursor のターミナルと、ブラウザ。

**操作**

1. 次を実行します。

```bash
node scripts/setup/personal.mjs configure
```

1. サイトの URL を求める案内が出たら、3-4 で控えた `https://○○.vercel.app` を入力し、Enter を押します。続けて「スキルを Claude Code・Cursor・Codex につなぎます。」と出ます。
2. 次を実行し、表示された `origin` が自分のサイトの URL と一致することを確認します。

```bash
node bin/pages-publish.mjs config --json
```

1. 次を実行します。ブラウザに **ログインの許可** の画面が開きます。

```bash
node bin/pages-publish.mjs login
```

1. Google ログインを求められた場合は、サイトの持ち主のアドレスでログインします。このパソコンから資料を投稿する許可であることを確認し、**許可する** を押します。
2. ターミナルへ戻り、**ログインしました** と表示されるのを待ちます。
3. 開いている Claude Code・Cursor・Codex を一度閉じて開き直します。スキルは次に開いたときから使えます。

投稿用の鍵の控えは、コマンドが本人の設定フォルダへ保存します。サイトの 9 項目の設定とは別に管理されます。

**済んだ目印** ターミナルに **ログインしました** と出て、次の入力ができます。

**止まったら**

- 許可の画面を複数開いてしまい、ログインしたのに投稿できない。後から開いた許可で先の鍵が失効しています。次を実行し、表示された URL を 1 つだけブラウザで開いて許可します。

```bash
node bin/pages-publish.mjs login --remote
```

- WSL でブラウザが開かない。画面に出た URL を Windows 側のブラウザに貼ります。`sudo apt install wslu` で `wslview` を入れると自動で開くようになります。



### 3-11. 見本を投稿して診断する

**目的** 実際に資料を 1 つ投稿して開き、設置の全項目を診断で確かめます。

**画面** Cursor のターミナルと、Google ログイン済みのブラウザ。

**操作**

1. 次を実行します。

```bash
node bin/pages-publish.mjs --file src/templates/page.html --slug practice/first
```

1. **投稿しました（第 1 版）** と **URL:** が表示されます。
2. 表示された URL を、Google ログイン済みのブラウザで開き、見本のページが表示されることを確認します。この段階の資料は自分だけが開けます。
3. 次を実行し、設置全体を診断します。3-7 から足してきた `.env.setup` を使います。

```bash
node --env-file=.env.setup scripts/setup/personal.mjs doctor
```

1. 設定、データベース、持ち主、画像の保管先、サイト、Google の戻り先、投稿先、パソコンのログインの結果が順に出ます。

**済んだ目印** 最後に「設置はそろっています。」と表示され、投稿した見本がブラウザで開けています。

**止まったら**

- 診断が途中で止まる。止まった項目と、戻る章が表示されます。その章の「済んだ目印」から確認し直します。
- 設置はここで終わりです。画像付きの資料と、相手の招待は第 4 章で行います。



## 4. 普段の使い方

```text
 原本を開く ─▶ AI に頼む ─▶ 自分のサイトに投稿 ─▶ 相手を招待 ─▶ コメントが付く
                  ▲                                                   │
                  └──── AI に本文とコメントを取り寄せさせ、原本を直す ◀┘
```



### 4-1. 資料を作って投稿する

スキルは AI に仕事の進め方を教える手順書で、配布物の `.claude/skills/` に 4 つ入っています。3-10 の `configure` がこのパソコンの Claude Code・Cursor・Codex へつないでいるので、**どのフォルダを開いていても使えます**。


| スキル            | 頼み方                  | すること                       |
| -------------- | -------------------- | -------------------------- |
| `clean-copy`   | 「清書して」               | 原本の文章・数字・順序を変えずに体裁を整えて投稿する |
| `explain-page` | 「図解して」「レポートにして」      | 内容を整理して 1 枚の図解ページにして投稿する   |
| `explain-deck` | 「スライドにして」            | 発表用のスライドにして投稿する            |
| `read-page`    | 「このページを読んで」「コメントを見て」 | 自分のサイトの本文・コメントを取り寄せる       |


Claude Code では `/clean-copy` のように名前で呼べます（正式な呼び名は `/pages:clean-copy`）。Cursor と Codex では、頼み方の言葉かスキルの名前を書いて頼みます。

```text
Claude Code … 本人の設定（~/.claude/settings.json）に「置き場はこの配布物」と書き足す
              → 次に起動したとき、プラグイン pages として読み込まれる
Cursor      … ~/.cursor/skills/<スキル名>  → 配布物の .claude/skills/<スキル名> への近道
Codex       … ~/.agents/skills/<スキル名>  → 配布物の .claude/skills/<スキル名> への近道
```

配布物のフォルダを動かしたり名前を変えたりしたら、新しい場所で次を打ってつなぎ直します。本人の設定のほかの項目と、同じ名前の本人のスキルには触りません。

```bash
node scripts/setup/skills.mjs
```

画像付きの図解を AI に作らせる

1. Cursor の AI チャットを開き、次の依頼文を貼り付けます。

```text
この配布物の .claude/skills/explain-page/SKILL.md を読んで、
「自分の資料置き場の仕組み」を図解してください。
Vercel は画面、Neon は本文、Private Blob は画像を保存することを説明してください。
画像ファイルを1つ用意し、本文から相対パスで参照してください。
自分のサイトへ practice/stack の名前で投稿してください。
招待した人だけが見られる資料にしてください。
鍵の値を応答やログへ出さないでください。
```

1. AI が作った内容を確認し、投稿後に示された URL を開きます。
2. 図解の本文と画像が表示され、アドレスの末尾が `/internal/practice/stack` になっていることを確認します。

自分で用意した HTML と画像を投稿する

1. Cursor の左側で `docs/evidence` を右クリックし、**New Folder**（新しいフォルダー）で `page-out` を作ります。
2. 投稿する HTML を `page-out/index.html` として保存します。配布物の `src/templates/page.html` を元にし、本文を編集します。
3. 使う画像を同じ `page-out` へ置きます。各ファイルは 4MB 以内にします。本文の表示したい場所に次を入れます。

```html
<img src="sample.png" alt="図解の見本画像">
```

1. 次を実行し、表示された URL を開いて本文と画像を確認します。

```bash
node bin/pages-publish.mjs --dir docs/evidence/page-out --slug practice/image
```

スライドの配色とロゴは、スライドの編集画面の「デザイン」で全体と 1 枚ごとに変えられます。ロゴは同じ画面の「ロゴ」から画像（1 資料に 1 つ・非公開の素材として保存）を置きます。手引きは [docs/guides/deck-design.md](docs/guides/deck-design.md)。

### 4-2. 相手に読んでもらう

共有には 2 つの登録が必要です。Google のテストユーザーに相手を登録し、そのうえで、資料の共有範囲にも同じアドレスを登録します。

**画面** Google Cloud Console の **Google Auth Platform → 対象** と、自分のサイトの資料の画面。

**操作**

1. 招待する相手から、ログインに使う Google アカウントのメールアドレスを教えてもらいます。
2. Google Cloud Console でこのサイト用のプロジェクト `Surprise Pages` を選び、**Google Auth Platform → 対象** を開きます。
3. **テストユーザー → ユーザーを追加** を押し、相手のアドレスを入れて Enter で確定し、**保存** を押します。一覧に相手が出たことを確認します。
4. 自分のサイトで、共有したい資料を開きます。例は `/internal/practice/stack` です。
5. 画面右下の小さな操作バーの、一番右の **…**（その他）を押し、**共有範囲** を押します。右側に **共有範囲** のパネルが開きます。
6. 上部の **選んだ人だけ** が選ばれていることを確認します。
7. **見せる人** の下の入力欄へ相手の Google アドレスを入れ、右の **追加** を押します。一覧に相手のアドレスが出たことを確認します。
8. パネルの **リンクをコピー** を押し、コピーした URL を相手へ渡します。パネル右上の **閉じる**（×）を押します。
9. 相手は、受け取った URL をブラウザで開き、**Google でログイン** を押して、登録したアドレスの Google アカウントを選びます。本文と画像が表示されます。

**済んだ目印** 相手が自分の Google アカウントで本文と画像を開けています。

### 4-3. コメントを受けて直す

**操作**

相手がコメントを書く

1. 相手は、資料の中のコメントしたい文章をマウスでドラッグして選びます。選んだ文章の近くに入力欄が開き、選んだ文が上部に引用されます。
2. 入力欄へ、例えば `この部分に具体例を1つ追加してください。` と入力します。
3. 入力欄の下の 3 つのボタンから要望の強さを選んで押します。**must** は「必ず直す」、**better** は「直したほうがよい」、**want** は「できれば」です。**このボタンを押すとコメントが送信されます。**
4. 本文の選んだ箇所にコメントの印が付きます。画面右下の **コメント** を押すと、右側の一覧に名前とコメントが出ます。

持ち主が AI に取り寄せさせて直す

1. Cursor の AI チャットで、次の `資料のURL` を直したいページの URL に置き換えて送ります。

```text
この配布物の .claude/skills/read-page/SKILL.md を読んで、
資料のURL の現在の本文とコメントを取得してください。
まず、コメントを受けてどの箇所を直すか提案してください。
元の説明や数字を勝手に変えないでください。
```

1. AI の提案を読み、採用する内容を決めて指示します。

```text
この提案のうち、具体例を1つ追加する修正を採用します。
取得した現在の本文の必要な箇所だけを修正し、
同じ資料へ新しい版として投稿してください。
コメントを解決済みにする操作は、まだしないでください。
```

1. 投稿後に示された URL を開きます。以前と同じ URL で、本文に修正が反映され、上部の版の表示が進み、画像も引き続き表示されていることを確認します。

コマンドで取得して直す場合

1. 現在の本文を新しい作業用フォルダへ取得し、コメントを一覧します。

```bash
node bin/pages-publish.mjs get --slug practice/stack --out docs/evidence/revise-stack
node bin/pages-publish.mjs comments list --slug practice/stack
```

1. 出力に表示される、再投稿用のコマンドと完全な 40 桁の版の目印を控えます。
2. `docs/evidence/revise-stack/index.html` を開き、コメントに対応する箇所だけを編集して保存します。
3. 次の `取得した40桁の版の目印` を手順 2 の値に置き換えて実行します。

```bash
node bin/pages-publish.mjs \
  --file docs/evidence/revise-stack/index.html \
  --slug practice/stack \
  --base-version 取得した40桁の版の目印 \
  --message 'コメントを受けて具体例を追加'
```

1. **投稿しました（第 2 版…）** と出ます。以前の URL を開き直し、修正と新しい版の表示を確認します。

**済んだ目印** コメントを受けた修正が、同じ URL の新しい版として開けています。

### 4-4. クラウドの AI から同じサイトを使う

AI が別の作業用パソコン（Cursor の Cloud Agents など）で動いていても、同じ投稿先を使えます。クラウドの作業場には手元のログインの控えが渡らないので、配布物のフォルダで次を実行し、表示された URL を本人のブラウザで開いて許可します。

```bash
node bin/pages-publish.mjs login --remote
```

次からも聞かれないようにするには、許可の画面の「コピー」で次の 3 つを本人専用の Secrets に保存します。チャットには貼らず、チーム共有の Secrets には入れません。投稿先と `PAGES_TOKEN_ORIGIN` が一致しないとき鍵を送らない制限は、外さないでください。

```dotenv
PAGES_HOST=https://自分のサイト
PAGES_TOKEN=本人が発行した投稿用の鍵
PAGES_TOKEN_ORIGIN=https://自分のサイト
```

配布物には Cursor の Cloud Agents 用の設定（`.cursor/environment.json` と `scripts/dev/cloud/`）を同梱しています。作業場を作るときに Node.js と部品をそろえ、起動のたびに「ここはクラウド」の印を置くので、投稿コマンドは自動で `login --remote` の案内に切り替わります。鍵は置きません。これは雛形で、**Cursor のクラウドでの動作確認はまだしていません。** 使えなかったときは、上の `login --remote` と Secrets の手順だけで同じことができます。

AI に Vercel や Neon の状態を確認させたいときは、[Vercel 公式の MCP](https://vercel.com/docs/agent-resources/vercel-mcp)（`https://mcp.vercel.com`）や [Neon 公式の MCP](https://neon.com/docs/ai/connect-mcp-clients-to-neon) を Claude Code / Cursor に追加し、本人がログイン・許可します。設置には不要です。保存先の初期化は 3-7 の専用手順で行い、AI に似た表を自由に作らせません。

### 4-5. 更新を受け取る

配布元に直しが入ったら、自分の複製へ取り込みます。自分で改造した箇所は上書きされません（ぶつかれば止まるので、その行だけ選びます）。

```bash
git fetch upstream
git merge upstream/main
git push origin main
```

取り込むと Vercel が自動で組み立て直します。スキルの直しは、Claude Code・Cursor・Codex を次に開いたときから効きます。この版より前に設置していて、スキルを別のフォルダから使えるようにしていない場合は、取り込んだあとに 1 回だけ `node scripts/setup/skills.mjs` を打ちます。

重要な告知（脆弱性・停止の手順）は、講座のコミュニティのチャンネルで知らせます。

### 4-6. 費用・バックアップ・利用終了

費用の目安


| 確認先                      | 見るもの                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------- |
| Vercel                   | サイトを動かす処理量と通信量（Hobby は個人の非商用）                                                      |
| Neon                     | 本文・コメント・過去版の保存量と処理量（Free: 保存 0.5GB・月 100 CU 時間・通信 5GB）。サイトの「個人設定」→「保存の使用量」でも確かめられる |
| Blob                     | 画像の保存量・操作回数・通信量                                                                    |
| AI（Claude Code / Cursor） | 資料生成・画面操作・クラウド作業の利用量と請求                                                            |
| GitHub Actions           | push のたびに走る検査の分数（無料枠は月 2,000 分）                                                    |


無料枠は無制限ではなく、条件も変わります。月に 1 回、上の表の確認先で使用量を見てください。[Neon の料金](https://neon.com/pricing)、[Blob の料金](https://vercel.com/docs/vercel-blob/usage-and-pricing)、[Vercel の支出管理](https://vercel.com/docs/spend-management)。

ページを開いている間は、コメントの一覧を数秒ごとに読み直すので、Neon の保存先は眠らずに計算時間を使います（タブを隠す・10 分操作しないと止まり、5 分後に眠ります）。Vercel の関数の呼び出し回数も使うので、プロジェクトの設定で Fluid compute が有効か（無効だと無料枠が 10 万回に減ります）を確認してください。

無料枠を超えると、Neon は保存先が止まり、サイトは「保存先に繋がりません」の案内を出します。資料は消えません。有料へは本人が選んで切り替え、自動では切り替わりません。

大切な資料を入れる前に、戻せるか試す

本文と画像は別の保管庫なので、両方を対象にした暗号化した控えを作ります。PostgreSQL 18 以降のバックアップ用の道具（Mac は Homebrew の libpq、WSL は PostgreSQL クライアント）が要ります。`.env.setup` の末尾に次の 1 行を足して実行します（`DATABASE_ADMIN_URL` と `BLOB_READ_WRITE_TOKEN` は設置のときから入っています）。

```dotenv
PAGES_BACKUP_PASSWORD=16文字以上の控え専用パスワード
```

```bash
node --env-file=.env.setup scripts/setup/backup.mjs backup surprise-pages.backup
node --env-file=.env.setup scripts/setup/backup.mjs restore surprise-pages.backup --confirm-empty
```

復元は、同じ版の配布物と、新しく初期化した空の Neon・空の非公開 Blob に対して行います。

利用を終える

Vercel のプロジェクト、Neon の保存先、Blob、Google Cloud のプロジェクトを本人が削除します。削除の前に、残したい資料の控え（上の backup）を取ります。

## 5. 困ったとき

エラー全文や画面には秘密が含まれることがあります。共有する前に、メールアドレス、接続情報、鍵を隠してください。


| 症状                           | 戻る手順     | 次にすること                                                               |
| ---------------------------- | -------- | -------------------------------------------------------------------- |
| 必要な道具が見つからない                 | 3-2      | Mac・Windows・WSL のどこで動かしているか確認する。`corepack` が無いときは Node.js 24 系を入れ直す（25 以降には付いていない） |
| Vercel にリポジトリが出ない、Pro が必要と出る | 3-3・3-4  | 自分の個人用 `surprise-pages` を選んでいるか、GitHub の連携許可に入っているか確認する              |
| 保存先の初期化を断られた                 | 3-7      | 今回専用の空の保存先か、既に初期化済みではないか確認する。削除して通さない                                |
| ログイン後の戻り先が違う                 | 3-8      | Google の戻り先と、実際のサイト URL を文字単位で照合する                                   |
| 自分だけログインでき、相手はできない           | 3-8・4-2  | Google 側のテストユーザーと、資料側の共有範囲の両方を確認する                                   |
| 「設置がまだ終わっていません」と出る           | 3-9      | 画面が示す章を開く。3-11 の診断で止まった所を確かめる                                        |
| 設定を変えたのに直らない                 | 3-9      | 対象が Production か、設定後に Redeploy したか確認する                               |
| 「アクセスが集中しています」と出る            | 3-9      | 少し待って開き直す。続くときは Vercel の Firewall で断っている相手を確かめる                      |
| 投稿先が分からない                    | 3-10     | `node scripts/setup/personal.mjs configure` でサイトの URL を設定する          |
| スキルは見えるが投稿できない               | 3-10・4-4 | 投稿先の設定とログイン（鍵）があるか確認する。許可を複数回出した場合は `login --remote`                 |
| 認証用 URL が時間切れになった            | 4-4      | `login --remote` をやり直し、新しい URL を本人が開く                                |
| WSL でログインのブラウザが開かない          | 3-10     | 画面に出た URL を Windows 側のブラウザに貼る。`sudo apt install wslu` で自動で開く         |
| 画像だけ表示されない                   | 3-6・4-1  | 非公開 Blob への接続、ファイルの容量（4MB）、本文からの参照を確認する                              |
| 未確認の仕掛けとして投稿を止められた           | 4-1      | 配布版の雛形（`src/templates/`）を使っているか確認する。実行制限を外さない                        |
| 利用制限や支払いの案内が出た               | 4-6      | どのサービスの使用量か確認する。自動で有料へ切り替えない                                         |


AI には次の形で相談できます。

```text
README の第 3-○ 章で止まりました。
ローカル／クラウドのどちらか：
使っている OS または作業環境：
最後に成功した操作：
秘密を除いたエラーメッセージ：

最初から作り直さず、原因と、次に確認する 1 つの操作を教えてください。
```

問い合わせ先とサポートの範囲

- 問い合わせ先は、講座のコミュニティの指定のチャンネルです。
- 対象は、この README の手順どおりに進めて止まった場合だけです。改造・独自の使い方・他のサービスの契約や支払いは対象外です。
- 導入代行、稼働保証、データ保存保証は提供しません。

配布物に手を入れる人（手元で動かす・確かめる・仕組みを知る）は、[docs/guides/development.md](docs/guides/development.md) と [AGENTS.md](AGENTS.md) を読みます。
