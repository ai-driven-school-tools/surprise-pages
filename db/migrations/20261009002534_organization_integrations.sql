-- organization_integrations: Slack と GitHub アプリの連携を組織ごとに結ぶ表を足す（複数組織対応の B3）。
-- 設計の正本は docs/multi-organization.md の「連携を組織ごとに」。足すだけで、既存の表・行・関数は 1 つも書き換えない。
--
-- 1. organization_slack_connections … 組織 × Slack のワークスペース（1 対 1）。「Slack に追加」（OAuth）で受け取った
--    アプリの鍵と人としての鍵を封をして置く（lib/organization-secrets.ts と同じ封・付加データは組織の目印と鍵の名前）。
--    Slack の目印（team_id）は**全体で一意**——1 つの Slack は 1 つの組織にしか結べない（Slack からの知らせの宛先が 1 つに決まる）
-- 2. organization_github_installations … 組織 × GitHub アプリの導入番号。導入番号も全体で一意（1 つの導入は 1 つの組織だけ）
--
-- どちらも、組織の外から届く知らせ（Slack・GitHub）の目印で組織を引く台帳なので、自動参加のドメイン（organization_domains）と
-- 同じく組織に属さない表（lib/tenant-tables.json の global）に置く。組織の中の読み書きは lib の 1 ファイルずつが必ず
-- organization_id で絞る（scripts/checks/check-organization-integrations.mjs が字面で見る）。Slack の鍵は付加データに
-- 組織の目印を混ぜて封をしてあるので、別の組織の行として開こうとしても開かない。
--
-- 決まり（docs/db-migrations.md）
-- - 足す → 移す → 縮める の段を踏む。消す・名前を変える・NOT NULL を付けるは、別の PR に分ける（DB contract の関門が見る）
-- - 当てるのは CI（main に入るとステージングへ、本番は承認つきの実行で）。管理画面から手で当てない
-- - 前の版のアプリはこの表と関数を知らないので、読み書きの形は何も変わらない（最初の組織 は環境変数の落とし先で今までどおり動く）
-- - 列の既定値（DEFAULT）に組織の目印を入れない（A1 の決まり）

-- ---------------------------------------------------------------------------
-- 1. Slack のつながり
-- ---------------------------------------------------------------------------
create table public.organization_slack_connections (
  organization_id uuid not null references public.organizations(id),
  -- Slack のワークスペースの目印（T から始まる英大文字と数字）。全体で一意
  team_id text not null check (team_id ~ '^T[A-Z0-9]{2,30}$'),
  -- 画面に出す名前（Slack の答えのまま・最大 200 文字）
  team_name text not null check (char_length(team_name) between 1 and 200),
  -- 封をしたアプリの鍵（xoxb-…）と人としての鍵（xoxp-…）。生の値は置かない（lib/sealed-value.ts の形）
  bot_ciphertext text not null check (char_length(bot_ciphertext) between 1 and 8192),
  user_ciphertext text not null check (char_length(user_ciphertext) between 1 and 8192),
  -- 封をした鍵の版（PAGES_SECRETS_KEY の v1・v2…）
  key_version text not null check (key_version ~ '^v[0-9]{1,4}$'),
  -- active: 使える / reconnect: Slack が鍵を断った（外された・取り消された）。画面に「要再接続」を出し、機能は閉じる
  status text not null default 'active' check (status in ('active', 'reconnect')),
  -- 「Slack に追加」を押した管理者（人としての鍵はこの人のもの）
  installed_by text not null check (installed_by = lower(btrim(installed_by))),
  installed_at timestamptz not null default now(),
  primary key (organization_id)
);

create unique index organization_slack_connections_team_key on public.organization_slack_connections (team_id);

comment on table public.organization_slack_connections is
  '組織ごとの Slack のつながり（1 組織に 1 つ・1 つの Slack は 1 組織だけ）。鍵は封をした値。読み書きは lib/slack-connections.ts だけ';

-- 外したつながりは行ごと消す（物理削除）。封をした鍵を「消した印」付きで残さない（lib/organization-secrets.ts と同じ理由）

alter table public.organization_slack_connections enable row level security;
revoke all on public.organization_slack_connections from public, anon, authenticated;
grant select, insert, update, delete on public.organization_slack_connections to service_role;

-- ---------------------------------------------------------------------------
-- 2. GitHub アプリの導入
-- ---------------------------------------------------------------------------
create table public.organization_github_installations (
  organization_id uuid not null references public.organizations(id),
  -- GitHub アプリの導入番号。全体で一意
  installation_id bigint not null check (installation_id > 0),
  -- 導入先の GitHub のアカウント（組織か個人）の名前と番号。リポジトリの登録を、この組織の導入先のものだけに絞る
  account_login text not null check (account_login ~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$'),
  account_id bigint not null check (account_id > 0),
  bound_by text not null check (bound_by = lower(btrim(bound_by))),
  bound_at timestamptz not null default now(),
  primary key (organization_id, installation_id)
);

create unique index organization_github_installations_installation_key on public.organization_github_installations (installation_id);

comment on table public.organization_github_installations is
  '組織ごとの GitHub アプリの導入（導入番号 → 組織）。読み書きは lib/github-installations.ts だけ';

alter table public.organization_github_installations enable row level security;
revoke all on public.organization_github_installations from public, anon, authenticated;
grant select, insert, update, delete on public.organization_github_installations to service_role;
