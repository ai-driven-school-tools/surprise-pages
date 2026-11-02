-- organization_secret_checks: 組織の秘密の鍵の「確かめる」に回数の上限を付ける（複数組織対応の B2）。
-- 「確かめる」は外のサービス（Gemini）へ要求を 1 回投げる（費用がかかる）ので、組織 × 名前ごとに短い間隔の上限を置く。
-- 足すだけで、既存の表・行・関数は 1 つも書き換えない。前の版のアプリはこの表と関数を知らない。
--
-- 決まり（docs/db-migrations.md）
-- - 足す → 移す → 縮める の段を踏む。消す・名前を変える・NOT NULL を付けるは、別の PR に分ける（DB contract の関門が見る）
-- - 当てるのは CI（main に入るとステージングへ、本番は承認つきの実行で）。管理画面から手で当てない
-- - 列の既定値（DEFAULT）に組織の目印を入れない（A1 の決まり）

-- ---------------------------------------------------------------------------
-- 1. 回数の控え（値も鍵も持たない。組織 × 名前 → いまの区切りの始まりと回数だけ）
-- ---------------------------------------------------------------------------
create table public.organization_secret_checks (
  organization_id uuid not null references public.organizations(id),
  name text not null check (name ~ '^[a-z][a-z0-9-]{1,39}$'),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts >= 1),
  primary key (organization_id, name)
);

comment on table public.organization_secret_checks is
  '組織の秘密の鍵の「確かめる」の回数の控え（短い区切りごとの上限）。値・鍵は持たない。lib/organization-secret-verify.ts';

alter table public.organization_secret_checks enable row level security;
revoke all on public.organization_secret_checks from public, anon, authenticated;
grant select, insert, update, delete on public.organization_secret_checks to service_role;

-- ---------------------------------------------------------------------------
-- 2. 1 回ぶん使う（同時に押されても数え違えない・1 文で数える）
-- ---------------------------------------------------------------------------
-- 区切り（p_window_seconds 秒）が過ぎていれば 1 から数え直す。上限を超えた回は allowed = false（回数は数える・連打を続けても通らない）。
-- db-contract: reviewed 新しい関数を足すだけ（既存の関数を置き換えない）。書くのはこの関数のために足した回数の表の 1 行だけで、ほかの表に触らない
create function public.org_consume_secret_check(
  p_organization_id uuid,
  p_name text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, attempts integer)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  used integer;
begin
  if p_organization_id is null or p_name is null or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'secret_check_limit_invalid';
  end if;
  insert into public.organization_secret_checks as c (organization_id, name, window_started_at, attempts)
  values (p_organization_id, p_name, now(), 1)
  on conflict (organization_id, name) do update set
    window_started_at = case when c.window_started_at <= now() - make_interval(secs => p_window_seconds) then now() else c.window_started_at end,
    attempts = case when c.window_started_at <= now() - make_interval(secs => p_window_seconds) then 1 else c.attempts + 1 end
  returning c.attempts into used;
  return query select used <= p_limit, used;
end $$;

revoke all on function public.org_consume_secret_check(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.org_consume_secret_check(uuid, text, integer, integer) to service_role;
