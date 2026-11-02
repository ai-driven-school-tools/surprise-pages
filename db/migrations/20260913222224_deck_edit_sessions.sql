-- Additive: HTML and append-only revision history remain the document source.
alter table public.page_revisions
  add column edit_operation_id uuid,
  add column edit_receipt jsonb;
create unique index page_revisions_edit_operation_idx
  on public.page_revisions (page_id, edit_operation_id) where edit_operation_id is not null;
alter table public.page_revisions add constraint page_revisions_edit_receipt_check check (
  (edit_operation_id is null and edit_receipt is null) or
  (edit_operation_id is not null and edit_receipt is not null and jsonb_typeof(edit_receipt) = 'object')
);

create table public.deck_edit_sessions (
  page_id uuid not null references public.pages(id),
  session_id uuid not null,
  owner_email text not null,
  display_name text not null,
  selection text check (length(selection) <= 120),
  expires_at timestamptz not null,
  primary key (page_id, session_id)
);
create index deck_edit_sessions_expiry_idx on public.deck_edit_sessions (expires_at);
alter table public.deck_edit_sessions enable row level security;
revoke all on public.deck_edit_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.deck_edit_sessions to service_role;

-- Two successful revision inserts can finish pointer updates in reverse order.
-- Guard every writer, including old app instances and regular publishing.
create function public.keep_page_head_forward() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare old_number integer; new_number integer;
begin
  if new.current_version_id is distinct from old.current_version_id then
    select version_number into old_number from public.page_revisions
      where page_id = old.id and version_id = old.current_version_id;
    select version_number into new_number from public.page_revisions
      where page_id = old.id and version_id = new.current_version_id;
    if old_number is not null and (new_number is null or new_number < old_number) then
      new.current_version_id := old.current_version_id;
      new.title := old.title;
      new.updated_at := old.updated_at;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.keep_page_head_forward() from public, anon, authenticated;
grant execute on function public.keep_page_head_forward() to service_role;
create trigger pages_keep_head_forward before update on public.pages
  for each row execute function public.keep_page_head_forward();

comment on table public.deck_edit_sessions is 'Short-lived editor presence; server permission gate only, never document data.';
