-- organization_scope: 組織に属する表に組織の印（organization_id）を足し、最初の組織 の組織で埋める。読み書きを組織で絞る
-- 保存先の関数（org_ で始まる新しい名前）と、親子を組織で縛る外部キーを足す（複数組織対応の A2）。
-- 設計の正本は docs/multi-organization.md、どの表が組織に属するかの正本は lib/tenant-tables.json。
--
-- 足す → 移す まで。全体で一意の古い索引（pages.page_slug・groups の名前）と NOT NULL は**触らない**（縮めるは別の PR）。
-- 古い関数（page_access_facts ほか）も消さない。新しい版のアプリは org_ の関数を呼び、前の版は古い関数を呼び続ける。
--
-- 列の既定値（DEFAULT）は付けない。組織の印を渡し忘れた書き込みが黙って 最初の組織 の行になるのを防ぐため。
-- その代わり、印の無い insert（前の版のアプリ・まだ組織を受け取らない保存先の関数）には「印を写す番人」を付ける:
--   - 親の行（ページ・録音・まとまり・画像）があれば、親の組織を写す（どの組織の数でも正しい）
--   - 親の無い行は、組織が 1 つしかない間だけ、その組織（最初の組織の目印）にする。2 つ目の組織ができたら写さない
--     （印の無い行は、組織で絞った口からは誰にも見えない＝別の組織に見えることは無い）
-- 番人は「縮める」段（NOT NULL を付ける PR）で外す。それまでに、組織を受け取らない関数（台帳の keyed）を減らす。

-- ---------------------------------------------------------------------------
-- 1. 組織の印の列を足す（null 許容・既定値なし）
-- ---------------------------------------------------------------------------
alter table public.pages add column organization_id uuid;
alter table public.page_revisions add column organization_id uuid;
alter table public.page_comments add column organization_id uuid;
alter table public.publish_tokens add column organization_id uuid;
alter table public.groups add column organization_id uuid;
alter table public.group_members add column organization_id uuid;
alter table public.page_permissions add column organization_id uuid;
alter table public.access_requests add column organization_id uuid;
alter table public.page_views add column organization_id uuid;
alter table public.page_view_optouts add column organization_id uuid;
alter table public.page_favorites add column organization_id uuid;
alter table public.page_catalog add column organization_id uuid;
alter table public.page_edit_drafts add column organization_id uuid;
alter table public.inbox_reads add column organization_id uuid;
alter table public.beta_feature_optins add column organization_id uuid;
alter table public.cli_login_pending add column organization_id uuid;
alter table public.app_login_codes add column organization_id uuid;
alter table public.deck_edit_sessions add column organization_id uuid;
alter table public.deck_edit_submissions add column organization_id uuid;
alter table public.deck_edit_processors add column organization_id uuid;
alter table public.deck_edit_receipts add column organization_id uuid;
alter table public.deck_collaboration_rooms add column organization_id uuid;
alter table public.deck_collaboration_events add column organization_id uuid;
alter table public.deck_media_jobs add column organization_id uuid;
alter table public.deck_image_assets add column organization_id uuid;
alter table public.deck_image_uses add column organization_id uuid;
alter table public.deck_image_search_usage add column organization_id uuid;
alter table public.deck_my_themes add column organization_id uuid;
alter table public.deck_theme_versions add column organization_id uuid;
alter table public.deck_theme_requests add column organization_id uuid;
alter table public.recordings add column organization_id uuid;
alter table public.recording_grants add column organization_id uuid;
alter table public.recording_generations add column organization_id uuid;
alter table public.recording_generation_inputs add column organization_id uuid;
alter table public.recording_artifacts add column organization_id uuid;
alter table public.recording_events add column organization_id uuid;
alter table public.recording_commands add column organization_id uuid;
alter table public.recording_progress add column organization_id uuid;
alter table public.recording_scene_proposals add column organization_id uuid;
alter table public.recording_scenes add column organization_id uuid;
alter table public.recording_ai_settings add column organization_id uuid;
alter table public.recording_github_connections add column organization_id uuid;
alter table public.recording_github_pending add column organization_id uuid;
alter table public.recording_github_controls add column organization_id uuid;
alter table public.recording_calendar_connections add column organization_id uuid;
alter table public.recording_calendar_pending add column organization_id uuid;
alter table public.recording_calendar_controls add column organization_id uuid;
alter table public.recording_repository_catalog add column organization_id uuid;
alter table public.repository_comments add column organization_id uuid;
alter table public.repository_document_views add column organization_id uuid;
comment on column public.pages.organization_id is '組織の印（organizations.id）。ページの呼び名は組織の中で一意';

-- コメントとページの結び。呼び名の文字列（page_slug）は残す（道具箱の札・CLI・API v1 が使う）
alter table public.page_comments add column page_id uuid;

-- ---------------------------------------------------------------------------
-- 2. 移す: 既存の行を 最初の組織 の組織で埋める（配布版の設置でも同じ目印を使う。配布版をどう表すかは A4）
-- ---------------------------------------------------------------------------
update public.pages set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
-- db-contract: reviewed 移す段の間だけ番人を止める（同じ取引の中で戻す。本文・版の中身には触らず、組織の印だけを埋める）
alter table public.page_revisions disable trigger page_revisions_append_only;
update public.page_revisions set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
-- db-contract: reviewed 止めた番人を同じ取引の中で戻す
alter table public.page_revisions enable trigger page_revisions_append_only;
update public.page_comments set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.publish_tokens set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
-- db-contract: reviewed 移す段の間だけ番人を止める（同じ取引の中で戻す。本文・版の中身には触らず、組織の印だけを埋める）
alter table public.groups disable trigger groups_collaboration_audience;
update public.groups set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
-- db-contract: reviewed 止めた番人を同じ取引の中で戻す
alter table public.groups enable trigger groups_collaboration_audience;
-- db-contract: reviewed 移す段の間だけ番人を止める（同じ取引の中で戻す。本文・版の中身には触らず、組織の印だけを埋める）
alter table public.group_members disable trigger members_collaboration_audience;
update public.group_members set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
-- db-contract: reviewed 止めた番人を同じ取引の中で戻す
alter table public.group_members enable trigger members_collaboration_audience;
-- db-contract: reviewed 移す段の間だけ番人を止める（同じ取引の中で戻す。本文・版の中身には触らず、組織の印だけを埋める）
alter table public.page_permissions disable trigger permissions_collaboration_audience;
update public.page_permissions set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
-- db-contract: reviewed 止めた番人を同じ取引の中で戻す
alter table public.page_permissions enable trigger permissions_collaboration_audience;
update public.access_requests set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.page_views set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.page_view_optouts set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.page_favorites set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.page_catalog set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.page_edit_drafts set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.inbox_reads set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.beta_feature_optins set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.cli_login_pending set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.app_login_codes set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.deck_edit_sessions set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.deck_edit_submissions set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.deck_edit_processors set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.deck_edit_receipts set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.deck_collaboration_rooms set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.deck_collaboration_events set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.deck_media_jobs set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.deck_image_assets set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.deck_image_uses set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.deck_image_search_usage set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.deck_my_themes set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.deck_theme_versions set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.deck_theme_requests set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.recordings set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.recording_grants set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.recording_generations set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
-- db-contract: reviewed 移す段の間だけ番人を止める（同じ取引の中で戻す。本文・版の中身には触らず、組織の印だけを埋める）
alter table public.recording_generation_inputs disable trigger recording_inputs_frozen;
update public.recording_generation_inputs set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
-- db-contract: reviewed 止めた番人を同じ取引の中で戻す
alter table public.recording_generation_inputs enable trigger recording_inputs_frozen;
-- db-contract: reviewed 移す段の間だけ番人を止める（同じ取引の中で戻す。本文・版の中身には触らず、組織の印だけを埋める）
alter table public.recording_artifacts disable trigger recording_artifact_frozen;
-- db-contract: reviewed 移す段の間だけ番人を止める（同じ取引の中で戻す。本文・版の中身には触らず、組織の印だけを埋める）
alter table public.recording_artifacts disable trigger recording_artifact_guard;
update public.recording_artifacts set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
-- db-contract: reviewed 止めた番人を同じ取引の中で戻す
alter table public.recording_artifacts enable trigger recording_artifact_frozen;
-- db-contract: reviewed 止めた番人を同じ取引の中で戻す
alter table public.recording_artifacts enable trigger recording_artifact_guard;
update public.recording_events set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.recording_commands set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.recording_progress set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.recording_scene_proposals set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.recording_scenes set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.recording_ai_settings set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.recording_github_connections set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.recording_github_pending set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.recording_github_controls set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.recording_calendar_connections set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.recording_calendar_pending set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.recording_calendar_controls set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.recording_repository_catalog set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.repository_comments set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.repository_document_views set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.page_comments c set page_id = p.id from public.pages p where p.page_slug = c.page_slug and c.page_id is null;

-- ---------------------------------------------------------------------------
-- 3. 組織の中で一意（全体で一意の古い索引は縮める段で外す）
-- ---------------------------------------------------------------------------
create unique index pages_organization_id_key on public.pages (organization_id, id);
create unique index pages_organization_slug_key on public.pages (organization_id, page_slug);
create unique index groups_organization_id_key on public.groups (organization_id, id);
create unique index groups_organization_alive_name_key on public.groups (organization_id, lower(name)) where deleted_at is null;
create unique index recordings_organization_id_key on public.recordings (organization_id, id);
create unique index deck_image_assets_organization_id_key on public.deck_image_assets (organization_id, id);
create unique index page_view_optouts_organization_key on public.page_view_optouts (organization_id, viewer_email);
create unique index inbox_reads_organization_key on public.inbox_reads (organization_id, viewer_email);
create unique index beta_feature_optins_organization_key on public.beta_feature_optins (organization_id, owner_email, feature);
create unique index page_favorites_organization_key on public.page_favorites (organization_id, owner_email, page_id);
create unique index page_catalog_organization_key on public.page_catalog (organization_id, page_id, version_id, classifier_version);
create unique index deck_image_search_usage_organization_key on public.deck_image_search_usage (organization_id, usage_day, owner_email);
create unique index repository_document_views_organization_key on public.repository_document_views (organization_id, document_id, viewer_email);
create index page_comments_organization_page_idx on public.page_comments (organization_id, page_id);

-- ---------------------------------------------------------------------------
-- 4. 親子を組織で縛る: 子の (organization_id, 親の目印) は、同じ組織の親しか指せない
--    印が空の行（前の版の書き込み）は、外部キーの決まり（MATCH SIMPLE）で確かめない＝前の版を弾かない
-- ---------------------------------------------------------------------------
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.page_revisions add constraint page_revisions_page_organization_fkey foreign key (organization_id, page_id) references public.pages (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.page_permissions add constraint page_permissions_page_organization_fkey foreign key (organization_id, page_id) references public.pages (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.access_requests add constraint access_requests_page_organization_fkey foreign key (organization_id, page_id) references public.pages (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.page_views add constraint page_views_page_organization_fkey foreign key (organization_id, page_id) references public.pages (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.page_favorites add constraint page_favorites_page_organization_fkey foreign key (organization_id, page_id) references public.pages (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.page_catalog add constraint page_catalog_page_organization_fkey foreign key (organization_id, page_id) references public.pages (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.page_edit_drafts add constraint page_edit_drafts_page_organization_fkey foreign key (organization_id, page_id) references public.pages (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.deck_edit_sessions add constraint deck_edit_sessions_page_organization_fkey foreign key (organization_id, page_id) references public.pages (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.deck_edit_submissions add constraint deck_edit_submissions_page_organization_fkey foreign key (organization_id, page_id) references public.pages (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.deck_edit_processors add constraint deck_edit_processors_page_organization_fkey foreign key (organization_id, page_id) references public.pages (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.deck_edit_receipts add constraint deck_edit_receipts_page_organization_fkey foreign key (organization_id, page_id) references public.pages (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.deck_collaboration_rooms add constraint deck_collaboration_rooms_page_organization_fkey foreign key (organization_id, page_id) references public.pages (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.deck_collaboration_events add constraint deck_collaboration_events_page_organization_fkey foreign key (organization_id, page_id) references public.pages (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.deck_media_jobs add constraint deck_media_jobs_page_organization_fkey foreign key (organization_id, page_id) references public.pages (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.deck_image_assets add constraint deck_image_assets_page_organization_fkey foreign key (organization_id, page_id) references public.pages (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.recording_artifacts add constraint recording_artifacts_page_organization_fkey foreign key (organization_id, page_id) references public.pages (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.recording_grants add constraint recording_grants_recording_organization_fkey foreign key (organization_id, recording_id) references public.recordings (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.recording_generation_inputs add constraint recording_generation_inputs_recording_organization_fkey foreign key (organization_id, recording_id) references public.recordings (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.recording_events add constraint recording_events_recording_organization_fkey foreign key (organization_id, recording_id) references public.recordings (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.recording_commands add constraint recording_commands_recording_organization_fkey foreign key (organization_id, recording_id) references public.recordings (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.recording_progress add constraint recording_progress_recording_organization_fkey foreign key (organization_id, recording_id) references public.recordings (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.recording_scene_proposals add constraint recording_scene_proposals_recording_organization_fkey foreign key (organization_id, recording_id) references public.recordings (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.recording_scenes add constraint recording_scenes_recording_organization_fkey foreign key (organization_id, recording_id) references public.recordings (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.group_members add constraint group_members_group_organization_fkey foreign key (organization_id, group_id) references public.groups (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.deck_image_uses add constraint deck_image_uses_asset_organization_fkey foreign key (organization_id, asset_id) references public.deck_image_assets (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.page_comments add constraint page_comments_page_organization_fkey foreign key (organization_id, page_id) references public.pages (organization_id, id);
-- db-contract: reviewed 移す段で親と同じ組織の印を埋めたので既存の行は通る。前の版の書き込みは印が空で確かめられない（MATCH SIMPLE）
alter table public.page_permissions add constraint page_permissions_group_organization_fkey foreign key (organization_id, group_id) references public.groups (organization_id, id);

-- ---------------------------------------------------------------------------
-- 5. 印を写す番人（insert で印が空のときだけ動く。縮める段で外す）
-- ---------------------------------------------------------------------------
-- 親の無い行に写すのは、組織が 1 つしかない間だけ。配布版の設置（組織の行が無い）も「1 つ」と数える
create function public.single_organization_id() returns uuid
language sql stable security invoker set search_path = '' as $$
  select case when (select count(*) from (select 1 from public.organizations limit 2) s) < 2
              then '00000000-0000-4000-8000-000000000001'::uuid end
$$;

-- 引数: 0 = 親の表、1 = 親を指す子の列（無ければ親なし）
-- 作った人の権限で動く（security definer）。印を写すのに要るのは組織の台帳と親の行の組織の印だけで、
-- 書き込む役割（前の版のアプリの制限つきの接続を含む）がそれらを読めなくても、insert を止めないため。返すのは印だけ
create function public.fill_organization_id() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  parent_key text;
  found uuid;
begin
  if new.organization_id is not null then return new; end if;
  if tg_nargs >= 2 then
    parent_key := to_jsonb(new) ->> tg_argv[1];
    if parent_key is not null then
      execute format('select organization_id from public.%I where id = $1::uuid', tg_argv[0]) into found using parent_key;
    end if;
  end if;
  new.organization_id := coalesce(found, public.single_organization_id());
  return new;
end;
$$;

-- コメントは呼び名でページに結ぶ（前の版は page_id を知らない）。同じ呼び名のページが 1 枚に決まるときだけ結ぶ
create function public.fill_comment_page() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  matches integer;
  found_page text;
  found_org text;
begin
  if new.page_id is null then
    select count(*), min(p.id::text), min(p.organization_id::text) into matches, found_page, found_org
      from public.pages p
     where p.page_slug = new.page_slug and (new.organization_id is null or p.organization_id = new.organization_id);
    if matches = 1 then
      new.page_id := found_page::uuid;
      if new.organization_id is null then new.organization_id := found_org::uuid; end if;
    end if;
  end if;
  if new.organization_id is null and new.page_id is not null then
    select p.organization_id into found_org from public.pages p where p.id = new.page_id;
    new.organization_id := found_org::uuid;
  end if;
  if new.organization_id is null then new.organization_id := public.single_organization_id(); end if;
  return new;
end;
$$;
revoke all on function public.single_organization_id(), public.fill_organization_id(), public.fill_comment_page() from public, anon, authenticated;
grant execute on function public.single_organization_id(), public.fill_organization_id(), public.fill_comment_page() to service_role;

-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger pages_fill_organization before insert on public.pages for each row execute function public.fill_organization_id();
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger page_revisions_fill_organization before insert on public.page_revisions for each row execute function public.fill_organization_id('pages', 'page_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger page_comments_fill_organization before insert on public.page_comments for each row execute function public.fill_comment_page();
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger publish_tokens_fill_organization before insert on public.publish_tokens for each row execute function public.fill_organization_id();
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger groups_fill_organization before insert on public.groups for each row execute function public.fill_organization_id();
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger group_members_fill_organization before insert on public.group_members for each row execute function public.fill_organization_id('groups', 'group_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger page_permissions_fill_organization before insert on public.page_permissions for each row execute function public.fill_organization_id('pages', 'page_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger access_requests_fill_organization before insert on public.access_requests for each row execute function public.fill_organization_id('pages', 'page_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger page_views_fill_organization before insert on public.page_views for each row execute function public.fill_organization_id('pages', 'page_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger page_view_optouts_fill_organization before insert on public.page_view_optouts for each row execute function public.fill_organization_id();
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger page_favorites_fill_organization before insert on public.page_favorites for each row execute function public.fill_organization_id('pages', 'page_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger page_catalog_fill_organization before insert on public.page_catalog for each row execute function public.fill_organization_id('pages', 'page_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger page_edit_drafts_fill_organization before insert on public.page_edit_drafts for each row execute function public.fill_organization_id('pages', 'page_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger inbox_reads_fill_organization before insert on public.inbox_reads for each row execute function public.fill_organization_id();
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger beta_feature_optins_fill_organization before insert on public.beta_feature_optins for each row execute function public.fill_organization_id();
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger cli_login_pending_fill_organization before insert on public.cli_login_pending for each row execute function public.fill_organization_id();
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger app_login_codes_fill_organization before insert on public.app_login_codes for each row execute function public.fill_organization_id();
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger deck_edit_sessions_fill_organization before insert on public.deck_edit_sessions for each row execute function public.fill_organization_id('pages', 'page_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger deck_edit_submissions_fill_organization before insert on public.deck_edit_submissions for each row execute function public.fill_organization_id('pages', 'page_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger deck_edit_processors_fill_organization before insert on public.deck_edit_processors for each row execute function public.fill_organization_id('pages', 'page_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger deck_edit_receipts_fill_organization before insert on public.deck_edit_receipts for each row execute function public.fill_organization_id('pages', 'page_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger deck_collaboration_rooms_fill_organization before insert on public.deck_collaboration_rooms for each row execute function public.fill_organization_id('pages', 'page_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger deck_collaboration_events_fill_organization before insert on public.deck_collaboration_events for each row execute function public.fill_organization_id('pages', 'page_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger deck_media_jobs_fill_organization before insert on public.deck_media_jobs for each row execute function public.fill_organization_id('pages', 'page_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger deck_image_assets_fill_organization before insert on public.deck_image_assets for each row execute function public.fill_organization_id('pages', 'page_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger deck_image_uses_fill_organization before insert on public.deck_image_uses for each row execute function public.fill_organization_id('deck_image_assets', 'asset_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger deck_image_search_usage_fill_organization before insert on public.deck_image_search_usage for each row execute function public.fill_organization_id();
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger deck_my_themes_fill_organization before insert on public.deck_my_themes for each row execute function public.fill_organization_id();
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger deck_theme_versions_fill_organization before insert on public.deck_theme_versions for each row execute function public.fill_organization_id();
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger deck_theme_requests_fill_organization before insert on public.deck_theme_requests for each row execute function public.fill_organization_id();
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger recordings_fill_organization before insert on public.recordings for each row execute function public.fill_organization_id();
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger recording_grants_fill_organization before insert on public.recording_grants for each row execute function public.fill_organization_id('recordings', 'recording_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger recording_generations_fill_organization before insert on public.recording_generations for each row execute function public.fill_organization_id();
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger recording_generation_inputs_fill_organization before insert on public.recording_generation_inputs for each row execute function public.fill_organization_id('recordings', 'recording_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger recording_artifacts_fill_organization before insert on public.recording_artifacts for each row execute function public.fill_organization_id('pages', 'page_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger recording_events_fill_organization before insert on public.recording_events for each row execute function public.fill_organization_id('recordings', 'recording_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger recording_commands_fill_organization before insert on public.recording_commands for each row execute function public.fill_organization_id('recordings', 'recording_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger recording_progress_fill_organization before insert on public.recording_progress for each row execute function public.fill_organization_id('recordings', 'recording_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger recording_scene_proposals_fill_organization before insert on public.recording_scene_proposals for each row execute function public.fill_organization_id('recordings', 'recording_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger recording_scenes_fill_organization before insert on public.recording_scenes for each row execute function public.fill_organization_id('recordings', 'recording_id');
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger recording_ai_settings_fill_organization before insert on public.recording_ai_settings for each row execute function public.fill_organization_id();
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger recording_github_connections_fill_organization before insert on public.recording_github_connections for each row execute function public.fill_organization_id();
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger recording_github_pending_fill_organization before insert on public.recording_github_pending for each row execute function public.fill_organization_id();
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger recording_github_controls_fill_organization before insert on public.recording_github_controls for each row execute function public.fill_organization_id();
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger recording_calendar_connections_fill_organization before insert on public.recording_calendar_connections for each row execute function public.fill_organization_id();
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger recording_calendar_pending_fill_organization before insert on public.recording_calendar_pending for each row execute function public.fill_organization_id();
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger recording_calendar_controls_fill_organization before insert on public.recording_calendar_controls for each row execute function public.fill_organization_id();
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger recording_repository_catalog_fill_organization before insert on public.recording_repository_catalog for each row execute function public.fill_organization_id();
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger repository_comments_fill_organization before insert on public.repository_comments for each row execute function public.fill_organization_id();
-- db-contract: reviewed 印が空の insert にだけ組織の印を写す（印のある書き込みは何も変えない。前の版の書き込みを弾かない）
create trigger repository_document_views_fill_organization before insert on public.repository_document_views for each row execute function public.fill_organization_id();
-- ---------------------------------------------------------------------------
-- 6. 組織を引数に取る関数（新しい名前）。中身は古い関数と同じ条件で、行を組織で絞るだけ。判定はしない
--    （見てよいか・書いてよいかは今までどおりアプリが決める）。台帳は lib/tenant-tables.json の functions.organization。
--    p_organization_id は必ず最初の引数（アプリの組織で絞った口 orgDb が差し込む）。
-- ---------------------------------------------------------------------------

-- 見る人を絞ったページの可否の材料（古い版: page_access_facts）。管理者は今の名簿（admins）のまま。所属の役割へは A4 で替える
create function public.org_page_access_facts(p_organization_id uuid, p_page_id uuid, p_email text)
returns table (is_admin boolean, is_granted boolean)
language sql stable security invoker set search_path = '' as $$
  select
    exists (select 1 from public.admins a where a.email = lower(p_email)) as is_admin,
    exists (
      select 1
        from public.page_permissions p
        left join public.groups g
          on g.id = p.group_id and g.deleted_at is null and g.organization_id = p_organization_id
        left join public.group_members m
          on m.group_id = g.id and m.organization_id = p_organization_id
       where p.organization_id = p_organization_id
         and p.page_id = p_page_id
         and ((p.grantee_kind = 'member' and p.member_email = lower(p_email))
              or (p.grantee_kind = 'group' and m.member_email = lower(p_email)))
    ) as is_granted;
$$;
revoke all on function public.org_page_access_facts(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.org_page_access_facts(uuid, uuid, text) to service_role;

-- その人に出ている許可の全部（古い版: member_page_grants）
create function public.org_member_page_grants(p_organization_id uuid, p_email text)
returns table (page_id uuid, role text, added_at timestamptz, via_group boolean)
language sql stable security invoker set search_path = '' as $$
  select p.page_id, p.role, p.added_at, false
    from public.page_permissions p
   where p.organization_id = p_organization_id and p.grantee_kind = 'member' and p.member_email = p_email
  union all
  select p.page_id, p.role, p.added_at, true
    from public.page_permissions p
    join public.group_members m
      on m.group_id = p.group_id and m.member_email = p_email and m.organization_id = p_organization_id
    join public.groups g
      on g.id = m.group_id and g.deleted_at is null and g.organization_id = p_organization_id
   where p.organization_id = p_organization_id and p.grantee_kind = 'group'
$$;
revoke all on function public.org_member_page_grants(uuid, text) from public, anon, authenticated;
grant execute on function public.org_member_page_grants(uuid, text) to service_role;

-- 議事録の材料（古い版: recording_page_sources）
create function public.org_recording_page_sources(p_organization_id uuid, p_page_ids uuid[] default null)
returns table (page_id uuid, generation_id uuid, kind text, basis text, repositories jsonb, recording_id uuid, recording jsonb)
language sql stable security invoker set search_path = '' as $$
  select a.page_id, a.generation_id, a.kind, a.basis, a.repositories, i.recording_id,
         case when r.id is null then null else jsonb_build_object(
           'id', r.id, 'owner_email', r.owner_email, 'title', r.title, 'source_kind', r.source_kind,
           'upload_device_id', r.upload_device_id, 'upload_device_label', r.upload_device_label,
           'recorded_at', r.recorded_at, 'recorded_at_confidence', r.recorded_at_confidence, 'recording_device', r.recording_device,
           'created_at', r.created_at, 'accepted_at', r.accepted_at, 'deleted_at', r.deleted_at,
           'duration_seconds', r.duration_seconds, 'transcript_characters', r.transcript_characters, 'byte_size', r.byte_size,
           'sha256', r.sha256, 'state', r.state, 'waiting_reason', r.waiting_reason, 'revision', r.revision) end
    from public.recording_artifacts a
    left join public.recording_generation_inputs i
      on i.generation_id = a.generation_id and i.organization_id = p_organization_id
    left join public.recordings r
      on r.id = i.recording_id and r.organization_id = p_organization_id
   where a.organization_id = p_organization_id
     and ((p_page_ids is not null and a.page_id = any(p_page_ids))
      or (p_page_ids is null and exists (
            select 1 from public.pages pg
             where pg.id = a.page_id and pg.organization_id = p_organization_id and pg.recording_protected and pg.deleted_at is null)))
$$;
revoke all on function public.org_recording_page_sources(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.org_recording_page_sources(uuid, uuid[]) to service_role;

-- 本人まわりの小さな問い合わせを 1 回で（古い版: workspace_member_reads）。GitHub の写し（access_memory ほか）は全体で 1 つの表
create function public.org_workspace_member_reads(p_organization_id uuid, p_email text)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'admin', exists (select 1 from public.admins a where a.email = p_email),
    'preferences', (select jsonb_build_object('appearance', w.appearance, 'locale', w.locale,
                      'read_aloud_voice', w.read_aloud_voice, 'read_aloud_rate', w.read_aloud_rate)
                      from public.workspace_preferences w where w.owner_email = p_email),
    'favorites', coalesce((select jsonb_agg(f.page_id order by f.page_id)
                      from public.page_favorites f where f.organization_id = p_organization_id and f.owner_email = p_email), '[]'::jsonb),
    'view_optout', exists (select 1 from public.page_view_optouts o where o.organization_id = p_organization_id and o.viewer_email = p_email),
    'grants', coalesce((select jsonb_agg(to_jsonb(g)) from public.org_member_page_grants(p_organization_id, p_email) g), '[]'::jsonb),
    'recording_sources', coalesce((select jsonb_agg(to_jsonb(s)) from public.org_recording_page_sources(p_organization_id) s), '[]'::jsonb),
    'recording_grants', coalesce((select jsonb_agg(jsonb_build_object('recording_id', r.recording_id,
                      'member_email', r.member_email, 'artifact', r.artifact))
                      from (select * from public.recording_grants
                             where organization_id = p_organization_id and member_email = p_email limit 1000) r), '[]'::jsonb),
    'github_link', (select jsonb_build_object('github_user_id', c.github_user_id,
                      'refresh_expires_at', c.refresh_expires_at, 'revoked_at', c.revoked_at)
                      from public.recording_github_connections c where c.organization_id = p_organization_id and c.owner_email = p_email),
    'catalog', coalesce((select jsonb_agg(jsonb_build_object('repository_id', k.repository_id, 'full_name', k.full_name))
                      from (select * from public.recording_repository_catalog where organization_id = p_organization_id limit 500) k), '[]'::jsonb),
    'access_memory', coalesce((select jsonb_agg(jsonb_build_object('repository_id', m.repository_id,
                      'github_user_id', m.github_user_id, 'full_name', m.full_name, 'branch', m.branch, 'asked_at', m.asked_at))
                      from (select * from public.repository_access_memory where viewer_email = p_email limit 500) m), '[]'::jsonb),
    'access_generation', (select n.generation from public.repository_access_generation n where n.only_row),
    'latest_delivery', (select d.received_at from public.repository_webhook_deliveries d order by d.received_at desc limit 1),
    'last_page_id', (select p.id from public.pages p
                      where p.organization_id = p_organization_id and p.deleted_at is null order by p.id desc limit 1)
  )
$$;
revoke all on function public.org_workspace_member_reads(uuid, text) from public, anon, authenticated;
grant execute on function public.org_workspace_member_reads(uuid, text) to service_role;

-- 未解決の親コメント（古い版: open_page_comments）
create function public.org_open_page_comments(p_organization_id uuid, p_slugs jsonb)
returns setof public.page_comments
language sql stable security invoker set search_path = '' as $$
  select c.* from public.page_comments c
   where c.organization_id = p_organization_id
     and c.page_slug in (select jsonb_array_elements_text(coalesce(p_slugs, '[]'::jsonb)))
     and c.parent_id is null and c.resolved_at is null and c.deleted_at is null
   order by c.created_at desc
$$;
revoke all on function public.org_open_page_comments(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.org_open_page_comments(uuid, jsonb) to service_role;

-- ホームのコメントの節の材料（古い版: home_comment_reads）
create function public.org_home_comment_reads(p_organization_id uuid, p_email text, p_author text, p_since timestamptz)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with candidates as (
    select p.page_slug from public.pages p
     where p.organization_id = p_organization_id and p.deleted_at is null
       and (lower(btrim(p.created_by)) = p_email
            or p.id in (select g.page_id from public.page_permissions g
                         where g.organization_id = p_organization_id
                           and g.grantee_kind = 'member' and g.member_email = p_email and g.role = 'owner'))
  ),
  mine as (
    select c.id from public.page_comments c
     where c.organization_id = p_organization_id and c.parent_id is null and c.deleted_at is null and c.author_email = p_author
  ),
  replies as (
    select c.* from public.page_comments c
     where c.organization_id = p_organization_id and c.parent_id is not null and c.deleted_at is null and c.created_at > p_since
  )
  select jsonb_build_object(
    'candidate_slugs', coalesce((select jsonb_agg(page_slug) from candidates), '[]'::jsonb),
    'open_comments', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc) from public.page_comments c
                      where c.organization_id = p_organization_id
                        and c.page_slug in (select page_slug from candidates)
                        and c.parent_id is null and c.resolved_at is null and c.deleted_at is null), '[]'::jsonb),
    'my_parent_ids', coalesce((select jsonb_agg(id) from mine), '[]'::jsonb),
    'replies', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from replies r), '[]'::jsonb),
    'parents', coalesce((select jsonb_agg(to_jsonb(c)) from public.page_comments c
                      where c.organization_id = p_organization_id and c.deleted_at is null
                        and c.id in (select r.parent_id from replies r where r.parent_id in (select id from mine))), '[]'::jsonb)
  )
$$;
revoke all on function public.org_home_comment_reads(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.org_home_comment_reads(uuid, text, text, timestamptz) to service_role;

-- 一覧とホームに出やすい資料の形式（古い版: member_page_kinds）
create function public.org_member_page_kinds(p_organization_id uuid, p_email text, p_recent integer, p_classifier integer)
returns table (page_id uuid, version_id text, kind text)
language sql stable security invoker set search_path = '' as $$
  with wanted as (
    (select p.id from public.pages p where p.organization_id = p_organization_id and p.deleted_at is null
      order by p.updated_at desc limit greatest(p_recent, 0))
    union
    (select v.page_id from public.page_views v where v.organization_id = p_organization_id and v.viewer_email = p_email
      order by v.last_viewed_at desc limit greatest(p_recent, 0))
    union
    (select p.id from public.pages p
      where p.organization_id = p_organization_id and p.deleted_at is null and lower(btrim(p.created_by)) = p_email
      order by p.updated_at desc limit greatest(p_recent, 0))
    union
    (select g.page_id from public.org_member_page_grants(p_organization_id, p_email) g
      order by g.added_at desc nulls last limit greatest(p_recent, 0))
  )
  select p.id, p.current_version_id, k.kind
    from public.pages p
    left join public.page_catalog k
      on k.organization_id = p_organization_id and k.page_id = p.id
     and k.version_id = p.current_version_id and k.classifier_version = p_classifier
   where p.organization_id = p_organization_id and p.deleted_at is null and p.current_version_id is not null
     and p.id in (select id from wanted)
$$;
revoke all on function public.org_member_page_kinds(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.org_member_page_kinds(uuid, text, integer, integer) to service_role;

-- 見たページを控える（古い版: record_page_view）。その組織のページで、その組織で「残さない」にしていない人だけ
create function public.org_record_page_view(p_organization_id uuid, p_page_id uuid, p_email text)
returns void
language sql volatile security invoker set search_path = '' as $$
  insert into public.page_views (organization_id, page_id, viewer_email)
  select p_organization_id, p_page_id, lower(p_email)
   where exists (select 1 from public.pages p where p.organization_id = p_organization_id and p.id = p_page_id)
     and not exists (
       select 1 from public.page_view_optouts o where o.organization_id = p_organization_id and o.viewer_email = lower(p_email))
  on conflict (page_id, viewer_email) do update
    set last_viewed_at = now(),
        view_count = page_views.view_count + 1
    where page_views.organization_id = p_organization_id;
$$;
revoke all on function public.org_record_page_view(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.org_record_page_view(uuid, uuid, text) to service_role;

-- 「あなたの番」をどこまで見たかを進める（古い版: mark_inbox_seen）。組織ごとに 1 行
create function public.org_mark_inbox_seen(p_organization_id uuid, p_email text, p_until timestamptz)
returns table (seen_until timestamptz)
language sql volatile security invoker set search_path = '' as $$
  insert into public.inbox_reads as r (organization_id, viewer_email, seen_until, updated_at)
  values (p_organization_id, lower(p_email), least(p_until, now()), now())
  on conflict (organization_id, viewer_email) do update
    set seen_until = greatest(r.seen_until, excluded.seen_until),
        updated_at = now()
  returning r.seen_until;
$$;
revoke all on function public.org_mark_inbox_seen(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.org_mark_inbox_seen(uuid, text, timestamptz) to service_role;

-- リポジトリの文書を見たことを控える（古い版: record_repository_document_view）。文書の写しは全体で 1 つ、見た控えは組織ごと
create function public.org_record_repository_document_view(
  p_organization_id uuid,
  p_document_id uuid,
  p_repository_id bigint,
  p_email text,
  p_blob text,
  p_commit text
) returns void
language sql volatile security invoker set search_path = '' as $$
  insert into public.repository_document_views (organization_id, document_id, viewer_email, repository_id, seen_blob, seen_commit)
  select p_organization_id, d.id, lower(p_email), d.repository_id, p_blob, p_commit
    from public.repository_documents d
   where d.id = p_document_id
     and d.repository_id = p_repository_id
     and not exists (
       select 1 from public.page_view_optouts o where o.organization_id = p_organization_id and o.viewer_email = lower(p_email))
  on conflict (organization_id, document_id, viewer_email) do update
    set previous_blob = case
          when excluded.seen_blob <> public.repository_document_views.seen_blob then public.repository_document_views.seen_blob
          else public.repository_document_views.previous_blob
        end,
        seen_blob = excluded.seen_blob,
        seen_commit = excluded.seen_commit,
        last_viewed_at = now();
$$;
revoke all on function public.org_record_repository_document_view(uuid, uuid, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.org_record_repository_document_view(uuid, uuid, bigint, text, text, text) to service_role;

-- 画像検索の予算を 1 回ぶん使う（古い版: consume_deck_image_search）。予算は組織ごと
create function public.org_consume_deck_image_search(
  p_organization_id uuid,
  p_day date,
  p_owner text,
  p_user_limit integer,
  p_company_limit integer
)
returns table(allowed boolean, user_count integer, company_count integer)
language plpgsql security invoker set search_path = '' as $$
declare mine integer; company integer;
begin
  if p_organization_id is null or p_owner <> lower(p_owner) or p_user_limit < 1 or p_company_limit < p_user_limit then
    raise exception 'image_search_limit_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text || ':' || p_day::text, 17));
  select coalesce(sum(u.requests), 0)::integer into company
    from public.deck_image_search_usage u where u.organization_id = p_organization_id and u.usage_day = p_day;
  select coalesce(u.requests, 0) into mine
    from public.deck_image_search_usage u where u.organization_id = p_organization_id and u.usage_day = p_day and u.owner_email = p_owner;
  if not found then mine := 0; end if;
  if mine >= p_user_limit or company >= p_company_limit then
    return query select false, mine, company; return;
  end if;
  insert into public.deck_image_search_usage as u (organization_id, usage_day, owner_email, requests)
  values (p_organization_id, p_day, p_owner, 1)
  on conflict (organization_id, usage_day, owner_email) do update set requests = u.requests + 1
  returning u.requests into mine;
  return query select true, mine, company + 1;
end $$;
revoke all on function public.org_consume_deck_image_search(uuid, date, text, integer, integer) from public, anon, authenticated;
grant execute on function public.org_consume_deck_image_search(uuid, date, text, integer, integer) to service_role;
