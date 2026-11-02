-- organization_custom_domains: 組織が自分のドメイン（独自ドメイン）で Pages を開くための表を足す（複数組織対応の C4）。
-- 設計の正本は docs/multi-organization.md の「独自ドメイン」。足すだけ（前の版のアプリはこの表を知らないので、何も変わらない）。
--
-- 1 組織に独自ドメインは 1 つ。既定の宛先（<呼び名>.<根>）は残し、独自ドメインが「使える」になったら既定の宛先から 308 で送る。
-- 所有の確認（DNS の TXT `_pages-verify.<ドメイン>` に組織ごとの乱数を置けるか）が済むまで Vercel に登録しない。
-- 夜間の見張りで TXT が消えていたら「要再確認」（verification = 'lost'）にして宛先を止める（既定の宛先では開き続ける）。
--
-- 宛先 → 組織は組織が決まる前に引くので、組織に属さない表（lib/tenant-tables.json の global）。読み書きの口は lib/organization-custom-domains.ts。
-- 外した行は消さず印を立てる（removed_at・removed_by）。外したドメインは別の組織が入れられる（一意の縛りは外していない行だけ）。

create table public.organization_domains_custom (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  -- 独自ドメイン（ホスト名・小文字・ポートなし・2 ラベル以上）。形と予約（根の下・配備の宛先）は lib/organization-hosts.ts の checkCustomDomain が先に断る
  domain text not null check (
    domain = lower(btrim(domain)) and char_length(domain) <= 253
    and domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
  ),
  -- TXT に置いてもらう値。組織ごと（行ごと）の乱数で、秘密ではない（DNS に出る）
  verify_token text not null check (verify_token ~ '^[0-9a-f]{40}$'),
  -- 所有の確認: pending（まだ）・verified（確かめた）・lost（見張りで TXT が消えていた＝要再確認。宛先を止める）
  verification text not null default 'pending' check (verification in ('pending', 'verified', 'lost')),
  -- 証明書: waiting（Vercel に登録して発行を待っている・まだ登録していない）・issued（発行済み）
  certificate text not null default 'waiting' check (certificate in ('waiting', 'issued')),
  added_at timestamptz not null default now(),
  added_by text check (added_by is null or added_by = lower(btrim(added_by))),
  verified_at timestamptz,
  lost_at timestamptz,
  checked_at timestamptz,
  removed_at timestamptz,
  removed_by text check (removed_by is null or removed_by = lower(btrim(removed_by))),
  -- 確かめたことのある行だけが確かめた時刻を持つ。要再確認の行は消えていた時刻を持つ
  constraint organization_domains_custom_verified_stamp check (verification = 'pending' or verified_at is not null),
  constraint organization_domains_custom_lost_stamp check (verification <> 'lost' or lost_at is not null),
  -- 証明書が出ているのは、確かめたことのある行だけ
  constraint organization_domains_custom_certificate_after_verify check (certificate = 'waiting' or verified_at is not null)
);

comment on table public.organization_domains_custom is
  '組織の独自ドメイン（1 組織に 1 つ）。TXT で所有を確かめてから Vercel に登録し、証明書が出たら使える。設計は docs/multi-organization.md';
comment on column public.organization_domains_custom.verify_token is 'DNS の TXT（_pages-verify.<ドメイン>）に置いてもらう値。組織ごとの乱数（秘密ではない）';
comment on column public.organization_domains_custom.verification is 'pending=まだ確かめていない / verified=確かめた / lost=見張りで TXT が消えていた（要再確認・宛先を止める）';

-- 同じドメインは全体で 1 つの組織にしか結べない。数えるのは所有を確かめた行（確かめた・要再確認）だけ——まだ確かめていない行まで数えると、
-- 他社のドメインを入れて確かめずに置いておくだけで本当の持ち主を締め出せる。確かめていない行どうしは並んでよく、先に確かめた組織が取る
-- （あとから確かめた組織はこの縛りに当たって「別の組織が使っています」になる）。外した行は数えない
create unique index organization_domains_custom_domain_key on public.organization_domains_custom (domain) where removed_at is null and verification <> 'pending';
-- 1 組織に独自ドメインは 1 つ（外した行は数えない）
create unique index organization_domains_custom_organization_key on public.organization_domains_custom (organization_id) where removed_at is null;

-- 鍵をかける（サービスロール経由のみ・anon と authenticated は全拒否）
alter table public.organization_domains_custom enable row level security;
revoke all on public.organization_domains_custom from public, anon, authenticated;
grant select, insert, update, delete on public.organization_domains_custom to service_role;
