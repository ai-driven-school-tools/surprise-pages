-- organization_lifecycle: 組織のデータを丸ごと書き出す・組織を解約して 30 日の猶予のあと物理削除する（複数組織対応の C3）。
-- 設計の正本は docs/multi-organization.md の「書き出しと解約」、削除の手順と番人の扱いは docs/operations.md の「組織の物理削除」。
--
-- 1. organizations.deletion_scheduled_at … 解約したときに「この時刻を過ぎたら消す」を置く（解約は止めると同じ status = 'suspended' と一緒に立てる）。
--    取り消すと空に戻す。空の組織は絶対に消えない
-- 2. organization_exports … 書き出しの進み具合（準備中 → 用意できた / 失敗）。zip は素材の置き場の組織の頭の下 `_exports/` に置く
-- 3. org_purge_organization … 猶予を過ぎた組織の行を 1 段ずつ消す（子の表 → 版 → ページ → 名簿 → 記録 → 組織）。
--    追記専用の番人（版・監査の記録）と、凍った表の番人（録音の成果物）・最後の持ち主の番人は、この関数の取引の中でだけ外して戻す
--
-- 決まり（docs/db-migrations.md）
-- - 足す → 移す → 縮める の段を踏む。この移行は「足す」だけ（列と表と関数を足す。既存の列・関数・番人は書き換えない・消さない）
-- - 前の版のアプリは新しい列も表も関数も読まない（解約の印が空の組織は今までと何も変わらない）
-- - 当てるのは CI（main に入るとステージングへ、本番は承認つきの実行で）。管理画面から手で当てない

-- ---------------------------------------------------------------------------
-- 1. 解約の予定
-- ---------------------------------------------------------------------------
alter table public.organizations add column deletion_scheduled_at timestamptz;

comment on column public.organizations.deletion_scheduled_at is
  '解約した組織を物理削除してよい時刻（解約した時刻 + 30 日・lib/plans.ts の ORGANIZATION_DELETION_GRACE_DAYS）。空なら消えない。解約は status = suspended と一緒に立て、取り消すと空に戻す。';

-- 夜間の削除が「猶予を過ぎた組織」を引くための索引（解約した組織だけ）
create index organizations_deletion_due_idx on public.organizations (deletion_scheduled_at) where deletion_scheduled_at is not null;

-- ---------------------------------------------------------------------------
-- 2. 書き出しの進み具合
-- ---------------------------------------------------------------------------
create table public.organization_exports (
  id uuid primary key default gen_random_uuid(),
  -- 組織に属する表（lib/tenant-tables.json の organization）。読み書きは組織で絞った口（orgDb）だけ
  organization_id uuid not null references public.organizations(id),
  -- 頼んだ持ち主（そろえたアドレス）
  requested_by text not null check (requested_by = lower(btrim(requested_by)) and requested_by like '%_@_%'),
  status text not null default 'preparing' check (status in ('preparing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  -- 用意できた時刻（リンクの 24 時間はここから数える）
  completed_at timestamptz,
  -- zip の置き場（素材の置き場の組織の頭 + `_exports/<目印>.zip`）。鍵は画面にも応答にも出さない
  blob_key text check (blob_key is null or (char_length(blob_key) <= 200 and blob_key ~ '_exports/[0-9a-f-]{36}\.zip$')),
  byte_size bigint check (byte_size is null or byte_size >= 0),
  -- 中身の数（版・素材・コメント）。画面の 1 行に出す
  counts jsonb not null default '{}'::jsonb check (jsonb_typeof(counts) = 'object' and octet_length(counts::text) <= 500),
  constraint organization_exports_ready check (status <> 'ready' or (completed_at is not null and blob_key is not null and byte_size is not null))
);

comment on table public.organization_exports is
  '組織のデータの書き出し（zip）の進み具合。zip は素材の置き場の組織の頭の下 _exports/ に置き、受け取りは持ち主だけ・署名つき・24 時間（app/api/organization/export/[id]）。';

create index organization_exports_organization_idx on public.organization_exports (organization_id, created_at desc);
-- 準備中は組織に 1 行だけ（同時に 2 回押しても 2 つ組まない。古くなった準備中は頼む口が失敗にしてから置く）
create unique index organization_exports_one_preparing on public.organization_exports (organization_id) where status = 'preparing';
-- 組織 × 目印で引く（組織で絞った口が組織の条件を付ける）
create unique index organization_exports_organization_id_key on public.organization_exports (organization_id, id);

alter table public.organization_exports enable row level security;
revoke all on public.organization_exports from public, anon, authenticated;
grant select, insert, update, delete on public.organization_exports to service_role;

-- ---------------------------------------------------------------------------
-- 3. 猶予を過ぎた組織の物理削除（夜間の処理が 1 組織ずつ・1 段ずつ呼ぶ）
-- ---------------------------------------------------------------------------
-- 段（p_step）と消す表:
--   children      … ページ・録音・まとまり・鍵・設定などの子の表（版とページを除く組織に属する表の全部）。録音の成果物の凍った表の番人をこの取引の中でだけ外す
--   revisions     … 版（page_revisions）。追記専用の番人 page_revisions_append_only をこの取引の中でだけ外す
--   pages         … ページ
--   members       … 所属の名簿・ドメイン・独自ドメイン・連携・依頼・書き出しの記録・使用量。最後の持ち主の番人をこの取引の中でだけ外す
--   audit         … 監査の記録。追記専用の番人 organization_audit_log_append_only をこの取引の中でだけ外す
--   organization  … 組織の行そのもの
-- 1 回の呼び出しで消すのは段の中で合わせて p_limit 行まで（表の並びの順に、親を指す子から先に）。呼ぶ側は答えが 0 になるまで同じ段を呼び直す
-- （大きい組織でも 1 回の取引を短く保ち、保存先の文の時間の上限で切れない・番人を外している時間を短くする）。親子のある表（コメントの返信・画像の派生）は
-- 子を持たない行から消す（親は次の呼び出しで消える）。
-- どの段も、組織が「止めてあり・解約の予定があり・その時刻を過ぎている・最初の組織ではない」ときだけ動く（それ以外は 1 行も消さずに断る）。
-- どの段も何度呼んでも同じ（消し終えた段は 0 行）。途中で失敗したら、次の夜に頭から呼び直せば続きから消える。
-- 番人を外すのは `alter table … disable trigger`（表の持ち主の権限・この関数は持ち主の権限で動く）。取引が終わる前に必ず戻し、
-- 失敗したら取引ごと戻る（外れたままにならない）。外している間（1 回の呼び出しの取引の間だけ）、その表へのほかの書き込みを待たせる（読みは止めない）。
-- 答えは消した行の数。
-- db-contract: reviewed 新しい名前の関数を足すだけ。消すのは猶予を過ぎた解約済みの 1 組織の行だけで、最初の組織とほかの組織の行には触らない。番人を外すのは同じ取引の中だけで、終わる前に戻す（手順は docs/operations.md の「組織の物理削除」）
create function public.org_purge_organization(p_organization_id uuid, p_step text, p_limit integer)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  removed bigint := 0;
  budget bigint;
  n bigint;
begin
  if p_organization_id is null or p_organization_id = '00000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'purge_refused' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100000 then
    raise exception 'purge_limit_invalid' using errcode = '22023';
  end if;
  budget := p_limit;
  -- 猶予を過ぎた解約済みの組織だけ（行を確かめている間に取り消されないよう、組織の行を押さえる）
  perform 1 from public.organizations o
   where o.id = p_organization_id and o.status = 'suspended'
     and o.deletion_scheduled_at is not null and o.deletion_scheduled_at <= now()
   for update;
  if not found then
    -- 組織の行がもう無い（最後の段まで済んだ）なら、何もしない（何度呼んでも同じ）
    if not exists (select 1 from public.organizations o where o.id = p_organization_id) then
      return 0;
    end if;
    raise exception 'purge_refused' using errcode = '42501';
  end if;

  if p_step = 'children' then
    alter table public.recording_artifacts disable trigger recording_artifact_frozen;
    alter table public.recording_generation_inputs disable trigger recording_inputs_frozen;
    if budget > 0 then
      delete from public.deck_image_uses where ctid in (select t.ctid from public.deck_image_uses t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.deck_theme_requests where ctid in (select t.ctid from public.deck_theme_requests t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.group_members where ctid in (select t.ctid from public.group_members t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.page_permissions where ctid in (select t.ctid from public.page_permissions t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.recording_artifacts where ctid in (select t.ctid from public.recording_artifacts t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.recording_events where ctid in (select t.ctid from public.recording_events t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.recording_generation_inputs where ctid in (select t.ctid from public.recording_generation_inputs t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.recording_commands where ctid in (select t.ctid from public.recording_commands t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.recording_grants where ctid in (select t.ctid from public.recording_grants t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.recording_participant_proposals where ctid in (select t.ctid from public.recording_participant_proposals t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.recording_participants where ctid in (select t.ctid from public.recording_participants t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.recording_progress where ctid in (select t.ctid from public.recording_progress t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.recording_scene_proposals where ctid in (select t.ctid from public.recording_scene_proposals t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.recording_scenes where ctid in (select t.ctid from public.recording_scenes t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.deck_edit_receipts where ctid in (select t.ctid from public.deck_edit_receipts t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.repository_comments where ctid in (select t.ctid from public.repository_comments t where t.organization_id = p_organization_id and not exists (select 1 from public.repository_comments c where c.parent_id = t.id) limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.repository_document_views where ctid in (select t.ctid from public.repository_document_views t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.deck_image_assets where ctid in (select t.ctid from public.deck_image_assets t where t.organization_id = p_organization_id and not exists (select 1 from public.deck_image_assets c where c.parent_id = t.id) limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.deck_theme_versions where ctid in (select t.ctid from public.deck_theme_versions t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.deck_my_themes where ctid in (select t.ctid from public.deck_my_themes t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.groups where ctid in (select t.ctid from public.groups t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.recording_generations where ctid in (select t.ctid from public.recording_generations t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.recordings where ctid in (select t.ctid from public.recordings t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.access_requests where ctid in (select t.ctid from public.access_requests t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.deck_collaboration_events where ctid in (select t.ctid from public.deck_collaboration_events t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.deck_collaboration_rooms where ctid in (select t.ctid from public.deck_collaboration_rooms t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.deck_edit_processors where ctid in (select t.ctid from public.deck_edit_processors t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.deck_edit_sessions where ctid in (select t.ctid from public.deck_edit_sessions t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.deck_edit_submissions where ctid in (select t.ctid from public.deck_edit_submissions t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.deck_media_jobs where ctid in (select t.ctid from public.deck_media_jobs t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.page_catalog where ctid in (select t.ctid from public.page_catalog t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.page_comments where ctid in (select t.ctid from public.page_comments t where t.organization_id = p_organization_id and not exists (select 1 from public.page_comments c where c.parent_id = t.id) limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.page_edit_drafts where ctid in (select t.ctid from public.page_edit_drafts t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.page_favorites where ctid in (select t.ctid from public.page_favorites t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.page_views where ctid in (select t.ctid from public.page_views t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.app_login_codes where ctid in (select t.ctid from public.app_login_codes t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.beta_feature_optins where ctid in (select t.ctid from public.beta_feature_optins t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.cli_login_pending where ctid in (select t.ctid from public.cli_login_pending t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.deck_image_search_usage where ctid in (select t.ctid from public.deck_image_search_usage t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.inbox_reads where ctid in (select t.ctid from public.inbox_reads t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.page_view_optouts where ctid in (select t.ctid from public.page_view_optouts t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.publish_tokens where ctid in (select t.ctid from public.publish_tokens t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.recording_ai_settings where ctid in (select t.ctid from public.recording_ai_settings t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.recording_calendar_connections where ctid in (select t.ctid from public.recording_calendar_connections t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.recording_calendar_controls where ctid in (select t.ctid from public.recording_calendar_controls t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.recording_calendar_pending where ctid in (select t.ctid from public.recording_calendar_pending t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.recording_github_connections where ctid in (select t.ctid from public.recording_github_connections t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.recording_github_controls where ctid in (select t.ctid from public.recording_github_controls t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.recording_github_pending where ctid in (select t.ctid from public.recording_github_pending t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.recording_repository_catalog where ctid in (select t.ctid from public.recording_repository_catalog t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.organization_invitations where ctid in (select t.ctid from public.organization_invitations t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.organization_secret_checks where ctid in (select t.ctid from public.organization_secret_checks t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.organization_secrets where ctid in (select t.ctid from public.organization_secrets t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.organization_ai_usage where ctid in (select t.ctid from public.organization_ai_usage t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.terms_acceptances where ctid in (select t.ctid from public.terms_acceptances t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    alter table public.recording_generation_inputs enable trigger recording_inputs_frozen;
    alter table public.recording_artifacts enable trigger recording_artifact_frozen;
  elsif p_step = 'revisions' then
    alter table public.page_revisions disable trigger page_revisions_append_only;
    if budget > 0 then
      delete from public.page_revisions where ctid in (select t.ctid from public.page_revisions t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    alter table public.page_revisions enable trigger page_revisions_append_only;
  elsif p_step = 'pages' then
    if budget > 0 then
      delete from public.pages where ctid in (select t.ctid from public.pages t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
  elsif p_step = 'members' then
    alter table public.organization_members disable trigger organization_members_keep_manager;
    if budget > 0 then
      delete from public.organization_members where ctid in (select t.ctid from public.organization_members t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.organization_domains where ctid in (select t.ctid from public.organization_domains t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.organization_domains_custom where ctid in (select t.ctid from public.organization_domains_custom t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.organization_slack_connections where ctid in (select t.ctid from public.organization_slack_connections t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.organization_github_installations where ctid in (select t.ctid from public.organization_github_installations t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.organization_requests where ctid in (select t.ctid from public.organization_requests t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.organization_exports where ctid in (select t.ctid from public.organization_exports t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    if budget > 0 then
      delete from public.organization_usage where ctid in (select t.ctid from public.organization_usage t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    alter table public.organization_members enable trigger organization_members_keep_manager;
  elsif p_step = 'audit' then
    alter table public.organization_audit_log disable trigger organization_audit_log_append_only;
    if budget > 0 then
      delete from public.organization_audit_log where ctid in (select t.ctid from public.organization_audit_log t where t.organization_id = p_organization_id limit budget);
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
    alter table public.organization_audit_log enable trigger organization_audit_log_append_only;
  elsif p_step = 'organization' then
    if budget > 0 then
      delete from public.organizations o where o.id = p_organization_id;
      get diagnostics n = row_count; removed := removed + n; budget := budget - n;
    end if;
  else
    raise exception 'purge_step_unknown' using errcode = '22023';
  end if;
  return removed;
end;
$$;

comment on function public.org_purge_organization(uuid, text, integer) is
  '猶予を過ぎた解約済みの組織の行を、段ごとに 1 回 p_limit 行まで物理削除する（children → revisions → pages → members → audit → organization・答えが 0 になるまで呼び直す）。最初の組織・猶予前・解約していない組織は断る。追記専用と凍った表の番人はこの取引の中でだけ外す。';

revoke all on function public.org_purge_organization(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.org_purge_organization(uuid, text, integer) to service_role;
