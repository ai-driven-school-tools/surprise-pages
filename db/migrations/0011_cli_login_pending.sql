-- クラウド環境からログインするときの、短い待ち受け。
--
-- 手元のログインは、ブラウザから自分のパソコンへ届ける。クラウドには人のブラウザが
-- 無いので、人が自分のパソコンで許可した名乗りを、クラウド環境が取りに来るまでの間だけ
-- ここに置く。置き場というより郵便受けで、取られたら中身は消える。
--
-- 取りに来る合言葉の生の値は残さない（ハッシュだけ）。名乗りの生の値は、
-- 許可から取得までの最大 3 分・1 回限り。期限が切れた行は中身を空にする。
-- 読み書きはサービスロール（サーバー）経由のみ。

create table public.cli_login_pending (
  id uuid primary key default gen_random_uuid(),
  -- ターミナルが作る、その場かぎりの合図。URL に載るので秘密ではない
  state text not null unique,
  -- 取りに来る合言葉のハッシュ。sha256 の 16 進 64 桁。生の値は残さない
  poll_secret_hash text not null check (poll_secret_hash ~ '^[0-9a-f]{64}$'),
  -- 一覧に並べるデバイス（パソコン・クラウド環境）の名前
  computer_label text not null default '',
  -- 許可されたあとの名乗り。取られたら消す。許可前は空
  handoff text,
  -- 誰として許可したか。取られたあとも残さない（中身と一緒に消す）
  owner_email text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

comment on table public.cli_login_pending is
  'クラウド環境からのログインの郵便受け。許可から取得までの最大 3 分だけ名乗りを置き、取られたら消す';
comment on column public.cli_login_pending.state is
  'ターミナルが作る合図。URL に載る。秘密ではない';
comment on column public.cli_login_pending.poll_secret_hash is
  '取りに来る合言葉のハッシュ。生の値は残さない';
comment on column public.cli_login_pending.handoff is
  '許可された名乗り。取られたら消す。許可前は空';

create index cli_login_pending_expires_idx on public.cli_login_pending (expires_at);

alter table public.cli_login_pending enable row level security;
-- ポリシーは意図的に作らない（サービスロール経由のみ・anon は全拒否）
