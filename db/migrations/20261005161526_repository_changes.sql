-- リポジトリの文書で「前回見たあとに何が変わったか」に気づく（3 段目「気づく」）。
-- 足すだけの変更。見てよいかは今までどおり GitHub の権限だけで決める（lib/repository-access.ts）。この表に権限の材料は置かない。

-- 中身が変わった（または新しく現れた）のに気づいた時刻。最近の更新の並びの候補に使う。
-- 最初に目次を写したときの文書は空（null）のまま（「更新」ではなく、もともとあった文書なので）。
alter table public.repository_documents add column content_changed_at timestamptz;
create index repository_documents_recent on public.repository_documents (repository_id, content_changed_at desc) where deleted_at is null and content_changed_at is not null;

-- 会社の人が、どの文書のどの版（中身の指紋とコミット）まで見たか。1 人 1 文書 1 行。
-- 「見たページ」（page_views）と同じ決まり: アドレスは小文字・90 日で物理削除（/api/cron/views）・
-- 「記録を残さない」（page_view_optouts）の人には 1 行も積まない・本人が消すときは物理削除。
-- 文書の側から「誰が見たか」を数える口は作らない。
create table public.repository_document_views (
  document_id uuid not null references public.repository_documents(id),
  viewer_email text not null check (viewer_email = lower(viewer_email)),
  repository_id bigint not null,
  seen_blob text not null check (seen_blob ~ '^[0-9a-f]{40}$'),
  seen_commit text not null check (seen_commit ~ '^[0-9a-f]{40}$'),
  -- その前に見ていた版。開いたあと（見た記録が今の版に進んだあと）でも、差分を前回見た版から描けるように 1 つだけ持つ
  previous_blob text check (previous_blob ~ '^[0-9a-f]{40}$'),
  last_viewed_at timestamptz not null default now(),
  primary key (document_id, viewer_email)
);
create index repository_document_views_by_viewer on public.repository_document_views (viewer_email, repository_id);
create index repository_document_views_by_time on public.repository_document_views (last_viewed_at);
alter table public.repository_document_views enable row level security;
revoke all on public.repository_document_views from public, anon, authenticated;
grant select, insert, update, delete on public.repository_document_views to service_role;

-- db-contract: reviewed 新しい表だけに書く関数。文書がそのリポジトリのものであることと「記録を残さない」の印を 1 文で確かめてから積む。
create function public.record_repository_document_view(
  p_document_id uuid,
  p_repository_id bigint,
  p_email text,
  p_blob text,
  p_commit text
) returns void
language sql
volatile
set search_path = ''
as $$
  insert into public.repository_document_views (document_id, viewer_email, repository_id, seen_blob, seen_commit)
  select d.id, lower(p_email), d.repository_id, p_blob, p_commit
  from public.repository_documents d
  where d.id = p_document_id
    and d.repository_id = p_repository_id
    and not exists (select 1 from public.page_view_optouts o where o.viewer_email = lower(p_email))
  on conflict (document_id, viewer_email) do update
    set previous_blob = case
          when excluded.seen_blob <> public.repository_document_views.seen_blob then public.repository_document_views.seen_blob
          else public.repository_document_views.previous_blob
        end,
        seen_blob = excluded.seen_blob,
        seen_commit = excluded.seen_commit,
        last_viewed_at = now();
$$;
revoke all on function public.record_repository_document_view(uuid, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.record_repository_document_view(uuid, bigint, text, text, text) to service_role;
