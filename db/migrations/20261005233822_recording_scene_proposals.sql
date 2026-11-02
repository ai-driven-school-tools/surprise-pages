-- recording_scene_proposals: 1 本の録音の「場面の候補」（集まりが変わったところの見極めの結果）。足すだけの段。
--
-- 設計は docs/recordings-scene-split.md（段階 1・影の提案）。処理側が見極めた候補を Pages が鏡として持つ。
-- 録音の台帳（recordings）とは別の表に置き、書き込みは録音の行・その版（revision / service_revision）・
-- 受付の同期（sync_recording_service）のどれにも触れない。進み具合（recording_progress）と同じ作り。
-- 人が決めたこと（場面ごとの採用・結合・題の直し）は段階 2 で別の表に足す。ここは候補だけ。
--
-- 決まり（docs/db-migrations.md）
-- - 足す → 移す → 縮める の段を踏む。消す・名前を変える・NOT NULL を付けるは、別の PR に分ける（DB contract の関門が見る）
-- - 当てるのは CI（main に入るとステージングへ、本番は承認つきの実行で）。管理画面から手で当てない
create table public.recording_scene_proposals (
  recording_id uuid primary key references public.recordings(id),
  sequence bigint not null check (sequence > 0),
  proposal jsonb not null check (jsonb_typeof(proposal) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.recording_scene_proposals enable row level security;
revoke all on public.recording_scene_proposals from public, anon, authenticated;
grant select, insert, update, delete on public.recording_scene_proposals to service_role;

-- 処理側から届いた候補を 1 文で受ける。
--   found  … 録音があり、送ってきた持ち主のものか（偽なら窓口は「見つかりません」を返す）
--   stored … 今回の分を残したか。ごみ箱の録音と、持っている番号（sequence）以下の報告は、失敗にせず黙って捨てる
-- 受け取った時刻（updated_at）は必ず DB の時計で打つ。
create function public.report_recording_scenes(p_owner text, p_id uuid, p_proposal jsonb)
returns jsonb language sql security invoker set search_path = public as $$
  with target as (
    select id, deleted_at from public.recordings where id = p_id and owner_email = p_owner
  ), written as (
    insert into public.recording_scene_proposals as held (recording_id, sequence, proposal, updated_at)
    select id, (p_proposal->>'sequence')::bigint, p_proposal, now() from target where deleted_at is null
    on conflict (recording_id) do update
      set sequence = excluded.sequence, proposal = excluded.proposal, updated_at = now()
      where held.sequence < excluded.sequence
    returning 1
  )
  select jsonb_build_object('found', exists(select 1 from target), 'stored', exists(select 1 from written));
$$;
revoke all on function public.report_recording_scenes(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.report_recording_scenes(text, uuid, jsonb) to service_role;
