-- workspace_member_reads: 一覧の画面を描くたびに同時に投げていた、本人まわりの小さな問い合わせ 13 本を 1 回で読む関数を足す（足すだけ）。
--
-- 本番の保存先は HTTP の受け口経由で、同時に 10 本以上を投げると、1 本ずつが単独のとき（約 30ms）の 5〜10 倍に伸びる
-- （2026-10-08 の本番の受け口の記録・docs/app-speed.md の「本番で分かったこと」）。本数を減らすと、そのぶん混み合いが減る。
-- ここの関数は**判定しない**。今までアプリが 1 本ずつ読んでいたのと同じ条件で同じ行を返すだけで、
-- 見てよいか・書いてよいかは、これまでどおりアプリ（lib/member-reads.ts を読む各関数）が決める。
-- GitHub の鍵（recording_github_connections の encrypted_credentials）は返さない。つないでいるかの判定に要る 3 つの欄だけ。
-- 呼ぶ人の権限で動く（security invoker）。
--
-- 決まり（docs/db-migrations.md）
-- - 足す → 移す → 縮める の段を踏む。消す・名前を変える・NOT NULL を付けるは、別の PR に分ける（DB contract の関門が見る）
-- - 当てるのは CI（main に入るとステージングへ、本番は承認つきの実行で）。管理画面から手で当てない
-- - 関数が無い保存先（当てる前）では、アプリは今までどおり 1 本ずつ読む（呼んで失敗したら元の読み方に戻る）

-- p_email は呼ぶ側が小文字にそろえて渡す。各欄の条件は、今までの読み方（括弧の中の関数）と同じ:
--   admin              … admins に本人がいるか（lib/access-gates.ts の isAdmin）
--   preferences        … 本人の個人設定の 1 行（lib/workspace.ts の preferenceRow）
--   favorites          … 本人が星を付けた資料（lib/workspace.ts の savedFavorites）
--   view_optout        … 本人が「記録を残さない」にしているか（lib/page-views.ts の viewOptedOut）
--   grants             … member_page_grants と同じ行（lib/access-gates.ts の memberGrantRows）
--   recording_sources  … recording_page_sources() と同じ行（lib/recording-store.ts の bundledMaterials）
--   recording_grants   … 本人に共有された録音（lib/recording-store.ts の memberRecordingGrants）
--   github_link        … 録音の GitHub のつながりの、判定に要る欄だけ（lib/recording-github.ts の recordingGithubLinked）
--   catalog            … 録音の資料の登録の名前（lib/repository-access.ts の catalogNames）
--   access_memory      … 本人の「読める」の覚え（lib/repository-access-memory.ts の memoryEntries）
--   access_generation  … 覚えを捨てた回数（同 currentGeneration。行が無ければ null）
--   latest_delivery    … 最後に届いた GitHub の知らせの時刻（同 memoryMode）
--   last_page_id       … 置いてあるページの、いちばん後ろの目印（lib/pages-store.ts の listAlivePages が、続きが無いと知るため）
create function public.workspace_member_reads(p_email text)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'admin', exists (select 1 from public.admins a where a.email = p_email),
    'preferences', (select jsonb_build_object('appearance', w.appearance, 'locale', w.locale,
                      'read_aloud_voice', w.read_aloud_voice, 'read_aloud_rate', w.read_aloud_rate)
                      from public.workspace_preferences w where w.owner_email = p_email),
    'favorites', coalesce((select jsonb_agg(f.page_id order by f.page_id)
                      from public.page_favorites f where f.owner_email = p_email), '[]'::jsonb),
    'view_optout', exists (select 1 from public.page_view_optouts o where o.viewer_email = p_email),
    'grants', coalesce((select jsonb_agg(to_jsonb(g)) from public.member_page_grants(p_email) g), '[]'::jsonb),
    'recording_sources', coalesce((select jsonb_agg(to_jsonb(s)) from public.recording_page_sources() s), '[]'::jsonb),
    'recording_grants', coalesce((select jsonb_agg(jsonb_build_object('recording_id', r.recording_id,
                      'member_email', r.member_email, 'artifact', r.artifact))
                      from (select * from public.recording_grants where member_email = p_email limit 1000) r), '[]'::jsonb),
    'github_link', (select jsonb_build_object('github_user_id', c.github_user_id,
                      'refresh_expires_at', c.refresh_expires_at, 'revoked_at', c.revoked_at)
                      from public.recording_github_connections c where c.owner_email = p_email),
    'catalog', coalesce((select jsonb_agg(jsonb_build_object('repository_id', k.repository_id, 'full_name', k.full_name))
                      from (select * from public.recording_repository_catalog limit 500) k), '[]'::jsonb),
    'access_memory', coalesce((select jsonb_agg(jsonb_build_object('repository_id', m.repository_id,
                      'github_user_id', m.github_user_id, 'full_name', m.full_name, 'branch', m.branch, 'asked_at', m.asked_at))
                      from (select * from public.repository_access_memory where viewer_email = p_email limit 500) m), '[]'::jsonb),
    'access_generation', (select n.generation from public.repository_access_generation n where n.only_row),
    'latest_delivery', (select d.received_at from public.repository_webhook_deliveries d order by d.received_at desc limit 1),
    'last_page_id', (select p.id from public.pages p where p.deleted_at is null order by p.id desc limit 1)
  )
$$;
revoke all on function public.workspace_member_reads(text) from public, anon, authenticated;
grant execute on function public.workspace_member_reads(text) to service_role;

-- 未解決の親コメント（lib/comments.ts の listOpenCommentsOn と同じ条件）。今までは呼び名を 40 件ずつ URL に並べて読んでいたので、
-- 資料が多い人（管理者は全部の資料が自分のもの）は 10 本に分かれ、同時 4 本ずつ 3 段で待っていた。呼び名の一覧を本文で渡して 1 本にする。
-- 一覧は JSON の配列で受ける（直につなぐ形でも HTTP 経由でも同じ形で渡せる・receive_repository_webhook と同じ）。
create function public.open_page_comments(p_slugs jsonb)
returns setof public.page_comments
language sql stable security invoker set search_path = public as $$
  select c.* from public.page_comments c
   where c.page_slug in (select jsonb_array_elements_text(coalesce(p_slugs, '[]'::jsonb)))
     and c.parent_id is null and c.resolved_at is null and c.deleted_at is null
   order by c.created_at desc
$$;
revoke all on function public.open_page_comments(jsonb) from public, anon, authenticated;
grant execute on function public.open_page_comments(jsonb) to service_role;

-- 今の版の形式（lib/workspace.ts の classifyPages と同じ条件）。40 件ずつ分けていたのを 1 本にする。
create function public.current_page_kinds(p_ids jsonb, p_versions jsonb, p_classifier integer)
returns table (page_id uuid, version_id text, kind text)
language sql stable security invoker set search_path = public as $$
  select k.page_id, k.version_id, k.kind from public.page_catalog k
   where k.page_id in (select (jsonb_array_elements_text(coalesce(p_ids, '[]'::jsonb)))::uuid)
     and k.version_id in (select jsonb_array_elements_text(coalesce(p_versions, '[]'::jsonb)))
     and k.classifier_version = p_classifier
$$;
revoke all on function public.current_page_kinds(jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function public.current_page_kinds(jsonb, jsonb, integer) to service_role;
