-- Read one consistent synchronization packet in one database round trip.
-- The application must pass its ordinary per-request edit permission gate.
-- Invoker scope and grants keep this unavailable to browser database roles.
create function public.read_deck_update(p_page uuid, p_since text, p_until text default null)
returns table(version_id text, version_number integer, deck_collaboration jsonb, revisions jsonb, presence jsonb)
language sql stable security invoker set search_path = '' as $$
  with head as materialized (
    select r.version_id,r.version_number,r.deck_collaboration
    from public.page_revisions r
    where r.page_id=p_page and (p_until is null or r.version_id=p_until)
    order by r.version_number desc limit 1
  ), base as (
    select r.version_number from public.page_revisions r
    where r.page_id=p_page and r.version_id=p_since
  )
  select h.version_id,h.version_number,
    case when h.version_id=p_since then null else h.deck_collaboration end,
    coalesce((select jsonb_agg(to_jsonb(d) order by d.version_number) from (
      select r.version_id,r.version_number,r.parent_version_id,r.edit_receipt
      from public.page_revisions r,base b
      where r.page_id=p_page and r.version_number>b.version_number and r.version_number<=h.version_number
      order by r.version_number limit 51
    ) d),'[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(s) order by s.session_id) from (
      select session_id,display_name,selection from public.deck_edit_sessions
      where page_id=p_page and expires_at>now() order by session_id limit 100
    ) s),'[]'::jsonb)
  from head h;
$$;
revoke all on function public.read_deck_update(uuid,text,text) from public, anon, authenticated;
grant execute on function public.read_deck_update(uuid,text,text) to service_role;
