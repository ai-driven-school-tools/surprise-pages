-- beta_feature_optins: 本人が個人設定で入れた「ベータ機能」を控える表。
-- 1 人 1 機能 1 行。行があれば入、無ければ切（既定はどの機能も切）。
-- 機能の名前の正本はアプリ側の台帳（lib/beta-features.ts）。ここでは名前を縛らない——
-- 機能を足すたびに DB の変更を出さずに済ませるため（台帳に無い名前の行は、読む側が捨てる）。
--
-- 足すだけの変更（新しい表）。前の版はこの表を読まない。
create table public.beta_feature_optins (
  owner_email text not null check (owner_email = lower(owner_email)),
  feature text not null check (feature ~ '^[a-z][a-z0-9-]{1,39}$'),
  added_at timestamptz not null default now(),
  primary key (owner_email, feature)
);

comment on table public.beta_feature_optins is
  '本人が入れたベータ機能。行がある間だけ、その人の画面にその機能の入口を出す（台帳は lib/beta-features.ts）';

alter table public.beta_feature_optins enable row level security;
-- ポリシーは作らない（サービスロール経由のみ・anon は全拒否）
revoke all on public.beta_feature_optins from public, anon, authenticated;
grant select, insert, update, delete on public.beta_feature_optins to service_role;
