-- iOS アプリのログインの引換券。
--
-- 流れは OAuth 2.0 の認可コード＋PKCE と同じ形。人がブラウザで「許可する」を押すと、
-- 一度きり・2 分だけの引換券を作ってアプリへ戻す。アプリはそれを、最初に自分で作った
-- 合言葉（code_verifier）と一緒に /api/v1/auth/token へ持ってきて、アプリ専用の鍵と引き換える。
--
-- 引換券の生の値は残さない（ハッシュだけ）。合言葉も受け取らない——置くのは
-- 合言葉から計算した値（code_challenge。これだけでは合言葉に戻せない）。
-- 使ったら consumed_at を立てて二度と通さない。期限切れは読むときに無効として扱い、
-- 行は日次の片付け（app/api/cron/views）が消す。
-- 読み書きはサーバー経由のみ。

create table public.app_login_codes (
  id uuid primary key default gen_random_uuid(),
  -- 引換券のハッシュ。sha256 の 16 進 64 桁。生の値は残さない
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  -- アプリの合言葉から計算した値（S256・base64url の 43 文字）
  code_challenge text not null check (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  -- 戻し先。許可したときと引き換えるときで同じでなければ断る
  redirect_uri text not null,
  -- 誰として許可したか
  owner_email text not null,
  owner_name text,
  -- 一覧に並べる端末の名前（アプリが送ってきたもの。判断のよりどころにはしない）
  device_label text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

comment on table public.app_login_codes is
  'iOS アプリのログインの引換券。生の値は残さずハッシュだけ。2 分・1 回限り';
comment on column public.app_login_codes.code_hash is
  '引換券のハッシュ。生の値は残さない';
comment on column public.app_login_codes.consumed_at is
  '使った印。立っている行は二度と引き換えない';

create index app_login_codes_expires_idx on public.app_login_codes (expires_at);

alter table public.app_login_codes enable row level security;
-- ポリシーは意図的に作らない（サービスロール経由のみ・anon は全拒否）
grant select, insert, update, delete on public.app_login_codes to service_role;
