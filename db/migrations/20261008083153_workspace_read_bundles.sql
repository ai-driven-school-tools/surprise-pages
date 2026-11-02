-- workspace_read_bundles: 一覧の画面を開くたびに順番に待っていた問い合わせを、それぞれ 1 回で読む関数を足す（足すだけ）。
--
-- 本番の保存先は HTTP の受け口経由で、1 回の問い合わせに 60ms ほどかかる。名簿の材料は「入っているまとまり → まとまりが
-- 生きているか → 許可」、議事録の材料は「成果物 → つながり → 録音」と、それぞれ 3 回ずつ順番に待っていた（docs/app-speed.md）。
-- ここの関数は**判定しない**。今までと同じ条件で同じ行を返すだけで、見てよいかはこれまでどおりアプリ
-- （lib/access-gates.ts の visiblePagesFor・lib/recording-store.ts の readableRecordingPageIds）が決める。
-- 呼ぶ人の権限で動く（security invoker）。行の見え方の決まりも表を直に読むときと同じ。
--
-- 決まり（docs/db-migrations.md）
-- - 足す → 移す → 縮める の段を踏む。消す・名前を変える・NOT NULL を付けるは、別の PR に分ける（DB contract の関門が見る）
-- - 当てるのは CI（main に入るとステージングへ、本番は承認つきの実行で）。管理画面から手で当てない
-- - 関数が無い保存先（当てる前）では、アプリは今までどおり 1 つずつ読む（呼んで失敗したら元の読み方に戻る）

-- その人に出ている許可の全部（個人あて・生きているまとまり経由）。p_email は呼ぶ側が小文字にそろえて渡す
-- （lib/access-rows.ts の normalize）。今までの読み方と同じ条件:
--   個人あて   … grantee_kind = 'member' かつ member_email が本人
--   まとまり   … grantee_kind = 'group' かつ、本人が入っていて、消していないまとまり
create function public.member_page_grants(p_email text)
returns table (page_id uuid, role text, added_at timestamptz, via_group boolean)
language sql stable security invoker set search_path = public as $$
  select p.page_id, p.role, p.added_at, false
    from public.page_permissions p
   where p.grantee_kind = 'member' and p.member_email = p_email
  union all
  select p.page_id, p.role, p.added_at, true
    from public.page_permissions p
    join public.group_members m on m.group_id = p.group_id and m.member_email = p_email
    join public.groups g on g.id = m.group_id and g.deleted_at is null
   where p.grantee_kind = 'group'
$$;
revoke all on function public.member_page_grants(text) from public, anon, authenticated;
grant execute on function public.member_page_grants(text) to service_role;

-- 議事録の材料。成果物 1 つにつき、元の録音 1 本ごとに 1 行（つながりが無ければ録音の欄は空の 1 行）。
-- p_page_ids を渡せばそのページの分、空（null）なら生きている録音の保護つきのページの全部
-- （一覧はページの一覧を待たずに、同時に読むため）。録音の欄は lib/recording-store.ts の recordColumns と同じ項目。
create function public.recording_page_sources(p_page_ids uuid[] default null)
returns table (page_id uuid, generation_id uuid, kind text, basis text, repositories jsonb, recording_id uuid, recording jsonb)
language sql stable security invoker set search_path = public as $$
  select a.page_id, a.generation_id, a.kind, a.basis, a.repositories, i.recording_id,
         case when r.id is null then null else jsonb_build_object(
           'id', r.id, 'owner_email', r.owner_email, 'title', r.title, 'source_kind', r.source_kind,
           'upload_device_id', r.upload_device_id, 'upload_device_label', r.upload_device_label,
           'recorded_at', r.recorded_at, 'recorded_at_confidence', r.recorded_at_confidence, 'recording_device', r.recording_device,
           'created_at', r.created_at, 'accepted_at', r.accepted_at, 'deleted_at', r.deleted_at,
           'duration_seconds', r.duration_seconds, 'transcript_characters', r.transcript_characters, 'byte_size', r.byte_size,
           'sha256', r.sha256, 'state', r.state, 'waiting_reason', r.waiting_reason, 'revision', r.revision) end
    from public.recording_artifacts a
    left join public.recording_generation_inputs i on i.generation_id = a.generation_id
    left join public.recordings r on r.id = i.recording_id
   where (p_page_ids is not null and a.page_id = any(p_page_ids))
      or (p_page_ids is null and exists (
            select 1 from public.pages pg where pg.id = a.page_id and pg.recording_protected and pg.deleted_at is null))
$$;
revoke all on function public.recording_page_sources(uuid[]) from public, anon, authenticated;
grant execute on function public.recording_page_sources(uuid[]) to service_role;
