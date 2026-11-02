-- organizations: 組織の台帳と所属の名簿を足し、いまの 最初の組織 を最初の組織として登録する（複数組織対応の A1）。
-- 設計の正本は docs/multi-organization.md。この段では画面もログインも変わらない（表が増えて、読む口が生えるだけ）。
--
-- 足す → 移す まで。admins 表はそのまま残す（縮めるのは A4 で所属が「会社の人」を決めるようになってから）。
-- 前の版のアプリはこの 4 つの表を知らないので、読み書きの形は何も変わらない。
--
-- 読み書きの口は lib/organizations.ts（判定はしない）、呼び名の予約語は lib/organization-slugs.ts。

-- ---------------------------------------------------------------------------
-- 1. 組織の台帳
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  -- 宛先の頭（acme.<組織の宛先の末尾> の acme）。作ったあと変えない。予約語は lib/organization-slugs.ts が断る
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$' and position('--' in slug) = 0),
  name text not null check (btrim(name) <> '' and char_length(name) <= 100),
  kind text not null default 'team' check (kind in ('team', 'personal')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  plan text not null default 'standard' check (plan ~ '^[a-z][a-z0-9-]{1,30}$'),
  -- 組織の宛先（ホスト名）。小文字・ポートなし
  host text not null unique check (host ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  -- 素材の置き場の頭。最初の組織（最初の組織）だけ空で、既存の素材を 1 つも動かさない。新しい組織は o/<組織の目印>/
  asset_prefix text not null unique check (asset_prefix = '' or asset_prefix = 'o/' || id::text || '/'),
  default_locale text not null default 'ja' check (default_locale in ('ja', 'en')),
  -- 仕掛け入りの HTML を動かしてよいか。新しい組織は既定で許さない（配布版と同じ制限。 の決定 11）
  html_scripts_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  created_by text check (created_by is null or created_by = lower(btrim(created_by)))
);

comment on table public.organizations is
  '組織（Pages を使う単位。法人 1 社、または 1 人だけの組織）。設計は docs/multi-organization.md';
comment on column public.organizations.slug is '宛先の頭。作ったあと変えない（変えると貼られたリンクが切れる）';
comment on column public.organizations.host is '組織の宛先（ホスト名）。どの組織の話かは URL のホスト名で決まる';
comment on column public.organizations.asset_prefix is '素材の置き場の頭。最初の組織は空、新しい組織は o/<組織の目印>/';

-- ---------------------------------------------------------------------------
-- 2. 組織のドメイン（自動で参加するか）
-- ---------------------------------------------------------------------------
create table public.organization_domains (
  organization_id uuid not null references public.organizations(id),
  domain text not null check (domain = lower(btrim(domain)) and domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  auto_join boolean not null default false,
  added_at timestamptz not null default now(),
  added_by text check (added_by is null or added_by = lower(btrim(added_by))),
  primary key (organization_id, domain)
);

comment on table public.organization_domains is '組織のドメイン。auto_join の行は「このドメインの人は自動で参加」';

-- 自動で参加するドメインは 1 つの組織にしか結べない（同じ人がどの組織に入るかが 1 つに決まらなくなる）
create unique index organization_domains_auto_join_key on public.organization_domains (domain) where auto_join;

-- ---------------------------------------------------------------------------
-- 3. 所属の名簿（組織 × アドレス × 役割 × 有効/外した）
-- ---------------------------------------------------------------------------
create table public.organization_members (
  organization_id uuid not null references public.organizations(id),
  -- 人の鍵はメールアドレス（小文字・前後の空白なし）。利用者の表は作らない（の決定 3）
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  role text not null check (role in ('owner', 'admin', 'member')),
  -- 外した人は行を消さず印を立てる（誰がいつ外したかは監査の材料）。戻すときは status だけを有効に戻し、
  -- 役割と最後に外した記録（removed_at・removed_by）は残して、戻した記録（restored_at・restored_by）を足す
  status text not null default 'active' check (status in ('active', 'removed')),
  added_at timestamptz not null default now(),
  added_by text check (added_by is null or added_by = lower(btrim(added_by))),
  removed_at timestamptz,
  removed_by text check (removed_by is null or removed_by = lower(btrim(removed_by))),
  restored_at timestamptz,
  restored_by text check (restored_by is null or restored_by = lower(btrim(restored_by))),
  -- 外した行は必ず外した時刻を持つ。戻した記録は、外した記録のある行にしか付かない
  constraint organization_members_removed_stamp check (status <> 'removed' or removed_at is not null),
  constraint organization_members_restored_stamp check (restored_at is null or removed_at is not null),
  primary key (organization_id, email)
);

comment on table public.organization_members is
  '所属の名簿。1 人が複数の組織に入れる。外した人は status = removed で残す（読む口は有効な行だけを返す）';

-- 「この人はどの組織に入っているか」を引くため（ログインのあとに使う）
create index organization_members_email_idx on public.organization_members (email) where status = 'active';

-- ---------------------------------------------------------------------------
-- 4. 運営者の名簿（組織を作る・止める人。組織の中身は読めない）
-- ---------------------------------------------------------------------------
create table public.platform_operators (
  email text primary key check (email = lower(btrim(email)) and email like '%_@_%'),
  added_at timestamptz not null default now(),
  added_by text check (added_by is null or added_by = lower(btrim(added_by)))
);

comment on table public.platform_operators is
  '運営者（Pages というサービスを運営する人）。組織の管理者とは別の役割で、運営者でも組織の中身は読めない';

-- ---------------------------------------------------------------------------
-- 5. 鍵をかける（サービスロール経由のみ・anon と authenticated は全拒否）
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.organization_domains enable row level security;
alter table public.organization_members enable row level security;
alter table public.platform_operators enable row level security;
revoke all on public.organizations from public, anon, authenticated;
revoke all on public.organization_domains from public, anon, authenticated;
revoke all on public.organization_members from public, anon, authenticated;
revoke all on public.platform_operators from public, anon, authenticated;
grant select, insert, update, delete on public.organizations to service_role;
grant select, insert, update, delete on public.organization_domains to service_role;
grant select, insert, update, delete on public.organization_members to service_role;
grant select, insert, update, delete on public.platform_operators to service_role;

-- ---------------------------------------------------------------------------
-- 6. 移す: いまの 最初の組織 を最初の組織にする
-- ---------------------------------------------------------------------------
-- 目印・呼び名・宛先・ドメインの値は lib/organizations.ts の FIRST_ORGANIZATION と同じ（検査表が突き合わせる）。
-- 目印を固定にしておくのは、ステージング・PR 専用 DB・本番・見本で同じ行を指せるようにするため。
-- 印で囲んだ範囲は、配布版（受講生向け）の新しい設置では scripts/database.mjs が丸ごと外す（会社の行を入れない）。
-- company-seed: begin
insert into public.organizations (id, slug, name, kind, status, plan, host, asset_prefix, default_locale, html_scripts_allowed)
values ('00000000-0000-4000-8000-000000000001', 'surprise', '最初の組織', 'team', 'active', 'standard', 'pages.example.com', '', 'ja', true)
on conflict do nothing;

insert into public.organization_domains (organization_id, domain, auto_join)
values ('00000000-0000-4000-8000-000000000001', 'example.com', true)
on conflict do nothing;

-- 管理者の名簿（admins）の社員 → 役割 admin
insert into public.organization_members (organization_id, email, role)
select '00000000-0000-4000-8000-000000000001', people.email, 'admin'
from (select distinct lower(btrim(a.email)) as email from public.admins a) as people
where split_part(people.email, '@', 1) <> '' and split_part(people.email, '@', 2) = 'example.com'
on conflict do nothing;

-- ページ・版・コメント・設定・鍵・許可・まとまり・見た記録のどこかに出てきた社員 → 役割 member
-- （admin で入った人は上で入っているので、そのまま admin で残る）。@example.com でないアドレス（昔のゲスト・検査用）は入れない
insert into public.organization_members (organization_id, email, role)
select '00000000-0000-4000-8000-000000000001', people.email, 'member'
from (
  select lower(btrim(p.created_by)) as email from public.pages p
  union select lower(btrim(r.author_email)) from public.page_revisions r
  union select lower(btrim(c.author_email)) from public.page_comments c
  union select lower(btrim(w.owner_email)) from public.workspace_preferences w
  union select lower(btrim(t.owner_email)) from public.publish_tokens t
  union select lower(btrim(g.member_email)) from public.page_permissions g
  union select lower(btrim(m.member_email)) from public.group_members m
  union select lower(btrim(v.viewer_email)) from public.page_views v
) as people
where split_part(people.email, '@', 1) <> '' and split_part(people.email, '@', 2) = 'example.com'
on conflict do nothing;

-- 運営者の最初の 1 人（0006 の最初の管理者と同じ人）
insert into public.platform_operators (email) values ('owner@example.com') on conflict do nothing;
-- company-seed: end
