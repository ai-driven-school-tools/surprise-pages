-- home_first_wave_reads: ホームと会社の資料が、ページの一覧を待ってから 2 段目で読んでいた材料を、1 段目で読める関数を足す（足すだけ）。
--
-- 本番の保存先は 1 段ごとに 60〜150ms かかる（docs/app-speed.md の「本番で分かったこと」）。ホームはコメントと資料の形式を、
-- ページの一覧が届いてから読んでいたので 2 段かかっていた。ここの関数は**判定しない**——今までの読み方より広めの行
-- （候補）を返すだけで、出すかどうかは今までどおりアプリ（lib/home.ts・lib/workspace.ts）が自分の材料で決める。
-- 足りない行があれば、アプリは今までの読み方で補う。呼ぶ人の権限で動き（security invoker）、サーバーだけが呼べる。
--
-- 決まり（docs/db-migrations.md）
-- - 足す → 移す → 縮める の段を踏む。消す・名前を変える・NOT NULL を付けるは、別の PR に分ける（DB contract の関門が見る）
-- - 当てるのは CI（main に入るとステージングへ、本番は承認つきの実行で）。管理画面から手で当てない
-- - 関数が無い保存先（当てる前）では、アプリは今までどおり 2 段で読む（呼んで失敗したら元の読み方に戻る）

-- ホームのコメントの節の材料（lib/home.ts の homeFor）。今までの読み方は:
--   未解決のコメント … 自分の資料（作った・共同の作った人）の呼び名で listOpenCommentsOn
--   返信             … 自分の親コメントの目印と、p_since より後の返信を同時に読み、返信の親を読む（listRepliesToMine）
-- candidate_slugs は「自分の資料」の候補（作った人の欄が本人・本人あての owner の許可）。アプリは自分の資料の呼び名が
-- すべてこの中にあるときだけ open_comments を使い、無ければ今までの読み方で読む。
create function public.home_comment_reads(p_email text, p_author text, p_since timestamptz)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with candidates as (
    select p.page_slug from public.pages p
     where p.deleted_at is null
       and (lower(btrim(p.created_by)) = p_email
            or p.id in (select g.page_id from public.page_permissions g
                         where g.grantee_kind = 'member' and g.member_email = p_email and g.role = 'owner'))
  ),
  mine as (
    select c.id from public.page_comments c
     where c.parent_id is null and c.deleted_at is null and c.author_email = p_author
  ),
  replies as (
    select c.* from public.page_comments c
     where c.parent_id is not null and c.deleted_at is null and c.created_at > p_since
  )
  select jsonb_build_object(
    'candidate_slugs', coalesce((select jsonb_agg(page_slug) from candidates), '[]'::jsonb),
    'open_comments', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc) from public.page_comments c
                      where c.page_slug in (select page_slug from candidates)
                        and c.parent_id is null and c.resolved_at is null and c.deleted_at is null), '[]'::jsonb),
    'my_parent_ids', coalesce((select jsonb_agg(id) from mine), '[]'::jsonb),
    'replies', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from replies r), '[]'::jsonb),
    'parents', coalesce((select jsonb_agg(to_jsonb(c)) from public.page_comments c
                      where c.deleted_at is null
                        and c.id in (select r.parent_id from replies r where r.parent_id in (select id from mine))), '[]'::jsonb)
  )
$$;
revoke all on function public.home_comment_reads(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.home_comment_reads(text, text, timestamptz) to service_role;

-- 一覧とホームに出やすい資料の、今の版の形式（lib/workspace.ts の classifyPages と同じ条件の行）。
-- 全部の資料ではなく、新しく直された順に p_recent 件・本人が最近見た資料・本人が作った資料（新しい順）・本人に共有された資料（新しい順）を
-- それぞれ p_recent 件まで。資料が増えても、本人が増やしても、返す行は 4 × p_recent 件までに収まる。形式がまだ無い資料も kind を空で返す
-- （「確かめた・無かった」と「読んでいない」を分けるため。読んでいない資料だけを、アプリは今までの読み方で補う）。
create function public.member_page_kinds(p_email text, p_recent integer, p_classifier integer)
returns table (page_id uuid, version_id text, kind text)
language sql stable security invoker set search_path = public as $$
  with wanted as (
    (select p.id from public.pages p where p.deleted_at is null order by p.updated_at desc limit greatest(p_recent, 0))
    union
    (select v.page_id from public.page_views v where v.viewer_email = p_email order by v.last_viewed_at desc limit greatest(p_recent, 0))
    union
    (select p.id from public.pages p where p.deleted_at is null and lower(btrim(p.created_by)) = p_email
      order by p.updated_at desc limit greatest(p_recent, 0))
    union
    (select g.page_id from public.member_page_grants(p_email) g order by g.added_at desc nulls last limit greatest(p_recent, 0))
  )
  select p.id, p.current_version_id, k.kind
    from public.pages p
    left join public.page_catalog k
      on k.page_id = p.id and k.version_id = p.current_version_id and k.classifier_version = p_classifier
   where p.deleted_at is null and p.current_version_id is not null and p.id in (select id from wanted)
$$;
revoke all on function public.member_page_kinds(text, integer, integer) from public, anon, authenticated;
grant execute on function public.member_page_kinds(text, integer, integer) to service_role;
