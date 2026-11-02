create table public.recording_github_connections (
  owner_email text primary key,
  github_user_id bigint not null unique,
  github_login text not null,
  encrypted_credentials text not null,
  expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  revision uuid not null,
  lease_id uuid,
  lease_until timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.recording_github_connections enable row level security;
revoke all on public.recording_github_connections from public, anon, authenticated;
grant select, insert, update, delete on public.recording_github_connections to service_role;

create table public.recording_github_pending (
  state_hash text primary key,
  owner_email text not null,
  encrypted_verifier text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);
alter table public.recording_github_pending enable row level security;
revoke all on public.recording_github_pending from public, anon, authenticated;
grant select, insert, update, delete on public.recording_github_pending to service_role;

create table public.recording_repository_catalog (
  repository_id bigint primary key,
  full_name text not null,
  description text not null check(char_length(description) between 1 and 1000),
  documents jsonb not null check(jsonb_typeof(documents)='array'),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.recording_repository_catalog enable row level security;
revoke all on public.recording_repository_catalog from public, anon, authenticated;
grant select, insert, update, delete on public.recording_repository_catalog to service_role;

create table public.recording_github_controls (
  owner_email text primary key,
  operation_id uuid not null
);
alter table public.recording_github_controls enable row level security;
revoke all on public.recording_github_controls from public, anon, authenticated;
grant select, insert, update, delete on public.recording_github_controls to service_role;
alter table public.recording_github_pending add column operation_id uuid not null;

-- db-contract: reviewed 新規GitHub接続表だけに、本人の接続操作の世代を原子的に記録する。
create function public.begin_recording_github(p_owner text,p_operation uuid,p_state text,p_verifier text,p_expires timestamptz)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
  insert into recording_github_controls values(p_owner,p_operation) on conflict(owner_email) do update set operation_id=excluded.operation_id;
  insert into recording_github_pending(state_hash,owner_email,encrypted_verifier,expires_at,operation_id) values(p_state,p_owner,p_verifier,p_expires,p_operation);
  return true;
end;
$$;
-- db-contract: reviewed 認証開始後に解除や再接続された古い完了通知で、接続状態を復活させない。
create function public.finish_recording_github(p_owner text,p_operation uuid,p_user bigint,p_login text,p_credentials text,p_expires timestamptz,p_refresh_expires timestamptz)
returns boolean language plpgsql security invoker set search_path=public as $$
declare current_operation uuid;
begin
  select operation_id into current_operation from recording_github_controls where owner_email=p_owner for update;
  if current_operation is distinct from p_operation then return false; end if;
  insert into recording_github_connections(owner_email,github_user_id,github_login,encrypted_credentials,expires_at,refresh_expires_at,revision)
    values(p_owner,p_user,p_login,p_credentials,p_expires,p_refresh_expires,p_operation)
    on conflict(owner_email) do update set github_user_id=excluded.github_user_id,github_login=excluded.github_login,
      encrypted_credentials=excluded.encrypted_credentials,expires_at=excluded.expires_at,refresh_expires_at=excluded.refresh_expires_at,
      revision=excluded.revision,lease_id=null,lease_until=null,revoked_at=null,updated_at=now();
  return true;
end;
$$;
-- db-contract: reviewed 新規接続を失効させるとき、待機中と処理中の認証にも旧世代の印を残す。
create function public.disconnect_recording_github(p_owner text,p_operation uuid)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
  insert into recording_github_controls values(p_owner,p_operation) on conflict(owner_email) do update set operation_id=excluded.operation_id;
  update recording_github_connections set revoked_at=now(),encrypted_credentials='',revision=p_operation where owner_email=p_owner;
  return true;
end;
$$;
revoke all on function public.begin_recording_github(text,uuid,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.finish_recording_github(text,uuid,bigint,text,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.disconnect_recording_github(text,uuid) from public, anon, authenticated;
grant execute on function public.begin_recording_github(text,uuid,text,text,timestamptz) to service_role;
grant execute on function public.finish_recording_github(text,uuid,bigint,text,text,timestamptz,timestamptz) to service_role;
grant execute on function public.disconnect_recording_github(text,uuid) to service_role;
