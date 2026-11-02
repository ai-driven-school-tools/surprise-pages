-- organization_membership: 「会社の人か」をドメインではなく組織への所属で決めるための関数と番人を足す（複数組織対応の A4）。
-- 設計の正本は docs/multi-organization.md。足すだけで、既存の関数・表・行は 1 つも書き換えない。
--
-- 1. org_member_identity … 要求のたびに「この組織でのこの人の役割」を 1 回で読む（自動参加のドメインに合う人は、ここで所属を作る）
-- 2. 最後の持ち主（持ち主のいない組織では最後の管理者）を外させない番人（所属の名簿の側に付ける。0007 の admins の番人と同じ符号 ADMIN）
-- 3. 管理者を外した・役割を下げたときに、スライドの共同編集の部屋の顔ぶれを取り直す（admins の表に付けていたものと同じ扱い）
-- 4. org_change_recording_access … 録音の共有先を、直書きのドメインではなく組織の所属と自動参加のドメインで確かめる
--
-- 決まり（docs/db-migrations.md）
-- - 足す → 移す → 縮める の段を踏む。消す・名前を変える・NOT NULL を付けるは、別の PR に分ける（DB contract の関門が見る）
-- - 当てるのは CI（main に入るとステージングへ、本番は承認つきの実行で）。管理画面から手で当てない
-- - 前の版のアプリはこの関数を呼ばない（admins 表と change_recording_access を今までどおり使う）。admins 表を縮めるのは別の PR

-- ---------------------------------------------------------------------------
-- 1. 要求のたびに引く所属（lib/member-organization.ts が呼ぶ）
-- ---------------------------------------------------------------------------
-- 返すのは {"role": 役割 or null, "joined": 今回の呼び出しで所属を作ったか}。
--   有効な所属がある         → その役割
--   外した人                 → null（自動参加のドメインに合っていても戻さない。戻すのは人の操作だけ）
--   所属が無く、自動参加のドメインに合う → member で所属を作り、その役割（同時に作られても上書きしない）
--   それ以外                 → null
-- p_email は呼ぶ側が小文字・前後の空白なしにそろえて渡す。そろっていない値は「所属なし」として返す。
-- db-contract: reviewed 新しい関数を足すだけ（既存の関数を置き換えない）。書くのは所属の名簿への 1 行の追加（on conflict do nothing）だけで、既存の行を書き換えない。外した人を戻さない
create function public.org_member_identity(p_organization_id uuid, p_email text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  found_role text;
  found_status text;
  local_part text;
  domain_part text;
begin
  if p_organization_id is null or p_email is null or p_email <> lower(btrim(p_email)) then
    return jsonb_build_object('role', null, 'joined', false);
  end if;

  select m.role, m.status into found_role, found_status
    from public.organization_members m
   where m.organization_id = p_organization_id and m.email = p_email;
  if found then
    return jsonb_build_object('role', case when found_status = 'active' then found_role end, 'joined', false);
  end if;

  local_part := split_part(p_email, '@', 1);
  domain_part := substr(p_email, char_length(local_part) + 2);
  if local_part = '' or domain_part = '' or position('@' in domain_part) > 0 then
    return jsonb_build_object('role', null, 'joined', false);
  end if;
  if not exists (
    select 1 from public.organization_domains d
     where d.organization_id = p_organization_id and d.domain = domain_part and d.auto_join
  ) then
    return jsonb_build_object('role', null, 'joined', false);
  end if;

  insert into public.organization_members (organization_id, email, role, status)
  values (p_organization_id, p_email, 'member', 'active')
  on conflict (organization_id, email) do nothing;

  select m.role, m.status into found_role, found_status
    from public.organization_members m
   where m.organization_id = p_organization_id and m.email = p_email;
  return jsonb_build_object('role', case when found and found_status = 'active' then found_role end, 'joined', found);
end;
$$;

comment on function public.org_member_identity(uuid, text) is
  '要求のたびに引く所属（役割）。自動参加のドメインに合う人は member で所属を作る。外した人は戻さない。';

revoke all on function public.org_member_identity(uuid, text) from public, anon, authenticated;
grant execute on function public.org_member_identity(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. 最後の持ち主（持ち主のいない組織では最後の管理者）を外させない
-- ---------------------------------------------------------------------------
-- 外すのは行を消さず status を removed にする形（lib/organizations.ts）。役割を下げるのも同じ update で来る。
-- 持ち主のいる組織では「有効な持ち主が 0 人になる」変更を断り、持ち主がまだいない組織（いまの 最初の組織）では
-- 「有効な管理者が 0 人になる」変更を断る。持ち主を誰にするかは運営者の操作（B4）で決め、admin → owner の昇格は役割を変える口でできる。
-- 符号は 0007 の admins の番人と同じ ADMIN（lib/access-rows.ts の LAST_ADMIN）。アプリは「最後の 1 人」として断りを出す。
-- db-contract: reviewed 新しい関数を足すだけ。番人は断るだけで行を書き換えない（通すときは new / old をそのまま返す）
create function public.organization_members_keep_manager() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  stays_active boolean;
  next_role text;
  other_owners integer;
  other_managers integer;
begin
  if old.status <> 'active' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  stays_active := tg_op = 'UPDATE' and new.status = 'active'
    and new.organization_id = old.organization_id and new.email = old.email;
  next_role := case when stays_active then new.role else null end;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.organization_members:' || old.organization_id::text));

  select pg_catalog.count(*) filter (where m.role = 'owner'),
         pg_catalog.count(*) filter (where m.role in ('owner', 'admin'))
    into other_owners, other_managers
    from public.organization_members m
   where m.organization_id = old.organization_id and m.status = 'active' and m.email <> old.email;

  if old.role = 'owner' and next_role is distinct from 'owner' and other_owners = 0 then
    raise exception '最後の持ち主は外せません。先に別の人を持ち主にしてから、この人を外してください'
      using errcode = 'ADMIN';
  end if;

  if old.role = 'admin' and next_role is distinct from 'admin' and next_role is distinct from 'owner'
     and other_owners = 0 and other_managers = 0 then
    raise exception '最後の管理者は外せません。先に別の人を管理者にしてから、この人を外してください'
      using errcode = 'ADMIN';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

comment on function public.organization_members_keep_manager() is
  '所属の名簿から最後の持ち主（持ち主のいない組織では最後の管理者）が外れるのを拒む番人。';

revoke all on function public.organization_members_keep_manager() from public, anon, authenticated;

-- db-contract: reviewed 新しい表（A1 の organization_members）に番人を付けるだけ。既存の行は書き換えない
create trigger organization_members_keep_manager
  before update or delete on public.organization_members
  for each row execute function public.organization_members_keep_manager();

-- ---------------------------------------------------------------------------
-- 3. 管理者が外れた・役割が変わったら、スライドの共同編集の部屋の顔ぶれを取り直す
-- ---------------------------------------------------------------------------
-- 管理者かどうかは所属の役割で決まるようになった（admins 表は読まない）。admins 表に付けていた
-- admins_collaboration_audience と同じく、権限が減りうる変更（役割・状態の更新と削除）で部屋の合言葉を取り直す。
-- 所属が足されただけ（自動参加）では取り直さない（権限が減らないので、編集中の人を締め出す理由が無い）。
-- db-contract: reviewed 新しい関数を足すだけ。書くのは共同編集の部屋の合言葉（audience）の取り直しだけで、20260923132037 の rotate_deck_audience と同じ更新
create function public.rotate_deck_audience_for_organization() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_schema <> 'public' or tg_table_name <> 'organization_members' then
    raise exception 'invalid_trigger_context';
  end if;
  update public.deck_collaboration_rooms set audience = gen_random_uuid()
   where page_id in (select id from public.pages where deleted_at is null);
  return null;
end;
$$;

revoke all on function public.rotate_deck_audience_for_organization() from public, anon, authenticated;
grant execute on function public.rotate_deck_audience_for_organization() to service_role;

-- db-contract: reviewed 新しい表（A1 の organization_members）に、合言葉を取り直す後始末を付けるだけ
create trigger organization_members_collaboration_audience
  after update of role, status or delete on public.organization_members
  for each statement execute function public.rotate_deck_audience_for_organization();

-- ---------------------------------------------------------------------------
-- 4. 録音の共有先を組織の所属で確かめる（20260928035121 の change_recording_access の写し・確かめ方だけが違う）
-- ---------------------------------------------------------------------------
-- 共有先に入れてよいのは、その組織の有効な所属か、その組織の自動参加のドメインのアドレス（外した人を除く）だけ。
-- 前の版のアプリは今までどおり change_recording_access を呼ぶ（消すのは別の PR）。
-- db-contract: reviewed 新しい名前の関数を足すだけ（既存の change_recording_access は置き換えない）。所有者と版をロック下で照合する作りは元の関数と同じ
create function public.org_change_recording_access(p_organization_id uuid, p_id uuid, p_owner text, p_revision integer, p_request uuid, p_action text, p_member text default null, p_artifacts jsonb default '[]'::jsonb)
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
    if p_member is null or p_member <> lower(btrim(p_member)) or p_member !~ '^[^@[:space:]]+@[^@[:space:]]+$' or p_organization_id is null
       or not (
         exists (select 1 from public.organization_members m
                  where m.organization_id = p_organization_id and m.email = p_member and m.status = 'active')
         or (
           exists (select 1 from public.organization_domains d
                    where d.organization_id = p_organization_id and d.auto_join and d.domain = split_part(p_member, '@', 2))
           -- 外した人は、自動参加のドメインに合っていても共有先にしない（名乗りでも自動では戻らない）
           and not exists (select 1 from public.organization_members r
                            where r.organization_id = p_organization_id and r.email = p_member and r.status = 'removed')
         )
       ) then
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
revoke all on function public.org_change_recording_access(uuid,uuid,text,integer,uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.org_change_recording_access(uuid,uuid,text,integer,uuid,text,text,jsonb) to service_role;
