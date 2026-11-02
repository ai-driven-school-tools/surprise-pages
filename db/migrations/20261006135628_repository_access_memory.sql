-- リポジトリの文書の「見てよいか」の答えを、リポジトリごと・人ごとに覚え、GitHub からの知らせ（Webhook）で捨てる。
-- 足すだけの変更（表 3 つ・関数 2 つ）。判定は今までどおり lib/repository-access.ts ただ 1 つで、ここは答えの置き場所だけ。
--
-- 決まり（docs/repository-reading.md の「見てよいか」）:
--   ・覚えるのは「読める」だけ。「読めない」は覚えない（断られた人が付け直された直後に読めるように）
--   ・知らせが来たら、そのリポジトリの覚えを全員分捨てる（リポジトリが分からない知らせなら全部）
--   ・知らせが落ちたときの保険に、覚えは最長 5 分。知らせが 24 時間届いていないときは最長 60 秒
--     （何分まで使うかは読む側が決める。ここには「いつ GitHub に聞いたか」だけを置く）

-- この人はこのリポジトリを読める、と GitHub が答えた記録。1 人 1 リポジトリ 1 行。
-- github_user_id … 聞いたときの本人の GitHub の番号。つなぎ直して別の GitHub の人になったら、この行は使わない
-- full_name / branch … そのとき GitHub が答えた名前と既定の枝（覚えで答えるときに、同じ形の答えを返すため）
-- asked_at … GitHub に聞き始めた時刻（答えが届いた時刻ではない。古いほうに数えて、覚えを長く使いすぎない）
create table public.repository_access_memory (
  viewer_email text not null check (viewer_email = lower(viewer_email)),
  repository_id bigint not null check (repository_id > 0),
  github_user_id bigint not null check (github_user_id > 0),
  full_name text not null check (full_name ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  branch text not null check (length(branch) between 1 and 255),
  asked_at timestamptz not null,
  primary key (viewer_email, repository_id)
);
create index repository_access_memory_by_repository on public.repository_access_memory (repository_id);
alter table public.repository_access_memory enable row level security;
revoke all on public.repository_access_memory from public, anon, authenticated;
grant select, insert, update, delete on public.repository_access_memory to service_role;

-- 捨てた回数（多くて 1 行。行が無ければ 0 回）。GitHub に聞いている間に知らせが来て覚えを捨てたら、聞き終えた答えを書かせないための番号。
-- 読む側は聞く前にこの番号を読み、書くときに同じ番号のままであることを条件にする（remember_repository_access）。
-- 最初の行をここで入れない（データだけの控えを戻すとき、移行が入れた行とぶつかる）。行は最初の知らせが作る。
create table public.repository_access_generation (
  only_row boolean primary key default true check (only_row),
  generation bigint not null default 0 check (generation >= 0)
);
alter table public.repository_access_generation enable row level security;
revoke all on public.repository_access_generation from public, anon, authenticated;
grant select, insert, update, delete on public.repository_access_generation to service_role;

-- 受け取った知らせ。配信の目印（X-GitHub-Delivery）で 1 度だけ扱うためと、「知らせが届いているか」を見るため。
-- 中身（本文）は置かない。7 日より古い行は、知らせを受けるたびに消す。
create table public.repository_webhook_deliveries (
  delivery_id text primary key check (delivery_id ~ '^[A-Za-z0-9-]{1,64}$'),
  event text not null check (event ~ '^[a-z_]{1,64}$'),
  received_at timestamptz not null default now()
);
create index repository_webhook_deliveries_by_time on public.repository_webhook_deliveries (received_at desc);
alter table public.repository_webhook_deliveries enable row level security;
revoke all on public.repository_webhook_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.repository_webhook_deliveries to service_role;

-- db-contract: reviewed 新しい表にだけ書く関数。聞き始める前に読んだ番号のままのときだけ「読める」を覚える（聞いている間に捨てられた答えを書き戻さない）。
create function public.remember_repository_access(
  p_viewer text,
  p_repository_id bigint,
  p_github_user_id bigint,
  p_full_name text,
  p_branch text,
  p_asked_at timestamptz,
  p_generation bigint
) returns boolean
language plpgsql security invoker set search_path = public as $$
declare
  kept bigint;
begin
  insert into repository_access_memory as m (viewer_email, repository_id, github_user_id, full_name, branch, asked_at)
  select lower(p_viewer), p_repository_id, p_github_user_id, p_full_name, p_branch, p_asked_at
  where coalesce((select g.generation from repository_access_generation g where g.only_row), 0) = p_generation
  on conflict (viewer_email, repository_id) do update
    set github_user_id = excluded.github_user_id, full_name = excluded.full_name, branch = excluded.branch, asked_at = excluded.asked_at
  returning m.repository_id into kept;
  return kept is not null;
end;
$$;
revoke all on function public.remember_repository_access(text, bigint, bigint, text, text, timestamptz, bigint) from public, anon, authenticated;
grant execute on function public.remember_repository_access(text, bigint, bigint, text, text, timestamptz, bigint) to service_role;

-- db-contract: reviewed 新しい表にだけ書く関数。知らせを 1 度だけ記録し、言われたリポジトリ（p_reset_all なら全部）の覚えを捨てて番号を進める。答えは recorded / duplicate。
create function public.receive_repository_webhook(
  p_delivery text,
  p_event text,
  p_reset_all boolean,
  p_repository_ids jsonb
) returns text
language plpgsql security invoker set search_path = public as $$
declare
  fresh text;
  targets bigint[];
begin
  insert into repository_webhook_deliveries (delivery_id, event) values (p_delivery, p_event)
  on conflict (delivery_id) do nothing
  returning delivery_id into fresh;
  if fresh is null then return 'duplicate'; end if;

  select coalesce(array_agg(distinct (value)::bigint), '{}') into targets
  from jsonb_array_elements_text(coalesce(p_repository_ids, '[]'::jsonb));
  if p_reset_all or cardinality(targets) > 0 then
    insert into repository_access_generation as g (only_row, generation) values (true, 1)
    on conflict (only_row) do update set generation = g.generation + 1;
    delete from repository_access_memory m where p_reset_all or m.repository_id = any(targets);
  end if;

  -- 古い記録の片付け（知らせの記録は 7 日・覚えは 1 日より古ければ、どの上限でも使わない）
  delete from repository_webhook_deliveries d where d.received_at < now() - interval '7 days';
  delete from repository_access_memory m where m.asked_at < now() - interval '1 day';
  return 'recorded';
end;
$$;
revoke all on function public.receive_repository_webhook(text, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.receive_repository_webhook(text, text, boolean, jsonb) to service_role;
