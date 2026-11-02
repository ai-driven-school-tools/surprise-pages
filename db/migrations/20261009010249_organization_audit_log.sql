-- organization_audit_log: 組織の中の「権限と設定に関わる操作」を、追記専用の記録として残す（複数組織対応の C1）。
-- 設計の正本は docs/multi-organization.md の「監査の記録」。書くのは lib/audit-log.ts の recordAudit だけ（操作を行う関数の中で 1 回）。
--
-- 1. organization_audit_log … 組織 × 時刻 × 誰が × 何を（台帳 lib/audit-actions.ts の符号）× 対象 × 変化の要約（前 → 後）
--    本文・鍵の値は入れない（鍵は「入れ替えた」と末尾 4 文字まで）。変化の要約は 1000 バイトまでに縛る
-- 2. 追記専用の番人 … 書き換えと削除を保存先が断る（版 page_revisions と同じ形・運営者の接続でも通さない）
-- 3. 人と対象の目印（絞り込みの道筋に載せる 12 桁）は、積むときに保存先が作る
-- 4. org_member_identity_audited … 自動参加で所属を作るときに、参加した記録も同じ取引で積む（org_member_identity と同じ答え）
--
-- 決まり（docs/db-migrations.md）
-- - 足す → 移す → 縮める の段を踏む。消す・名前を変える・NOT NULL を付けるは、別の PR に分ける（DB contract の関門が見る）
-- - 当てるのは CI（main に入るとステージングへ、本番は承認つきの実行で）。管理画面から手で当てない
-- - 前の版のアプリはこの表を読みも書きもしない（新しい表を足すだけ）
-- - 録音を組織ごとに閉じる移行（20261009005743_recording_organization.sql・D3）より後に当たる。どちらも相手の表・関数に触らない

-- ---------------------------------------------------------------------------
-- 1. 記録の表
-- ---------------------------------------------------------------------------
create table public.organization_audit_log (
  id uuid primary key default gen_random_uuid(),
  -- 積んだ順（同じ時刻の行も並びが決まる・書き出しの続きを読む位置）
  seq bigint generated always as identity,
  -- 組織に属する表（lib/tenant-tables.json の organization）。書くのは組織で絞った口（orgDb）だけ
  organization_id uuid not null references public.organizations(id),
  created_at timestamptz not null default now(),
  -- 誰が: 組織の人（member）・運営者（operator）・人の手でない処理（system: 外のサービスからの知らせなど）
  actor_kind text not null check (actor_kind in ('member', 'operator', 'system')),
  actor_email text check (actor_email is null or (actor_email = lower(btrim(actor_email)) and actor_email like '%_@_%')),
  -- その時点の表示名（あとで名前が変わっても、記録はそのとき見えていた名前のまま）
  actor_name text check (actor_name is null or (btrim(actor_name) <> '' and char_length(actor_name) <= 100)),
  -- 人の目印（lib/access-roster.ts の memberKeyOf と同じ: そろえたアドレスの sha256 の頭 12 桁）。絞り込みの道筋にアドレスを載せないため。
  -- 書く側は渡さない（下の番人 organization_audit_log_keys が積むときに作る）
  actor_key text,
  -- 何を: 台帳（lib/audit-actions.ts）の符号。`<種類>.<操作>`
  action text not null check (action ~ '^[a-z]+\.[a-z]+(-[a-z]+)*$'),
  -- 対象: 人（アドレス）・ページ（目印）・閲覧グループ（目印）・設定（台帳の名前）・ドメイン・組織（目印）
  target_kind text not null check (target_kind in ('person', 'page', 'group', 'setting', 'domain', 'organization')),
  target text not null check (btrim(target) <> '' and char_length(target) <= 320),
  -- 対象の目印（人は actor_key と同じ 12 桁・ほかは対象そのもの）。対象で絞り込むときに使う。番人が積むときに作る
  target_key text not null,
  -- 変化の要約（{ "from": …, "to": …, "detail": … } の短い文字だけ）。本文・鍵の値は入れない
  change jsonb not null default '{}'::jsonb check (jsonb_typeof(change) = 'object' and octet_length(change::text) <= 1000),
  constraint organization_audit_log_actor check ((actor_kind = 'system') = (actor_email is null)),
  constraint organization_audit_log_person_target check (target_kind <> 'person' or (target = lower(btrim(target)) and target like '%_@_%'))
);

comment on table public.organization_audit_log is
  '組織の中の権限と設定に関わる操作の記録（誰が・何を・対象・変化の要約・時刻）。追記専用（書き換え・削除は番人が断る）。本文と鍵の値は入れない。';

-- 記録の面は組織 × 新しい順（積んだ順）。期間・対象・人で絞るときも組織の中で新しい順
create index organization_audit_log_organization_idx on public.organization_audit_log (organization_id, seq desc);
create index organization_audit_log_time_idx on public.organization_audit_log (organization_id, created_at desc);
create index organization_audit_log_target_idx on public.organization_audit_log (organization_id, target_key, seq desc);
create index organization_audit_log_actor_idx on public.organization_audit_log (organization_id, actor_key, seq desc);

alter table public.organization_audit_log enable row level security;
revoke all on public.organization_audit_log from public, anon, authenticated;
grant select, insert, update, delete on public.organization_audit_log to service_role;

-- ---------------------------------------------------------------------------
-- 2. 追記専用の番人（版の番人 0004_pages.sql の forbid_revision_mutation と同じ形）
-- ---------------------------------------------------------------------------
-- db-contract: reviewed 新しい表にだけ掛ける番人。書き換えと削除を断るだけで、ほかの表と前の版のアプリには触らない
create function public.forbid_audit_log_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '監査の記録は追記専用です。書き換え・削除はできません';
end;
$$;

comment on function public.forbid_audit_log_mutation() is '監査の記録の書き換え・削除を拒否する番人。';

-- db-contract: reviewed 新しい表にだけ掛ける番人（上の関数）。サービスロールでも運営者の接続でも通さない
create trigger organization_audit_log_append_only
  before update or delete on public.organization_audit_log
  for each row execute function public.forbid_audit_log_mutation();

-- ---------------------------------------------------------------------------
-- 3. 人と対象の目印は保存先が作る（書く側が渡した値は使わない）
-- ---------------------------------------------------------------------------
-- db-contract: reviewed 新しい表にだけ掛ける番人。積む行の目印を、アドレスと対象から作り直すだけ
create function public.organization_audit_log_keys() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actor_key := case when new.actor_email is null then null
    else left(encode(sha256(convert_to(new.actor_email, 'UTF8')), 'hex'), 12) end;
  new.target_key := case when new.target_kind = 'person'
    then left(encode(sha256(convert_to(new.target, 'UTF8')), 'hex'), 12) else new.target end;
  return new;
end;
$$;

comment on function public.organization_audit_log_keys() is '監査の記録の人と対象の目印（sha256 の頭 12 桁）を積むときに作る番人。';

-- db-contract: reviewed 新しい表にだけ掛ける番人（上の関数）
create trigger organization_audit_log_keys
  before insert on public.organization_audit_log
  for each row execute function public.organization_audit_log_keys();

-- ---------------------------------------------------------------------------
-- 4. 自動参加で所属を作るときは、参加した記録も同じ取引で積む
-- ---------------------------------------------------------------------------
-- 中身は 20261009003947_organization_operations.sql の org_member_identity と同じ答え。違いは、自動参加の 1 行を実際に入れたとき
-- （同時に来た要求が先に入れていたら入れない）だけ、同じ関数の中で監査の記録を 1 行積むこと（アプリで後から積むと、記録が書けなかった
-- ときに次の要求からは「もう所属がある」になり、二度と積まれない）。前の版のアプリは org_member_identity を呼び続ける（消さない）。
-- db-contract: reviewed 新しい名前の関数を足すだけ。答えは org_member_identity と同じで、書くのは前と同じ自動参加の 1 行と、その記録の 1 行だけ
create function public.org_member_identity_audited(p_organization_id uuid, p_email text)
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
  inserted integer;
begin
  if p_organization_id is null or p_email is null or p_email <> lower(btrim(p_email)) then
    return jsonb_build_object('role', null, 'joined', false);
  end if;

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
  get diagnostics inserted = row_count;
  -- 参加した記録（監査の記録・台帳 lib/audit-actions.ts の member.joined）。誰が・対象とも本人、経路は自動参加のドメイン
  if inserted > 0 then
    insert into public.organization_audit_log (organization_id, actor_kind, actor_email, action, target_kind, target, change)
    values (p_organization_id, 'member', p_email, 'member.joined', 'person', p_email, jsonb_build_object('to', 'member', 'detail', 'domain'));
  end if;

  select m.role, m.status into found_role, found_status
    from public.organization_members m
   where m.organization_id = p_organization_id and m.email = p_email;
  return jsonb_build_object('role', case when found and found_status = 'active' then found_role end, 'joined', found);
end;
$$;

comment on function public.org_member_identity_audited(uuid, text) is
  '要求のたびに引く所属（役割）。自動参加で所属を作ったときは、参加した記録も同じ取引で積む（org_member_identity と同じ答え）。';

revoke all on function public.org_member_identity_audited(uuid, text) from public, anon, authenticated;
grant execute on function public.org_member_identity_audited(uuid, text) to service_role;
