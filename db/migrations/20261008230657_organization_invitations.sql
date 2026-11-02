-- organization_invitations: 組織の管理者が作る招待（リンクで渡す・相手のアドレスと役割に縛る・7 日で切れる・1 回で使い切る）の表を足す
-- （複数組織対応の B1）。設計の正本は docs/multi-organization.md の「招待・役割・外す」。足すだけで、既存の表・関数・行は書き換えない。
--
-- 招待は所属の名簿（organization_members）とは別の表に置く。1 つの表で「招待中」と「所属」を状態で分けると、
-- 名簿の判定に招待中が混ざる事故が起きるため（の決定 3）。承諾で所属の行を作り、招待には使った印を立てる。
-- 札（リンクの末尾）の生の値は置かない。置くのは sha256 のハッシュだけ（投稿の鍵と同じ流儀）。
--
-- 決まり（docs/db-migrations.md）
-- - 足す → 移す → 縮める の段を踏む。消す・名前を変える・NOT NULL を付けるは、別の PR に分ける（DB contract の関門が見る）
-- - 当てるのは CI（main に入るとステージングへ、本番は承認つきの実行で）。管理画面から手で当てない
-- - 前の版のアプリはこの表を読まない（足すだけなので、公開までの間に前の版が動いていても困らない）

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  -- 組織に属する表（lib/tenant-tables.json の organization）。読み書きは組織で絞った口（orgDb）だけを通す
  organization_id uuid not null references public.organizations(id),
  -- 招いた相手のアドレス（小文字・前後の空白なし）。受け取るときに Google で確かめたアドレスと突き合わせる
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  role text not null check (role in ('owner', 'admin', 'member')),
  -- 札の sha256（16 進 64 桁）。生の札は作った直後の 1 回だけ画面に出し、どこにも残さない
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by text not null check (created_by = lower(btrim(created_by))),
  -- 使った印（受け取った人のアドレスと時刻）。行は消さない
  used_at timestamptz,
  used_by text check (used_by is null or used_by = lower(btrim(used_by))),
  -- 取り消した印（管理者が取り消した・同じ相手に作り直した）。行は消さない
  revoked_at timestamptz,
  revoked_by text check (revoked_by is null or revoked_by = lower(btrim(revoked_by))),
  constraint organization_invitations_used_stamp check ((used_at is null) = (used_by is null)),
  constraint organization_invitations_one_end check (used_at is null or revoked_at is null),
  constraint organization_invitations_expiry check (expires_at > created_at)
);

comment on table public.organization_invitations is
  '組織への招待（リンクで渡す）。相手のアドレスと役割に縛り、7 日で切れ、1 回で使い切る。札はハッシュだけ。';

-- 同じ組織・同じアドレスの生きた招待（使っていない・取り消していない）は 1 件だけ。作り直すときは前のものに取り消しの印を立ててから足す
create unique index organization_invitations_alive_key
  on public.organization_invitations (organization_id, email)
  where used_at is null and revoked_at is null;

-- 招待中の一覧（組織ごと・新しい順）
create index organization_invitations_organization_idx
  on public.organization_invitations (organization_id, created_at desc);

alter table public.organization_invitations enable row level security;
revoke all on public.organization_invitations from public, anon, authenticated;
grant select, insert, update, delete on public.organization_invitations to service_role;
