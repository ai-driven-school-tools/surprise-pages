-- 控えの無い文書を、裏で先に変換しておく（の決定 4）。足すだけ（表 1 つ・関数 2 つ）。
--
-- 変換の控え（repository_renders）が無い文書を、応答のあとで少しずつ変換する。そのための印をここに置く:
--   working … いま誰か（どこかの関数）が変換している。期限（lease_until）を過ぎたら、止まったと見て次の人が引き取る
--   skipped … この変換器の版では変換できない（大きすぎる・中身が壊れている）。同じ指紋を何度も取りに行かない
-- 変換が終わったら行を消す（控えが答えになる）。GitHub が答えなかっただけのときも行を消し、次の機会にやり直す。

create table public.repository_render_work (
  repository_id bigint not null,
  blob_sha text not null check (blob_sha ~ '^[0-9a-f]{40}$'),
  renderer text not null,
  state text not null check (state in ('working', 'skipped')),
  reason text check (reason in ('too-large', 'unreadable')),
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  primary key (repository_id, blob_sha, renderer),
  check ((state = 'working') = (lease_until is not null)),
  check ((state = 'skipped') = (reason is not null))
);
alter table public.repository_render_work enable row level security;
revoke all on public.repository_render_work from public, anon, authenticated;
grant select, insert, update, delete on public.repository_render_work to service_role;

-- db-contract: reviewed 新しい表と既存の目次・控えを読み、新しい表にだけ書く関数。控えの無い文書を数件まとめて「変換中」として引き取る。
create function public.claim_repository_renders(
  p_repository_id bigint,
  p_renderer text,
  p_limit integer,
  p_lease_seconds integer
) returns table (document_id uuid, path text, blob_sha text)
language plpgsql security invoker set search_path = public as $$
begin
  return query
  with wanted as (
    -- 同じ中身の文書が 2 つあっても、変換は指紋ごとに 1 度
    select distinct on (d.blob_sha) d.id, d.path, d.blob_sha
    from repository_documents d
    where d.repository_id = p_repository_id and d.deleted_at is null
      and not exists (select 1 from repository_renders r
        where r.repository_id = d.repository_id and r.blob_sha = d.blob_sha and r.renderer = p_renderer)
      and not exists (select 1 from repository_render_work w
        where w.repository_id = d.repository_id and w.blob_sha = d.blob_sha and w.renderer = p_renderer
          and (w.state = 'skipped' or w.lease_until > now()))
    order by d.blob_sha, d.path
  ), picked as (
    select wanted.id, wanted.path, wanted.blob_sha from wanted order by wanted.path limit greatest(p_limit, 0)
  ), claimed as (
    -- 同時に 2 か所が同じ指紋を選んでも、行を書けるのは片方だけ（もう片方は期限の切れた印しか引き取れない）
    insert into repository_render_work as w (repository_id, blob_sha, renderer, state, lease_until)
    select p_repository_id, picked.blob_sha, p_renderer, 'working', now() + make_interval(secs => p_lease_seconds) from picked
    on conflict on constraint repository_render_work_pkey do update
      set state = 'working', reason = null, lease_until = excluded.lease_until
      where w.state = 'working' and w.lease_until <= now()
    returning w.blob_sha
  )
  select picked.id, picked.path, picked.blob_sha from picked join claimed on claimed.blob_sha = picked.blob_sha order by picked.path;
end;
$$;
revoke all on function public.claim_repository_renders(bigint, text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_repository_renders(bigint, text, integer, integer) to service_role;

-- db-contract: reviewed 新しい表にだけ書く関数。開いた文書 1 つを「変換中」として引き取る。答えは claimed（引き取った）・busy（ほかで変換中）・skipped:<理由>（変換できない）の 3 つ。
create function public.claim_repository_render(
  p_repository_id bigint,
  p_blob_sha text,
  p_renderer text,
  p_lease_seconds integer
) returns text
language plpgsql security invoker set search_path = public as $$
declare
  taken text;
  current_reason text;
begin
  insert into repository_render_work as w (repository_id, blob_sha, renderer, state, lease_until)
  values (p_repository_id, p_blob_sha, p_renderer, 'working', now() + make_interval(secs => p_lease_seconds))
  on conflict on constraint repository_render_work_pkey do update
    set lease_until = excluded.lease_until
    where w.state = 'working' and w.lease_until <= now()
  returning w.blob_sha into taken;
  if taken is not null then return 'claimed'; end if;
  select w.reason into current_reason from repository_render_work w
    where w.repository_id = p_repository_id and w.blob_sha = p_blob_sha and w.renderer = p_renderer and w.state = 'skipped';
  return case when current_reason is null then 'busy' else 'skipped:' || current_reason end;
end;
$$;
revoke all on function public.claim_repository_render(bigint, text, text, integer) from public, anon, authenticated;
grant execute on function public.claim_repository_render(bigint, text, text, integer) to service_role;
