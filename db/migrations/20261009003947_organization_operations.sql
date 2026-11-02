-- organization_operations: 運営者が組織を作る・止める・再開する、所属の無い人が個人の組織を頼む、持ち主が規約に同意した記録を残す
-- ための足し分（複数組織対応の B4）。設計の正本は docs/multi-organization.md の「運営者の画面と組織を作る入口」（独自ドメイン C4・組織ごとの連携 B3 の移行より後に当たる）。
--
-- 1. organizations.status に preparing（宛先の準備中）を足す。組織を作る口は行を preparing で先に置き、宛先の登録（Vercel）が
--    済んでから active にする。登録に失敗した組織は preparing のまま運営の一覧に残り、やり直せる。既存の行は active / suspended のまま
-- 2. organization_requests … 運営者への依頼（個人の組織を頼む・個人の組織の自動参加のドメインを認めてもらう）。組織をまたいで運営者が読む表
-- 3. terms_acceptances … 規約への同意の記録（組織 × 人 × 規約の版 × 時刻）。持ち主として組織を受け取るときに残す
--    あわせて、個人の組織は 1 人 1 つ（created_by の部分の一意の索引）
-- 4. org_member_identity … 止めた組織（と準備中の組織）では、誰も所属なし（role は null）にする。行もデータも消さない（再開は印を戻すだけ）
--
-- 決まり（docs/db-migrations.md）
-- - 足す → 移す → 縮める の段を踏む。消す・名前を変える・NOT NULL を付けるは、別の PR に分ける（DB contract の関門が見る）
-- - 当てるのは CI（main に入るとステージングへ、本番は承認つきの実行で）。管理画面から手で当てない
-- - 前の版のアプリは preparing の行を作らない。新しい 2 つの表も読まない。所属の関数の答えが変わるのは止めた組織だけ（いまは 0 件）

-- ---------------------------------------------------------------------------
-- 1. 組織の状態に「宛先の準備中」を足す（値を広げるだけ。既存の行は 1 行も弾かない）
-- ---------------------------------------------------------------------------
alter table public.organizations drop constraint organizations_status_check;
alter table public.organizations add constraint organizations_status_check
  check (status in ('active', 'suspended', 'preparing'));

-- 個人の組織は 1 人 1 つ（created_by がその組織を使う本人）。同時に 2 回押されても 2 つ目を置かない。
-- いま個人の組織は 1 つも無い（作る口はこの版で初めてできる）ので、既存の行を弾かない
-- db-contract: reviewed 部分の一意の索引を足すだけ。対象は kind = 'personal' の行で、個人の組織を作る口はこの版で初めてできる（前の版は作らない・いまの行は 0）
create unique index organizations_personal_owner_key on public.organizations (created_by) where kind = 'personal';

comment on column public.organizations.status is
  'active（使える）・suspended（止めた。宛先は 404・所属なし・データは残す）・preparing（宛先の準備中。宛先の登録が済んだら active）';

-- ---------------------------------------------------------------------------
-- 2. 運営者への依頼
-- ---------------------------------------------------------------------------
create table public.organization_requests (
  id uuid primary key default gen_random_uuid(),
  -- personal … 所属の無い人が「自分だけで使う」組織を頼んだ（自己登録のスイッチを切っている間）
  -- domain   … 個人の組織の持ち主が、自分のドメインを自動参加に結ぶのを頼んだ（個人の組織は会社のドメインを先に結べない）
  kind text not null check (kind in ('personal', 'domain')),
  -- 頼んだ人（Google で確かめたアドレス・小文字・前後の空白なし）
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  -- 頼んだ人の表示名（個人の組織の名前の材料）
  name text check (name is null or (btrim(name) <> '' and char_length(name) <= 100)),
  -- domain は対象の組織。personal は認めて作った組織（作るまでは空）
  organization_id uuid references public.organizations(id),
  domain text check (domain is null or (domain = lower(btrim(domain)) and domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$')),
  -- 頼んだときに同意した規約の版（personal だけ。作った組織の同意の記録にこの版と頼んだ時刻を写す）
  terms_version text check (terms_version is null or terms_version ~ '^[a-z0-9][a-z0-9.-]{0,39}$'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text check (decided_by is null or decided_by = lower(btrim(decided_by))),
  constraint organization_requests_shape check (
    (kind = 'personal' and domain is null and terms_version is not null)
    or (kind = 'domain' and organization_id is not null and domain is not null)
  ),
  constraint organization_requests_decided check ((status = 'pending') = (decided_at is null))
);

comment on table public.organization_requests is
  '運営者への依頼（個人の組織を頼む・個人の組織の自動参加のドメイン）。運営者が組織をまたいで読む。行は消さず、認めた・断ったの印を立てる。';

-- 返事を待っている依頼は、1 人 1 件（個人の組織）・1 組織 1 ドメイン 1 件（自動参加）
create unique index organization_requests_personal_pending_key
  on public.organization_requests (email) where kind = 'personal' and status = 'pending';
create unique index organization_requests_domain_pending_key
  on public.organization_requests (organization_id, domain) where kind = 'domain' and status = 'pending';
-- 運営の一覧（返事を待っている順）
create index organization_requests_pending_idx
  on public.organization_requests (created_at) where status = 'pending';

alter table public.organization_requests enable row level security;
revoke all on public.organization_requests from public, anon, authenticated;
grant select, insert, update, delete on public.organization_requests to service_role;

-- ---------------------------------------------------------------------------
-- 3. 規約への同意の記録
-- ---------------------------------------------------------------------------
create table public.terms_acceptances (
  -- 組織に属する表（lib/tenant-tables.json の organization）。書くのは組織で絞った口（orgDb）だけ
  organization_id uuid not null references public.organizations(id),
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  -- 規約の版（lib/terms.ts の TERMS_VERSION・本文の置き場は docs/terms/）
  terms_version text not null check (terms_version ~ '^[a-z0-9][a-z0-9.-]{0,39}$'),
  accepted_at timestamptz not null default now(),
  -- どこで同意したか（招待を受け取った・自分で個人の組織を作った・運営者に頼んだ）
  via text not null check (via in ('invitation', 'self-serve', 'request')),
  primary key (organization_id, email, terms_version)
);

comment on table public.terms_acceptances is
  '規約への同意の記録（いつ・誰が・どの版に）。持ち主として組織を受け取るときに残す。行は消さない。';

alter table public.terms_acceptances enable row level security;
revoke all on public.terms_acceptances from public, anon, authenticated;
grant select, insert, update, delete on public.terms_acceptances to service_role;

-- ---------------------------------------------------------------------------
-- 4. 止めた組織では、誰も所属なし
-- ---------------------------------------------------------------------------
-- 中身は 20261008190250_organization_membership.sql の org_member_identity に、頭の 1 段（組織が active でなければ所属なし）を足しただけ。
-- 止めた組織の宛先は関所が 404 で断るが、関所の覚え（60 秒）の間に届いた要求・鍵・入場券・背景の処理も、ここで所属なしになる。
-- 所属の行は消さず、自動参加でも作らない（止めている間にログインした人を所属にしない）。再開すれば今までどおり。
-- db-contract: reviewed 同じ形の関数の置き換え。足したのは「組織が active でなければ所属なし」の頭の 1 段だけで、active の組織の答えは前と 1 文字も変わらない。書くのは前と同じ自動参加の 1 行（on conflict do nothing）だけ
create or replace function public.org_member_identity(p_organization_id uuid, p_email text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  found_role text;
  found_status text;
  local_part text;
  domain_part text;
begin
  if p_organization_id is null or p_email is null or p_email <> lower(btrim(p_email)) then
    return jsonb_build_object('role', null, 'joined', false);
  end if;

  -- 止めた組織・宛先の準備中の組織では、誰も所属なし
  if not exists (select 1 from public.organizations o where o.id = p_organization_id and o.status = 'active') then
    return jsonb_build_object('role', null, 'joined', false);
  end if;

  select m.role, m.status into found_role, found_status
    from public.organization_members m
   where m.organization_id = p_organization_id and m.email = p_email;
  if found then
    return jsonb_build_object('role', case when found_status = 'active' then found_role end, 'joined', false);
  end if;

  local_part := split_part(p_email, '@', 1);
  domain_part := substr(p_email, char_length(local_part) + 2);
  if local_part = '' or domain_part = '' or position('@' in domain_part) > 0 then
    return jsonb_build_object('role', null, 'joined', false);
  end if;
  if not exists (
    select 1 from public.organization_domains d
     where d.organization_id = p_organization_id and d.domain = domain_part and d.auto_join
  ) then
    return jsonb_build_object('role', null, 'joined', false);
  end if;

  insert into public.organization_members (organization_id, email, role, status)
  values (p_organization_id, p_email, 'member', 'active')
  on conflict (organization_id, email) do nothing;

  select m.role, m.status into found_role, found_status
    from public.organization_members m
   where m.organization_id = p_organization_id and m.email = p_email;
  return jsonb_build_object('role', case when found and found_status = 'active' then found_role end, 'joined', found);
end;
$$;
