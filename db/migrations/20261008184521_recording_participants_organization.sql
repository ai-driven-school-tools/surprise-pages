-- recording_participants_organization: 参加者の 2 つの表（recording_participant_proposals・recording_participants）に組織の印を足す
-- （の決まり・docs/multi-organization.md）。足す → 移す の段。参加者の表は組織の印の移行（20261008170329）より
-- 前に作られたので、ここで同じ形にそろえる: 印の列・移す（最初の組織）・親と同じ組織の複合の外部キー・印の無い insert に親の印を写す番人・
-- 組織を引数に取る報告の関数。
--
-- 決まり（docs/db-migrations.md）
-- - 足す → 移す → 縮める の段を踏む。消す・名前を変える・NOT NULL を付けるは、別の PR に分ける（DB contract の関門が見る）
-- - 当てるのは CI（main に入るとステージングへ、本番は承認つきの実行で）。管理画面から手で当てない

alter table public.recording_participant_proposals add column organization_id uuid;
alter table public.recording_participants add column organization_id uuid;
comment on column public.recording_participant_proposals.organization_id is '組織の印（organizations.id）。親の録音と同じ組織';
comment on column public.recording_participants.organization_id is '組織の印（organizations.id）。親の録音と同じ組織';

-- 移す: いまある行は全部、最初の組織（最初の組織）
update public.recording_participant_proposals set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.recording_participants set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;

-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.recording_participant_proposals add constraint recording_participant_proposals_recording_organization_fkey foreign key (organization_id, recording_id) references public.recordings (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.recording_participants add constraint recording_participants_recording_organization_fkey foreign key (organization_id, recording_id) references public.recordings (organization_id, id);

-- 組織で絞った口の upsert が重複を見分ける鍵（organization_id を含める）。主キー (recording_id, key) は縮める段で入れ替える
create unique index recording_participants_organization_key on public.recording_participants (organization_id, recording_id, key);

-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger recording_participant_proposals_fill_organization before insert on public.recording_participant_proposals for each row execute function public.fill_organization_id('recordings', 'recording_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger recording_participants_fill_organization before insert on public.recording_participants for each row execute function public.fill_organization_id('recordings', 'recording_id');

-- 処理側から届いた候補を、組織の中で受ける（report_recording_participants の組織つきの形。古いほうは呼ばない）。
--   found  … 録音があり、送ってきた持ち主のものか（偽なら窓口は「見つかりません」を返す）
--   stored … 今回の分を残したか。ごみ箱の録音と、持っている番号（sequence）以下の報告は、失敗にせず黙って捨てる
create function public.org_report_recording_participants(p_organization_id uuid, p_owner text, p_id uuid, p_proposal jsonb)
returns jsonb language sql security invoker set search_path = public as $$
  with target as (
    select id, deleted_at from public.recordings where organization_id = p_organization_id and id = p_id and owner_email = p_owner
  ), written as (
    insert into public.recording_participant_proposals as held (organization_id, recording_id, sequence, proposal, updated_at)
    select p_organization_id, id, (p_proposal->>'sequence')::bigint, p_proposal, now() from target where deleted_at is null
    on conflict (recording_id) do update
      set sequence = excluded.sequence, proposal = excluded.proposal, updated_at = now()
      where held.sequence < excluded.sequence and held.organization_id = p_organization_id
    returning 1
  )
  select jsonb_build_object('found', exists(select 1 from target), 'stored', exists(select 1 from written));
$$;
revoke all on function public.org_report_recording_participants(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.org_report_recording_participants(uuid, text, uuid, jsonb) to service_role;
