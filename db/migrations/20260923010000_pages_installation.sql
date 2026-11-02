-- 個人用に初期化した保存先の印。
--
-- 配布版のサーバーは接続のたびにこの 1 行を読み、設置した本人（PAGES_OWNER_EMAIL）と
-- 突き合わせる（lib/database.ts）。合わなければ何も読み書きしない。
-- 他人の保存先や、初期化していない保存先へつながったまま動かないための仕組み。
--
-- 表の定義はここが正本。行を入れるのは初期化の脚本（scripts/database.mjs）だけで、
-- 通常運転の接続には読む権限しか渡さない（誰の設置かを書き換えさせない）。
-- 社内版はこの表を読まないので、社内の保管庫では空のまま残る。

create table if not exists public.pages_installation (
  singleton boolean primary key check (singleton),
  edition text not null check (edition = 'personal'),
  owner_email text not null check (owner_email = lower(owner_email) and owner_email like '%_@_%')
);

comment on table public.pages_installation is
  '個人用に初期化した保存先の印。1 行だけ。通常運転の接続は読むだけ';

alter table public.pages_installation enable row level security;
-- ポリシーは意図的に作らない。読む権限と読むポリシーは初期化の脚本が通常運転の役割にだけ付ける
revoke all on public.pages_installation from public, anon, authenticated;
