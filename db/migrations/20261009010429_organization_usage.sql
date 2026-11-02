-- organization_usage: 組織ごとの使用量（人数・資料・素材の容量・1 日の AI の回数）を数え、契約の段階に応じた上限で止めるための足し分
-- （複数組織対応の C2）。設計の正本は docs/multi-organization.md の「使用量と上限」。上限の値の正本は lib/plans.ts（DB には置かない）。
--
-- 1. organizations.limits_override … enterprise の組織の個別の上限（jsonb・項目 → 数か null）。既定値は付けない（無い＝台帳のまま）
-- 2. organization_usage … 組織 × 項目（members・pages・storage_bytes）→ 数。運営者が組織をまたいで数字だけ読むので、組織に属さない表
--    （lib/tenant-tables.json の global。所属の名簿と同じく主キーに組織の目印を持つ）
-- 3. organization_ai_usage … 組織 × AI の機能 × 日 → 回数（組織に属する表）。画像検索は前からの deck_image_search_usage で数える
-- 4. 数える口 … org_add_usage（足し引き・素材の容量は受け取りの口が足す）と org_consume_ai_usage（1 日の AI の回数）
--    数える番人・夜間の数え直し・いまある数の「移す」段は、次の移行（<番号>_organization_usage_counting.sql）
--
-- 決まり（docs/db-migrations.md）
-- - 足す → 移す → 縮める の段を踏む。消す・名前を変える・NOT NULL を付けるは、別の PR に分ける（DB contract の関門が見る）
-- - 前の版のアプリは新しい列・表・関数を読まない

-- ---------------------------------------------------------------------------
-- 1. enterprise の組織の個別の上限
-- ---------------------------------------------------------------------------
alter table public.organizations add column limits_override jsonb check (limits_override is null or jsonb_typeof(limits_override) = 'object');

comment on column public.organizations.limits_override is
  'enterprise の組織の個別の上限（項目 → 数か null＝上限なし）。段が enterprise のときだけ lib/plans.ts の台帳に勝つ。無い（null）＝台帳のまま。';

-- ---------------------------------------------------------------------------
-- 2. 組織ごとの使用量（人数・資料・素材の容量）
-- ---------------------------------------------------------------------------
create table public.organization_usage (
  organization_id uuid not null references public.organizations(id),
  -- members … 有効な所属の人数 / pages … 生きている資料の数 / storage_bytes … 素材の容量（バイト）
  metric text not null check (metric in ('members', 'pages', 'storage_bytes')),
  value bigint not null default 0 check (value >= 0),
  -- 最後に足し引きした時刻
  updated_at timestamptz not null default now(),
  -- 最後に夜間の数え直しで実物に合わせた時刻（まだ合わせていなければ空）
  recounted_at timestamptz,
  primary key (organization_id, metric)
);

comment on table public.organization_usage is
  '組織ごとの使用量（人数・資料・素材の容量）。増やす口と番人が同じ書き込みの中で足し、夜間の数え直しが実際の行と素材の置き場から直す。運営者が組織をまたいで数字だけ読む。';

alter table public.organization_usage enable row level security;
revoke all on public.organization_usage from public, anon, authenticated;
grant select, insert, update, delete on public.organization_usage to service_role;

-- ---------------------------------------------------------------------------
-- 3. 1 日の AI の回数（自然な声の読み上げ）
-- ---------------------------------------------------------------------------
create table public.organization_ai_usage (
  organization_id uuid not null references public.organizations(id),
  feature text not null check (feature in ('read-aloud')),
  -- 日本時間の日付（lib/organization-usage.ts の japanDay）
  usage_day date not null,
  requests integer not null default 0 check (requests >= 0),
  primary key (organization_id, feature, usage_day)
);

comment on table public.organization_ai_usage is
  '組織ごとの 1 日の AI の回数（自然な声の読み上げを読み始めた回数）。上限は lib/plans.ts。画像検索は deck_image_search_usage で数える。';

alter table public.organization_ai_usage enable row level security;
revoke all on public.organization_ai_usage from public, anon, authenticated;
grant select, insert, update, delete on public.organization_ai_usage to service_role;

-- ---------------------------------------------------------------------------
-- 4. 数える口
-- ---------------------------------------------------------------------------
-- 使用量を足し引きする（下がりすぎても 0 で止める・ずれは夜間に直る）。数え先の組織が無い（配布版の設置）なら何もしない
create function public.org_add_usage(p_organization_id uuid, p_metric text, p_delta bigint)
returns bigint
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  result bigint;
begin
  if p_organization_id is null or p_metric is null or p_delta is null then
    raise exception 'usage_invalid';
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_organization_id) then
    return null;
  end if;
  insert into public.organization_usage as u (organization_id, metric, value, updated_at)
  values (p_organization_id, p_metric, greatest(p_delta, 0), now())
  on conflict (organization_id, metric) do update
    set value = greatest(u.value + p_delta, 0), updated_at = now()
  returning u.value into result;
  return result;
end $$;
revoke all on function public.org_add_usage(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.org_add_usage(uuid, text, bigint) to service_role;

-- 1 日の AI の回数を 1 回ぶん使う。上限（null は上限なし）に届いていれば使わずに断る。同じ組織・日の同時の呼び出しは 1 本ずつ
create function public.org_consume_ai_usage(p_organization_id uuid, p_feature text, p_day date, p_limit integer)
returns table(allowed boolean, used_count integer)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  used integer;
begin
  if p_organization_id is null or p_feature is null or p_day is null or (p_limit is not null and p_limit < 0) then
    raise exception 'ai_usage_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text || ':' || p_feature || ':' || p_day::text, 19));
  select coalesce(u.requests, 0) into used from public.organization_ai_usage u
   where u.organization_id = p_organization_id and u.feature = p_feature and u.usage_day = p_day;
  if not found then used := 0; end if;
  if p_limit is not null and used >= p_limit then
    return query select false, used; return;
  end if;
  insert into public.organization_ai_usage as u (organization_id, feature, usage_day, requests)
  values (p_organization_id, p_feature, p_day, 1)
  on conflict (organization_id, feature, usage_day) do update set requests = u.requests + 1
  returning u.requests into used;
  return query select true, used;
end $$;
revoke all on function public.org_consume_ai_usage(uuid, text, date, integer) from public, anon, authenticated;
grant execute on function public.org_consume_ai_usage(uuid, text, date, integer) to service_role;
