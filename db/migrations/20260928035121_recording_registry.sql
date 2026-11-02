-- 録音の所有・共有・生成履歴。既存ページを変更しない追加段階。
-- ブラウザのDB接続は許可しない。会社ログインを確認するサーバーだけが操作する。
create table public.recordings (
  id uuid primary key,
  owner_email text not null check (owner_email = lower(trim(owner_email))),
  title text not null check (char_length(title) between 1 and 150),
  source_kind text not null check (source_kind in ('iphone_shortcut','mac_automatic','mac_manual','web','skill','legacy')),
  upload_device_id uuid,
  upload_device_label text,
  recorded_at timestamptz,
  recorded_at_confidence text not null default 'unknown' check (recorded_at_confidence in ('metadata','user','unknown')),
  recording_device text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  deleted_at timestamptz,
  duration_seconds double precision check (duration_seconds >= 0 and duration_seconds <= 43200),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 2147483648),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  audio_key text,
  raw_key text,
  storage_verified_at timestamptz,
  state text not null default 'uploading' check (state in ('uploading','queued','transcribing','awaiting_context','organizing','complete','failed','cancelled')),
  revision integer not null default 1 check (revision > 0),
  control_request_id uuid,
  control_error text,
  check (accepted_at is null or (audio_key is not null and storage_verified_at is not null)),
  check ((recorded_at is null) = (recorded_at_confidence = 'unknown')),
  unique (id, owner_email)
);
create index recordings_owner_created on public.recordings (owner_email, created_at desc, id desc);
alter table public.recordings enable row level security;
revoke all on public.recordings from public, anon, authenticated;
grant select, insert, update, delete on public.recordings to service_role;

create table public.recording_grants (
  recording_id uuid not null references public.recordings(id),
  member_email text not null check (member_email = lower(trim(member_email))),
  artifact text not null check (artifact in ('minutes','transcript','audio')),
  granted_by text not null,
  created_at timestamptz not null default now(),
  primary key (recording_id, member_email, artifact)
);
create index recording_grants_member on public.recording_grants (member_email, recording_id);
alter table public.recording_grants enable row level security;
revoke all on public.recording_grants from public, anon, authenticated;
grant select, insert, update, delete on public.recording_grants to service_role;

create table public.recording_generations (
  id uuid primary key,
  owner_email text not null,
  request_key uuid not null,
  grouping text not null check (grouping in ('single','merged')),
  context_mode text not null check (context_mode in ('auto','manual','none')),
  selected_repositories jsonb not null default '[]'::jsonb check (jsonb_typeof(selected_repositories) = 'array'),
  pipeline_version text not null,
  state text not null default 'queued' check (state in ('queued','transcribing','awaiting_context','organizing','publishing','complete','failed','cancelled')),
  error_stage text check (error_stage in ('upload','transcription','context','organization','publication','notification')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (owner_email, request_key),
  unique (id, owner_email)
);
alter table public.recording_generations enable row level security;
revoke all on public.recording_generations from public, anon, authenticated;
grant select, insert, update, delete on public.recording_generations to service_role;

-- 複数録音は明示的に指定した順序で紐付ける。他人の録音は結合できない。
create table public.recording_generation_inputs (
  generation_id uuid not null,
  recording_id uuid not null,
  owner_email text not null,
  position integer not null check (position >= 0 and position < 10),
  primary key (generation_id, recording_id),
  unique (generation_id, position),
  foreign key (generation_id, owner_email) references public.recording_generations(id, owner_email),
  foreign key (recording_id, owner_email) references public.recordings(id, owner_email)
);
alter table public.recording_generation_inputs enable row level security;
revoke all on public.recording_generation_inputs from public, anon, authenticated;
grant select, insert, update, delete on public.recording_generation_inputs to service_role;

-- 録音だけの版と資料で補った版を別のページにする。全過去版に同じ依存を適用する。
create table public.recording_artifacts (
  id uuid primary key,
  generation_id uuid not null references public.recording_generations(id),
  kind text not null check (kind in ('minutes','transcript')),
  basis text not null check (basis in ('audio_only','repository_enriched')),
  page_id uuid not null unique references public.pages(id),
  repositories jsonb not null default '[]'::jsonb check (jsonb_typeof(repositories) = 'array'),
  created_at timestamptz not null default now(),
  check ((basis = 'audio_only' and repositories = '[]'::jsonb) or (basis = 'repository_enriched' and jsonb_array_length(repositories) > 0)),
  unique (generation_id, kind, basis)
);
alter table public.recording_artifacts enable row level security;
revoke all on public.recording_artifacts from public, anon, authenticated;
grant select, insert, update, delete on public.recording_artifacts to service_role;

create table public.recording_events (
  id uuid primary key,
  recording_id uuid not null references public.recordings(id),
  generation_id uuid references public.recording_generations(id),
  kind text not null check (kind in ('accepted','started','awaiting_connection','failed','resumed','completed','shared','unshared','trashed','restored','resume_requested','cancel_requested','context_requested')),
  actor_email text not null,
  created_at timestamptz not null default now(),
  request_key uuid not null,
  unique (recording_id, request_key)
);
alter table public.recording_events enable row level security;
revoke all on public.recording_events from public, anon, authenticated;
grant select, insert, update, delete on public.recording_events to service_role;

-- 所有者の操作を、通信が切れても専用サービスへ一度だけ適用する。
create table public.recording_commands (
  id uuid primary key,
  recording_id uuid not null references public.recordings(id),
  revision integer not null check (revision > 0),
  action text not null check (action in ('cancel','resume','context')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','applied','rejected','superseded')),
  error_code text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index recording_commands_pending on public.recording_commands(created_at,id) where status='pending';
alter table public.recording_commands enable row level security;
revoke all on public.recording_commands from public, anon, authenticated;
grant select, insert, update, delete on public.recording_commands to service_role;

-- 先に保護を有効にしてから関連付ける。関連付けが未完了なら閲覧を拒否する。
alter table public.pages add column recording_protected boolean not null default false;

-- db-contract: reviewed 新規録音表だけを操作し、所有者と版をロック下で照合する。既存ページと旧版の書き込みは変更しない。
create function public.change_recording_access(p_id uuid, p_owner text, p_revision integer, p_request uuid, p_action text, p_member text default null, p_artifacts jsonb default '[]'::jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare target public.recordings; next_kind text; one text;
begin
  select * into target from public.recordings where id = p_id and owner_email = p_owner for update;
  if not found then raise exception 'recording_not_found' using errcode = 'P0002'; end if;
  if exists(select 1 from public.recording_events where recording_id=p_id and request_key=p_request) then
    return jsonb_build_object('revision', target.revision);
  end if;
  if target.revision <> p_revision then raise exception 'recording_conflict' using errcode = '40001'; end if;
  if p_action = 'share' then
    if target.deleted_at is not null then raise exception 'recording_not_found' using errcode = 'P0002'; end if;
    if p_member is null or p_member !~ '^[^@[:space:]]+@example[.]co$' or p_member <> lower(trim(p_member)) then
      raise exception 'invalid_member' using errcode = '22023';
    end if;
    if jsonb_typeof(p_artifacts) <> 'array' then raise exception 'invalid_artifacts' using errcode = '22023'; end if;
    for one in select jsonb_array_elements_text(p_artifacts) loop
      if one not in ('minutes','transcript','audio') then raise exception 'invalid_artifact' using errcode = '22023'; end if;
    end loop;
    delete from public.recording_grants where recording_id=p_id and member_email=p_member;
    insert into public.recording_grants(recording_id,member_email,artifact,granted_by)
      select p_id,p_member,value,p_owner from (select distinct jsonb_array_elements_text(p_artifacts) as value) selected;
    next_kind := case when jsonb_array_length(p_artifacts)=0 then 'unshared' else 'shared' end;
  elsif p_action = 'trash' then
    if target.deleted_at is not null then raise exception 'already_trashed' using errcode = '22023'; end if;
    update public.recording_commands set status='superseded',resolved_at=now() where recording_id=p_id and status='pending';
    insert into public.recording_commands(id,recording_id,revision,action) values(p_request,p_id,target.revision+1,'cancel');
    update public.recordings set deleted_at=now(),state='cancelled',control_request_id=p_request,control_error=null where id=p_id;
    next_kind := 'trashed';
  elsif p_action = 'restore' then
    if target.deleted_at is null or target.deleted_at <= now() - interval '30 days' then raise exception 'restore_expired' using errcode = '22023'; end if;
    -- 復元は共有や重い処理を自動再開しない。
    delete from public.recording_grants where recording_id=p_id;
    update public.recordings set deleted_at=null where id=p_id;
    next_kind := 'restored';
  else
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  update public.recordings set revision=revision+1 where id=p_id;
  insert into public.recording_events(id,recording_id,kind,actor_email,request_key)
    values(p_request,p_id,next_kind,p_owner,p_request);
  return jsonb_build_object('revision', target.revision+1);
end;
$$;
revoke all on function public.change_recording_access(uuid,text,integer,uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.change_recording_access(uuid,text,integer,uuid,text,text,jsonb) to service_role;

-- db-contract: reviewed 新規の関連付けを保護済みの同じ所有者の社内ページだけに制限する。
create function public.guard_recording_artifact() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if not exists (
    select 1 from public.pages p join public.recording_generations g on g.id=new.generation_id
    where p.id=new.page_id and p.recording_protected and p.visibility='restricted' and p.created_by=g.owner_email
  ) then raise exception 'recording_page_not_protected' using errcode='23514'; end if;
  return new;
end;
$$;
-- db-contract: reviewed 新規の関連付け表だけで、保護必須の検査を実行する。
create trigger recording_artifact_guard before insert or update on public.recording_artifacts
for each row execute function public.guard_recording_artifact();

-- db-contract: reviewed 録音保護が既に有効なページだけを対象とし、通常ページと旧版の保存は変更しない。
create function public.guard_recording_page() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if old.recording_protected and (not new.recording_protected or new.visibility <> 'restricted' or new.created_by is distinct from old.created_by) then
    raise exception 'recording_protection_is_permanent' using errcode='23514';
  end if;
  if new.recording_protected and new.visibility <> 'restricted' then
    raise exception 'recording_page_must_be_private' using errcode='23514';
  end if;
  return new;
end;
$$;
-- db-contract: reviewed 保護済み録音ページの所有者と非公開設定だけを固定し、通常ページには作用しない。
create trigger recording_page_guard before update on public.pages for each row execute function public.guard_recording_page();
revoke all on function public.guard_recording_artifact() from public, anon, authenticated;
revoke all on function public.guard_recording_page() from public, anon, authenticated;
grant execute on function public.guard_recording_artifact() to service_role;
grant execute on function public.guard_recording_page() to service_role;

-- db-contract: reviewed 新規の生成元関連は追記だけとし、成果物作成後の追加も拒否する。削除は録音のゴミ箱で扱う。
create function public.freeze_recording_inputs() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if tg_op <> 'INSERT' then raise exception 'recording_inputs_immutable' using errcode='23514'; end if;
  perform 1 from public.recording_generations where id=new.generation_id for update;
  if exists(select 1 from public.recording_artifacts where generation_id=new.generation_id) then
    raise exception 'recording_inputs_published' using errcode='23514';
  end if;
  return new;
end;
$$;
-- db-contract: reviewed 新規表の原文対応を不変にし、公開済み本文から元録音だけ外せないようにする。
create trigger recording_inputs_frozen before insert or update or delete on public.recording_generation_inputs
for each row execute function public.freeze_recording_inputs();

-- db-contract: reviewed 新規成果物の参照元・種類・ページ対応を追記専用にする。
create function public.freeze_recording_artifact() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if tg_op <> 'INSERT' then raise exception 'recording_artifact_immutable' using errcode='23514'; end if;
  perform 1 from public.recording_generations where id=new.generation_id for update;
  if not exists(select 1 from public.recording_generation_inputs where generation_id=new.generation_id) then
    raise exception 'recording_artifact_requires_inputs' using errcode='23514';
  end if;
  return new;
end;
$$;
-- db-contract: reviewed 新規表の関連付けと生成元の追加を同じ生成のロックで直列化する。
create trigger recording_artifact_frozen before insert or update or delete on public.recording_artifacts
for each row execute function public.freeze_recording_artifact();
revoke all on function public.freeze_recording_inputs() from public, anon, authenticated;
revoke all on function public.freeze_recording_artifact() from public, anon, authenticated;
grant execute on function public.freeze_recording_inputs() to service_role;
grant execute on function public.freeze_recording_artifact() to service_role;

-- db-contract: reviewed 録音保護済みページだけ所有者の版を許可し、通常記事の投稿は変えない。
create function public.guard_recording_revision() returns trigger language plpgsql security invoker set search_path=public as $$
declare target public.pages;
begin
  select * into target from public.pages where id=new.page_id for update;
  if target.recording_protected and target.created_by is distinct from new.author_email then
    raise exception 'recording_revision_owner_required' using errcode='42501';
  end if;
  return new;
end;
$$;
-- db-contract: reviewed 認可確認後に録音保護が有効になっても他人の版を保存させない。通常記事には作用しない。
create trigger recording_revision_guard before insert on public.page_revisions for each row execute function public.guard_recording_revision();
revoke all on function public.guard_recording_revision() from public, anon, authenticated;
grant execute on function public.guard_recording_revision() to service_role;
