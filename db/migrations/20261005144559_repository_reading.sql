-- 登録したリポジトリの main にあるマークダウンを Pages の中で読む（1 段目「読む」）。
-- 足すだけの変更。正本は GitHub の main で、ここに置くのは表示のための写しと、文書の身元だけ。
-- 見てよいかは GitHub の権限だけで決める（lib/repository-access.ts）。この表に権限の材料は置かない。

-- 資料候補の登録に「Pages で読めるようにする」を足す。空（null）は今までどおり読めない。
alter table public.recording_repository_catalog add column pages_reading boolean;

-- リポジトリごとに、最後に突き合わせた main の先頭。目次はこの版に合わせてある。
create table public.repository_heads (
  repository_id bigint primary key,
  full_name text not null,
  branch text not null,
  head_commit text not null check (head_commit ~ '^[0-9a-f]{40}$'),
  committed_at timestamptz,
  author_name text,
  synced_at timestamptz not null default now()
);
alter table public.repository_heads enable row level security;
revoke all on public.repository_heads from public, anon, authenticated;
grant select, insert, update, delete on public.repository_heads to service_role;

-- 文書の身元。改名・移動しても id はそのままで、場所（path）だけが動く。
-- main から消えた文書は行を消さず、消えた印（deleted_at）を立てる（「main から削除されました」と言うため）。
-- 版は 2 つの印で持つ: 中身の指紋（blob_sha。git の blob の目印）と、そこに変わったコミット（changed_commit）。
create table public.repository_documents (
  id uuid primary key default gen_random_uuid(),
  repository_id bigint not null,
  path text not null check (char_length(path) between 1 and 1024),
  blob_sha text not null check (blob_sha ~ '^[0-9a-f]{40}$'),
  added_commit text not null,
  changed_commit text not null,
  deleted_at timestamptz,
  deleted_commit text,
  -- 最後に変えたのは「いつ・誰が」。開いたときに GitHub へ聞いた答えを、中身の指紋ごとに控える
  last_commit text,
  last_committed_at timestamptz,
  last_author_name text,
  last_info_blob text,
  -- 探すための写し（題・見出し・本文）。写した中身の指紋が indexed_blob
  title text,
  headings text,
  search_text text,
  indexed_blob text,
  updated_at timestamptz not null default now()
);
create unique index repository_documents_alive_path on public.repository_documents (repository_id, path) where deleted_at is null;
create index repository_documents_by_repository on public.repository_documents (repository_id, path);
alter table public.repository_documents enable row level security;
revoke all on public.repository_documents from public, anon, authenticated;
grant select, insert, update, delete on public.repository_documents to service_role;

-- 改名・移動の前の場所。古い URL を新しい場所へ進めるために使う。
create table public.repository_document_moves (
  repository_id bigint not null,
  old_path text not null check (char_length(old_path) between 1 and 1024),
  document_id uuid not null references public.repository_documents(id),
  moved_commit text not null,
  moved_at timestamptz not null default now(),
  primary key (repository_id, old_path)
);
alter table public.repository_document_moves enable row level security;
revoke all on public.repository_document_moves from public, anon, authenticated;
grant select, insert, update, delete on public.repository_document_moves to service_role;

-- 変換結果の控え。リポジトリ・中身の指紋・変換器の版の組ごとに 1 枚。中身が同じなら作り直さない。
create table public.repository_renders (
  repository_id bigint not null,
  blob_sha text not null check (blob_sha ~ '^[0-9a-f]{40}$'),
  renderer text not null,
  html text not null,
  title text not null,
  created_at timestamptz not null default now(),
  primary key (repository_id, blob_sha, renderer)
);
alter table public.repository_renders enable row level security;
revoke all on public.repository_renders from public, anon, authenticated;
grant select, insert, update, delete on public.repository_renders to service_role;

-- db-contract: reviewed 新しい表だけを読み書きする関数。main の木を 1 回の取引で目次へ写し、同じリポジトリの同期を順番に並べる。
create function public.apply_repository_tree(
  p_repository_id bigint,
  p_full_name text,
  p_branch text,
  p_expected_head text,
  p_head text,
  p_committed_at timestamptz,
  p_author_name text,
  p_files jsonb,
  p_moves jsonb
) returns boolean
language plpgsql security invoker set search_path = public as $$
declare
  current_head text;
  one jsonb;
  moving uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('repository_documents:' || p_repository_id::text, 107));
  select head_commit into current_head from repository_heads where repository_id = p_repository_id;
  -- 別の人が先に同じ main を写し終えていたら、何もしない（同じ木を 2 度写さない）
  if current_head is not distinct from p_head then return true; end if;
  -- 読んだときから先頭が動いていたら、古い木で上書きしない
  if current_head is distinct from p_expected_head then return false; end if;

  -- 1. 改名・移動。身元（id）はそのままで、場所だけを動かす。前の場所は古い URL のために控える
  for one in select value from jsonb_array_elements(p_moves) loop
    select id into moving from repository_documents
      where repository_id = p_repository_id and path = one->>'from' and deleted_at is null;
    if moving is not null and not exists (
      select 1 from repository_documents where repository_id = p_repository_id and path = one->>'to' and deleted_at is null
    ) then
      update repository_documents set path = one->>'to', updated_at = now() where id = moving;
      insert into repository_document_moves (repository_id, old_path, document_id, moved_commit)
        values (p_repository_id, one->>'from', moving, p_head)
        on conflict (repository_id, old_path) do update set document_id = excluded.document_id, moved_commit = excluded.moved_commit, moved_at = now();
    end if;
  end loop;

  -- 2. 中身が変わった文書は版を進める
  update repository_documents d set blob_sha = f.value->>'blob', changed_commit = p_head, updated_at = now()
    from jsonb_array_elements(p_files) f
    where d.repository_id = p_repository_id and d.deleted_at is null and d.path = f.value->>'path' and d.blob_sha <> f.value->>'blob';

  -- 3. 新しく現れた文書。その場所に古い移動の控えがあれば外す（いまはそこに別の文書がある）
  delete from repository_document_moves m using jsonb_array_elements(p_files) f
    where m.repository_id = p_repository_id and m.old_path = f.value->>'path'
      and not exists (select 1 from repository_documents d where d.repository_id = p_repository_id and d.path = f.value->>'path' and d.deleted_at is null);
  insert into repository_documents (repository_id, path, blob_sha, added_commit, changed_commit)
    select p_repository_id, f.value->>'path', f.value->>'blob', p_head, p_head from jsonb_array_elements(p_files) f
    where not exists (select 1 from repository_documents d where d.repository_id = p_repository_id and d.path = f.value->>'path' and d.deleted_at is null);

  -- 4. main から消えた文書。行は残し、消えた印を立てる
  update repository_documents d set deleted_at = now(), deleted_commit = p_head, updated_at = now()
    where d.repository_id = p_repository_id and d.deleted_at is null
      and not exists (select 1 from jsonb_array_elements(p_files) f where f.value->>'path' = d.path);

  insert into repository_heads (repository_id, full_name, branch, head_commit, committed_at, author_name, synced_at)
    values (p_repository_id, p_full_name, p_branch, p_head, p_committed_at, p_author_name, now())
    on conflict (repository_id) do update set full_name = excluded.full_name, branch = excluded.branch, head_commit = excluded.head_commit,
      committed_at = excluded.committed_at, author_name = excluded.author_name, synced_at = excluded.synced_at;
  return true;
end;
$$;
revoke all on function public.apply_repository_tree(bigint, text, text, text, text, timestamptz, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_repository_tree(bigint, text, text, text, text, timestamptz, text, jsonb, jsonb) to service_role;
