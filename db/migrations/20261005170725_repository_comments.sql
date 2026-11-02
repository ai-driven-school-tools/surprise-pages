-- リポジトリの文書にコメントを付ける（2 段目「コメントする」）。足すだけの変更。
-- コメントは Pages にだけ置き、GitHub には書かない。ページのコメント（page_comments）とは表を分ける——
-- page_comments の page_slug は「<見せ方>/<場所>」の決まりで、リポジトリの文書はその呼び名を持たないため。
-- どの文書のコメントかは文書の身元（repository_documents.id。改名・移動しても変わらない）で結ぶ。
-- 見てよいかは GitHub の権限だけで決める（lib/repository-access.ts）。この表に権限の材料は置かない。
create table public.repository_comments (
  id uuid primary key default gen_random_uuid(),
  repository_id bigint not null,
  document_id uuid not null references public.repository_documents(id),
  parent_id uuid references public.repository_comments(id),
  quote text,
  quote_context jsonb,
  body text not null default '',
  priority text not null default 'want' check (priority in ('must', 'better', 'want', 'good')),
  author_email text not null,
  author_name text,
  author_image text,
  -- 書いたときの文書の版。中身の指紋（blob の目印）と、そこに変わったコミット
  blob_sha text check (blob_sha ~ '^[0-9a-f]{40}$'),
  commit_sha text check (commit_sha ~ '^[0-9a-f]{40}$'),
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 消すときは行を残し、消した印を立てる
  deleted_at timestamptz
);
create index repository_comments_by_document on public.repository_comments (document_id, created_at);
create index repository_comments_by_author on public.repository_comments (author_email, created_at desc);
alter table public.repository_comments enable row level security;
revoke all on public.repository_comments from public, anon, authenticated;
grant select, insert, update, delete on public.repository_comments to service_role;

-- 文書を最後に変えた人の GitHub の番号。「あなたの番」で、その人の会社のアカウント（本人の GitHub 接続）へ結ぶ
alter table public.repository_documents add column last_author_github_id bigint;
