-- ページ本文の保管庫。ここが本文の正本になる（それまでは git の content/ が正本だった）。
--
-- git が黙って提供していた性質を、ここでは明示的に作り直す:
--   不変な版     … page_revisions は追記だけ。UPDATE / DELETE はトリガで拒否する
--   改ざん検出   … 版の目印を「親の目印 + 中身」から計算する（連鎖するので途中だけ差し替えられない）
--   書いた人     … 投稿トークンからサーバーが決める（ブラウザや CLI の名乗りは信じない）
--
-- 読み書きはサービスロール（サーバー）経由のみ。行を守るのは Route Handler の判定。

-- ページ 1 枚。呼び名は page_comments と同じ `<見せ方>/<場所>` で揃える。
create table public.pages (
  id uuid primary key default gen_random_uuid(),
  page_slug text not null unique,
  visibility text not null check (visibility in ('internal', 'public')),
  title text not null default '',
  -- いま出す版の目印。page_revisions.version_id を指す
  current_version_id text,
  -- 最初の版を書いた人。共有範囲を決められるのはこの人と管理者
  created_by text,
  -- 消しても行は残す。URL を開けなくするだけ
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.pages is 'ページ 1 枚。本文そのものは page_revisions 側にあり、ここは「いまどの版を出すか」を持つ';
comment on column public.pages.page_slug is 'ページの呼び名。`<見せ方>/<場所>`（例 internal/example/hello）。page_comments.page_slug と同じ形';
comment on column public.pages.created_by is '最初の版を書いた人のメールアドレス（所有者）';
comment on column public.pages.deleted_at is '消した印。行は残す（本文と素材も残す）';

-- 一覧は「生きているものを新しい順」で引く
create index pages_visibility_idx on public.pages (visibility, updated_at desc);
create index pages_alive_idx on public.pages (updated_at desc) where deleted_at is null;

-- 版。1 度書いたら変えない・消さない。
create table public.page_revisions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id),
  -- 1 から数える。同じページで重ならない
  version_number integer not null check (version_number >= 1),
  -- 版の目印。40 桁の 16 進（git のコミット sha と同じ形にして、既存の URL をそのまま使う）
  version_id text not null unique check (version_id ~ '^[0-9a-f]{40}$'),
  -- 1 つ前の版の目印。最初の版だけ空
  parent_version_id text check (parent_version_id ~ '^[0-9a-f]{40}$'),
  html text not null check (octet_length(html) <= 5242880),
  author_email text not null,
  author_name text,
  -- 人に読ませる一言（記号や番号は投稿時に落としてある）
  message text not null default '',
  -- 1 つ前の版と比べた赤入れの件数。履歴を開くたびに数え直さないため保存する
  change_count integer,
  created_at timestamptz not null default now(),
  unique (page_id, version_number)
);

comment on table public.page_revisions is '本文の版。追記専用（UPDATE / DELETE はトリガで拒否）';
comment on column public.page_revisions.version_id is
  '版の目印。sha256(親の目印 + 呼び名 + 版番号 + 書いた人 + 時刻 + 本文) の先頭 40 桁。移行した版は当時の git の sha そのもの';
comment on column public.page_revisions.change_count is '1 つ前の版と比べた赤入れの件数。数えられなければ NULL';

-- 履歴は「そのページの新しい順」で引く。本文の列は一覧では読まない
create index page_revisions_page_idx on public.page_revisions (page_id, version_number desc);

-- 追記専用の番人。サービスロールでも通さない。
create function public.forbid_revision_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '版は追記専用です。書き換え・削除はできません（直しは新しい版として積んでください）';
end;
$$;

comment on function public.forbid_revision_mutation() is '版の書き換え・削除を拒否する番人。0004 で導入';

create trigger page_revisions_append_only
  before update or delete on public.page_revisions
  for each row execute function public.forbid_revision_mutation();

-- 投稿の鍵。生の値は保存しない（ハッシュだけ）。
create table public.publish_tokens (
  id uuid primary key default gen_random_uuid(),
  -- sha256 の 16 進 64 桁。生の値はここにも他のどこにも残さない
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  owner_email text not null,
  owner_name text,
  -- 持ち主が自分で分かるようにする覚え書き（例: MacBook）
  label text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

comment on table public.publish_tokens is '投稿の鍵。生の値は発行時に 1 度だけ返し、ここにはハッシュだけ残す';
comment on column public.publish_tokens.revoked_at is '止めた印。行は消さない（いつ止めたかを残すため）';

create index publish_tokens_owner_idx on public.publish_tokens (owner_email, created_at desc);

alter table public.pages enable row level security;
alter table public.page_revisions enable row level security;
alter table public.publish_tokens enable row level security;
-- ポリシーは意図的に作らない（page_comments と同じ流儀。サービスロール経由のみ・anon は全拒否）
