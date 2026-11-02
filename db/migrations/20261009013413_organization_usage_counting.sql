-- organization_usage_counting: 組織ごとの使用量（複数組織対応の C2）の数える番人・夜間の数え直し・いまある数の「移す」段。
-- 表と数える口は前の移行（20261009010429_organization_usage.sql）。設計の正本は docs/multi-organization.md の「使用量と上限」。
--
-- 1. 数える番人 … 資料（pages の生き死に）と人（organization_members の有効・外した）が変わった同じ書き込みの中で、organization_usage を足し引きする
--    （決定 1: 投稿のたびに全部数えない）。素材の容量は受け取りの口が org_add_usage で足す
-- 2. 夜間の数え直し … org_recount_usage が実際の行と、呼ぶ側が数えた素材の容量で置き直す（ずれを直す）
-- 3. 移す … いまある組織の資料と人の数を入れる（素材の容量は最初の夜間の数え直しで入る）
--
-- 決まり（docs/db-migrations.md）
-- - 足す → 移す → 縮める の段を踏む。消す・名前を変える・NOT NULL を付けるは、別の PR に分ける（DB contract の関門が見る）
-- - 番人は前の版の書き込み（資料を作る・消す・人を足す・外す）も数えるだけで、書き込みを弾かない・書き換えない
--   （数え先の組織が無い設置＝配布版では何もしない）。資料の組織の印（organization_id・20261008170329_organization_scope.sql）を読む

-- ---------------------------------------------------------------------------
-- 1. 数える番人
-- ---------------------------------------------------------------------------
-- 番人は作った人の権限で数える（security definer・search_path は空）。書き込んだ側の役割（前の版のアプリ・配布版の通常運転の役割・
-- 資料と版だけを書ける役割）に使用量の表と数える口の権限が無くても、資料と人の書き込みを数えるだけで弾かない
-- 資料の数: 生きている資料（消した印が無い）が増えた・減った同じ書き込みの中で足し引きする
create function public.organization_usage_count_pages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.organization_id is not null and old.deleted_at is null then
    perform public.org_add_usage(old.organization_id, 'pages', -1);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.organization_id is not null and new.deleted_at is null then
    perform public.org_add_usage(new.organization_id, 'pages', 1);
  end if;
  return null;
end $$;
revoke all on function public.organization_usage_count_pages() from public, anon, authenticated;

-- db-contract: reviewed 数えるだけの後ろの番人（after）。前の版の資料を作る・消す・戻すの書き込みを弾かない・書き換えない。数え先の組織が無い設置では何もしない
create trigger pages_count_usage
  after insert or delete or update of deleted_at, organization_id on public.pages
  for each row execute function public.organization_usage_count_pages();

-- 人数: 有効な所属が増えた・減った（足す・外す・戻す）同じ書き込みの中で足し引きする
create function public.organization_usage_count_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.status = 'active' then
    perform public.org_add_usage(old.organization_id, 'members', -1);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.status = 'active' then
    perform public.org_add_usage(new.organization_id, 'members', 1);
  end if;
  return null;
end $$;
revoke all on function public.organization_usage_count_members() from public, anon, authenticated;

-- db-contract: reviewed 数えるだけの後ろの番人（after）。前の版の人を足す・外す・戻すの書き込みを弾かない・書き換えない
create trigger organization_members_count_usage
  after insert or delete or update of status, organization_id on public.organization_members
  for each row execute function public.organization_usage_count_members();

-- ---------------------------------------------------------------------------
-- 2. 夜間の数え直し
-- ---------------------------------------------------------------------------
-- 夜間の数え直し: 資料と人は実際の行から、素材の容量は呼ぶ側が素材の置き場の鍵の頭から数えた値（null なら触らない）で置き直す。
-- 答えは項目ごとの前（previous_value）と後（counted_value）。ずれた数をログに残す
create function public.org_recount_usage(p_organization_id uuid, p_storage_bytes bigint)
returns table(item text, previous_value bigint, counted_value bigint)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  counted record;
  previous bigint;
begin
  if p_organization_id is null or (p_storage_bytes is not null and p_storage_bytes < 0) then
    raise exception 'usage_invalid';
  end if;
  for counted in
    select 'pages'::text as name, (select count(*) from public.pages p where p.organization_id = p_organization_id and p.deleted_at is null)::bigint as value
    union all
    select 'members', (select count(*) from public.organization_members m where m.organization_id = p_organization_id and m.status = 'active')::bigint
    union all
    select 'storage_bytes', p_storage_bytes
  loop
    continue when counted.value is null;
    select u.value into previous from public.organization_usage u
     where u.organization_id = p_organization_id and u.metric = counted.name for update;
    insert into public.organization_usage as u (organization_id, metric, value, updated_at, recounted_at)
    values (p_organization_id, counted.name, counted.value, now(), now())
    on conflict (organization_id, metric) do update set value = excluded.value, updated_at = now(), recounted_at = now();
    item := counted.name;
    previous_value := coalesce(previous, 0);
    counted_value := counted.value;
    return next;
  end loop;
end $$;
revoke all on function public.org_recount_usage(uuid, bigint) from public, anon, authenticated;
grant execute on function public.org_recount_usage(uuid, bigint) to service_role;

-- ---------------------------------------------------------------------------
-- 3. 移す: いまある組織の資料と人の数（素材の容量は最初の夜間の数え直しで入る）
-- ---------------------------------------------------------------------------
insert into public.organization_usage (organization_id, metric, value)
select o.id, 'pages', count(p.id)
  from public.organizations o
  left join public.pages p on p.organization_id = o.id and p.deleted_at is null
 group by o.id
on conflict (organization_id, metric) do nothing;

insert into public.organization_usage (organization_id, metric, value)
select o.id, 'members', count(m.email)
  from public.organizations o
  left join public.organization_members m on m.organization_id = o.id and m.status = 'active'
 group by o.id
on conflict (organization_id, metric) do nothing;
