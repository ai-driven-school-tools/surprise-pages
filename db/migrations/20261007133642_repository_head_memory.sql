-- リポジトリの文書を開くたびに GitHub へ聞いていた「main の先頭」を、GitHub からの知らせ（push）で確かめ済みにする。
-- 足すだけの変更（表 1 つ・関数 3 つ）。先頭そのものは今までどおり repository_heads（写した先頭）にあり、ここは「いつ GitHub で確かめたか」だけ。
--
-- 決まり（docs/repository-reading.md の「速さ」）:
--   ・GitHub で確かめた先頭が写した先頭と同じで、その後 main への push の知らせが無く、5 分以内なら、GitHub に聞かずに写した先頭を使う
--     （何分まで使うか・知らせが届いているかは読む側が決める。ここには番号と時刻だけを置く）
--   ・main への push の知らせが来たら、そのリポジトリの番号を進める（確かめ済みが外れる）。ほかの枝への push では進めない
--   ・GitHub に聞いている間に push が来たら、聞き終えた答えを確かめ済みにしない（聞く前に読んだ番号のままのときだけ書く）

-- リポジトリごとに 1 行。
-- push_generation … main への push の知らせの回数（行が無ければ 0）
-- checked_* … GitHub で確かめた先頭と、そのとき（聞く前）に読んだ番号と、聞き始めた時刻
create table public.repository_head_checks (
  repository_id bigint primary key check (repository_id > 0),
  push_generation bigint not null default 0 check (push_generation >= 0),
  checked_generation bigint check (checked_generation >= 0),
  checked_head text check (checked_head ~ '^[0-9a-f]{40}$'),
  checked_at timestamptz
);
alter table public.repository_head_checks enable row level security;
revoke all on public.repository_head_checks from public, anon, authenticated;
grant select, insert, update, delete on public.repository_head_checks to service_role;

-- db-contract: reviewed 新しい表と既存の 2 表を読むだけの関数。名前（大文字小文字を問わない）で写した先頭・確かめ済みの記録・最後の知らせの時刻を 1 往復で返す。
create function public.repository_head_state(p_full_name text)
returns table (
  repository_id bigint,
  full_name text,
  branch text,
  head_commit text,
  committed_at timestamptz,
  author_name text,
  push_generation bigint,
  checked_generation bigint,
  checked_head text,
  checked_at timestamptz,
  last_delivery_at timestamptz
)
language sql stable security invoker set search_path = public as $$
  select h.repository_id, h.full_name, h.branch, h.head_commit, h.committed_at, h.author_name,
    coalesce(c.push_generation, 0), c.checked_generation, c.checked_head, c.checked_at,
    (select max(d.received_at) from repository_webhook_deliveries d)
  from repository_heads h
  left join repository_head_checks c on c.repository_id = h.repository_id
  where lower(h.full_name) = lower(p_full_name)
  limit 5;
$$;
revoke all on function public.repository_head_state(text) from public, anon, authenticated;
grant execute on function public.repository_head_state(text) to service_role;

-- db-contract: reviewed 新しい表にだけ書く関数。聞く前に読んだ番号のままのときだけ「この先頭を GitHub で確かめた」と書く（古い時刻で新しい記録を上書きしない）。
create function public.confirm_repository_head(
  p_repository_id bigint,
  p_head text,
  p_generation bigint,
  p_checked_at timestamptz
) returns boolean
language plpgsql security invoker set search_path = public as $$
declare
  kept bigint;
begin
  insert into repository_head_checks as c (repository_id, push_generation, checked_generation, checked_head, checked_at)
  values (p_repository_id, p_generation, p_generation, p_head, p_checked_at)
  on conflict (repository_id) do update
    set checked_generation = excluded.checked_generation, checked_head = excluded.checked_head, checked_at = excluded.checked_at
    where c.push_generation = p_generation and (c.checked_at is null or c.checked_at <= excluded.checked_at)
  returning c.repository_id into kept;
  return kept is not null;
end;
$$;
revoke all on function public.confirm_repository_head(bigint, text, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.confirm_repository_head(bigint, text, bigint, timestamptz) to service_role;

-- db-contract: reviewed 新しい表にだけ書く関数。push の知らせで番号を進める。写した枝と違う枝への push は進めない（写していないリポジトリは進める）。p_repository_id が null なら全部。答えは noted / ignored。
create function public.note_repository_push(p_repository_id bigint, p_ref text)
returns text
language plpgsql security invoker set search_path = public as $$
declare
  stored_branch text;
begin
  if p_repository_id is null then
    update repository_head_checks set push_generation = push_generation + 1;
    return 'noted';
  end if;
  select h.branch into stored_branch from repository_heads h where h.repository_id = p_repository_id;
  if stored_branch is not null and p_ref is distinct from 'refs/heads/' || stored_branch then return 'ignored'; end if;
  insert into repository_head_checks as c (repository_id, push_generation) values (p_repository_id, 1)
  on conflict (repository_id) do update set push_generation = c.push_generation + 1;
  return 'noted';
end;
$$;
revoke all on function public.note_repository_push(bigint, text) from public, anon, authenticated;
grant execute on function public.note_repository_push(bigint, text) to service_role;
