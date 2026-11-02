-- ページに付くコメント。1 ページ = 1 つの page_slug（例: example/hello）。
-- 読み書きはサービスロール（サーバー）経由のみ。ブラウザから直接は触らせない。
create table public.page_comments (
  id uuid primary key default gen_random_uuid(),
  page_slug text not null,
  parent_id uuid references public.page_comments(id),
  quote text,
  quote_context jsonb,
  body text not null default '',
  kind text not null default 'comment' check (kind in ('comment','strikethrough')),
  priority text not null default 'want' check (priority in ('must','better','want')),
  author_email text not null,
  author_name text,
  author_image text,
  resolved_at timestamptz,
  resolved_by text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index page_comments_page_idx on public.page_comments (page_slug, created_at);
alter table public.page_comments enable row level security;
-- ポリシーは意図的に作らない（サービスロール経由のみ。anon は全拒否）
