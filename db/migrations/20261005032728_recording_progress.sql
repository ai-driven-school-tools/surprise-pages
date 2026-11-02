-- 録音の処理の進み具合（いまの工程・何本目か・各工程の時刻・使うモデル）。足すだけの段。
-- 録音の台帳（recordings）とは別の表に置く。進み具合の書き込みは、録音の行・その版（revision / service_revision）・
-- 受付の同期（sync_recording_service）のどれにも触れない。ブラウザのDB接続は許可しない。
create table public.recording_progress (
  recording_id uuid primary key references public.recordings(id),
  sequence bigint not null check (sequence > 0),
  progress jsonb not null check (jsonb_typeof(progress) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.recording_progress enable row level security;
revoke all on public.recording_progress from public, anon, authenticated;
grant select, insert, update, delete on public.recording_progress to service_role;

-- 専用サービスから届いた進み具合を 1 文で受ける。
--   found  … 録音があり、送ってきた持ち主のものか（偽なら窓口は「見つかりません」を返す）
--   stored … 今回の分を残したか。ごみ箱の録音と、持っている番号（sequence）以下の報告は、失敗にせず黙って捨てる
-- 受け取った時刻（updated_at）は必ずDBの時計で打つ。
create function public.report_recording_progress(p_owner text, p_id uuid, p_progress jsonb)
returns jsonb language sql security invoker set search_path = public as $$
  with target as (
    select id, deleted_at from public.recordings where id = p_id and owner_email = p_owner
  ), written as (
    insert into public.recording_progress as held (recording_id, sequence, progress, updated_at)
    select id, (p_progress->>'sequence')::bigint, p_progress, now() from target where deleted_at is null
    on conflict (recording_id) do update
      set sequence = excluded.sequence, progress = excluded.progress, updated_at = now()
      where held.sequence < excluded.sequence
    returning 1
  )
  select jsonb_build_object('found', exists(select 1 from target), 'stored', exists(select 1 from written));
$$;
revoke all on function public.report_recording_progress(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.report_recording_progress(text, uuid, jsonb) to service_role;
