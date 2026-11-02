-- 本人のカレンダー許可はGoogleログインと別に取り、録音機能だけで使う。
create table public.recording_calendar_connections (
  owner_email text primary key,
  google_sub text not null unique,
  encrypted_credentials text not null,
  expires_at timestamptz not null,
  revision uuid not null,
  lease_id uuid,
  lease_until timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.recording_calendar_connections enable row level security;
revoke all on public.recording_calendar_connections from public, anon, authenticated;
grant select, insert, update, delete on public.recording_calendar_connections to service_role;

create table public.recording_calendar_pending (
  state_hash text primary key,
  owner_email text not null,
  encrypted_verifier text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  operation_id uuid not null
);
alter table public.recording_calendar_pending enable row level security;
revoke all on public.recording_calendar_pending from public, anon, authenticated;
grant select, insert, update, delete on public.recording_calendar_pending to service_role;

create table public.recording_calendar_controls (
  owner_email text primary key,
  operation_id uuid not null
);
alter table public.recording_calendar_controls enable row level security;
revoke all on public.recording_calendar_controls from public, anon, authenticated;
grant select, insert, update, delete on public.recording_calendar_controls to service_role;

-- db-contract: reviewed 新規の本人別カレンダー接続だけに操作世代と10分の使い捨て認証を記録する。
create function public.begin_recording_calendar(p_owner text,p_operation uuid,p_state text,p_verifier text,p_expires timestamptz)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
  insert into public.recording_calendar_controls values(p_owner,p_operation)
    on conflict(owner_email) do update set operation_id=excluded.operation_id;
  insert into public.recording_calendar_pending(state_hash,owner_email,encrypted_verifier,expires_at,operation_id)
    values(p_state,p_owner,p_verifier,p_expires,p_operation);
  return true;
end;
$$;

-- db-contract: reviewed 再接続や解除より古い認証結果は本人の接続を復活させない。
create function public.finish_recording_calendar(p_owner text,p_operation uuid,p_google_sub text,p_credentials text,p_expires timestamptz)
returns boolean language plpgsql security invoker set search_path=public as $$
declare current_operation uuid;
begin
  select operation_id into current_operation from public.recording_calendar_controls where owner_email=p_owner for update;
  if current_operation is distinct from p_operation then return false; end if;
  insert into public.recording_calendar_connections(owner_email,google_sub,encrypted_credentials,expires_at,revision)
    values(p_owner,p_google_sub,p_credentials,p_expires,p_operation)
    on conflict(owner_email) do update set google_sub=excluded.google_sub,
      encrypted_credentials=excluded.encrypted_credentials,expires_at=excluded.expires_at,
      revision=excluded.revision,lease_id=null,lease_until=null,revoked_at=null,updated_at=now();
  return true;
end;
$$;

-- db-contract: reviewed 本人が解除した接続を古い更新や認証の返事で戻さない。
create function public.disconnect_recording_calendar(p_owner text,p_operation uuid)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
  insert into public.recording_calendar_controls values(p_owner,p_operation)
    on conflict(owner_email) do update set operation_id=excluded.operation_id;
  update public.recording_calendar_connections set revoked_at=now(),encrypted_credentials='',revision=p_operation
    where owner_email=p_owner;
  return true;
end;
$$;

revoke all on function public.begin_recording_calendar(text,uuid,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.finish_recording_calendar(text,uuid,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.disconnect_recording_calendar(text,uuid) from public, anon, authenticated;
grant execute on function public.begin_recording_calendar(text,uuid,text,text,timestamptz) to service_role;
grant execute on function public.finish_recording_calendar(text,uuid,text,text,timestamptz) to service_role;
grant execute on function public.disconnect_recording_calendar(text,uuid) to service_role;
