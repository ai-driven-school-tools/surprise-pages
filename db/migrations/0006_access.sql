-- ページごとの「見てよい人」の名簿。
--
-- ここまでの見せ方は 2 通りだけだった:
--   internal … 会社の人なら誰でも見られる
--   public   … 門が無く、誰でも見られる
-- ここに 3 通り目「restricted（会社の中でも、名簿に載った人だけ）」を足す。
--
-- 名簿は 4 つの表に分けて持つ:
--   groups           … 人のまとまり（例: 経営会議）
--   group_members    … そのまとまりに誰が入っているか
--   page_permissions … どのページを、誰（個人 / まとまり）に見せるか
--   access_requests  … 見せてほしいという申し出（承認 / 却下でしまう）
-- これに、誰でも開けられる管理者の名簿（admins）を足した 5 つ。
--
-- 読み書きはサービスロール（サーバー）経由のみ。行を守るのは Route Handler の判定。
-- 0004 と同じ流儀で、RLS は有効にしてポリシーは作らない（anon からは何も見えない）。

-- ---------------------------------------------------------------------------
-- 1. 見せ方に「restricted」を足す
-- ---------------------------------------------------------------------------
--
-- 制限を付けても**呼び名は `internal/...` のまま、URL も `/i/...` のまま**にする。
-- 変わるのは visibility の列 1 つだけ。
--
-- 呼び名まで `restricted/...` へ動かすと、制限を付けるたびに
--   ・ページの呼び名（pages.page_slug）
--   ・素材の置き場所（`<見せ方>/<呼び名>/...`。過去の版の凍結先も全部）
--   ・コメントの page_slug
-- を一斉に引っ越すことになる。外すときはその逆をやる。
-- 貼ったリンクも切れる。制限は付けたり外したりするものなので、
-- 「列を 1 つ書き換えるだけ」で終わる形にしておく。
--
-- 名前を変えるのではなく、drop → add で作り直す（check 制約は中身を足せない）。
-- 名前が違っていたらここで落ちる。黙って古い制約が残るより、落ちたほうがよい。
alter table public.pages
  drop constraint pages_visibility_check;

alter table public.pages
  add constraint pages_visibility_check
  check (visibility in ('internal', 'public', 'restricted'));

comment on column public.pages.visibility is
  'ページの見せ方。internal = 会社の人なら誰でも / restricted = 名簿に載った人だけ / public = 門なし公開。'
  'restricted でも呼び名と URL は internal のまま（制限の付け外しで引っ越しをしないため）';

-- ---------------------------------------------------------------------------
-- 2. 人のまとまり
-- ---------------------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by text,
  created_at timestamptz not null default now(),
  -- 消しても行は残す。過去の許可が何を指していたか分からなくならないように
  deleted_at timestamptz
);

comment on table public.groups is '人のまとまり（例: 経営会議）。ページの許可はここ 1 つに対して出せる';
comment on column public.groups.created_by is '作った人のメールアドレス';
comment on column public.groups.deleted_at is '消した印。行は残す（許可の行が指している先が消えないように）';

-- 同じ名前のまとまりを 2 つ作らせない。ただし**生きているものの中だけ**で見る。
-- 消した印が立ったものまで数えると、同じ名前で作り直せなくなる。
-- 大文字小文字の違いは同じ名前として扱う（「経営会議」と「経営会議 」の取り違えを減らす）。
create unique index groups_alive_name_key on public.groups (lower(name)) where deleted_at is null;

create table public.group_members (
  group_id uuid not null references public.groups(id),
  member_email text not null check (member_email = lower(member_email)),
  added_by text,
  added_at timestamptz not null default now(),
  -- 同じ人を 2 回入れられない
  primary key (group_id, member_email)
);

comment on table public.group_members is 'まとまりに入っている人。メールアドレスは小文字で入れる（判定は lib/access.ts が揃える）';
comment on column public.group_members.added_by is '入れた人のメールアドレス';

-- 「この人が入っているまとまり」を引く向き。可否の判定はこちらから辿る
create index group_members_email_idx on public.group_members (member_email);

-- ---------------------------------------------------------------------------
-- 3. ページごとの許可
-- ---------------------------------------------------------------------------
create table public.page_permissions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id),
  -- 相手が「個人」か「まとまり」か
  grantee_kind text not null check (grantee_kind in ('member', 'group')),
  member_email text check (member_email = lower(member_email)),
  group_id uuid references public.groups(id),
  added_by text,
  added_at timestamptz not null default now(),
  -- 相手はどちらか片方だけ。両方入った行や、どちらも空の行を作らせない
  -- （両方入っていると「誰に出した許可か」が読む側の解釈で変わってしまう）
  constraint page_permissions_one_grantee check (
    (grantee_kind = 'member' and member_email is not null and group_id is null)
    or (grantee_kind = 'group' and group_id is not null and member_email is null)
  )
);

comment on table public.page_permissions is
  'restricted のページを見てよい相手。個人 1 人か、まとまり 1 つを 1 行で指す。'
  '取り消しは行を消す（「いま誰が見られるか」の名簿なので、消した印を残すと判定が読めなくなる）';
comment on column public.page_permissions.grantee_kind is '相手の種類。member = 個人 / group = まとまり';

-- 同じ相手を 2 回足せない。相手の種類ごとに 1 本ずつ張る
-- （1 本の unique(page_id, member_email, group_id) では、空の列があるぶん重複が通ってしまう）
create unique index page_permissions_member_key
  on public.page_permissions (page_id, member_email) where grantee_kind = 'member';
create unique index page_permissions_group_key
  on public.page_permissions (page_id, group_id) where grantee_kind = 'group';

-- 共有の設定画面で「このページの許可を新しい順に」引く
create index page_permissions_page_idx on public.page_permissions (page_id, added_at desc);

-- ---------------------------------------------------------------------------
-- 4. 見せてほしいという申し出
-- ---------------------------------------------------------------------------
create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id),
  requester_email text not null check (requester_email = lower(requester_email)),
  requester_name text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text,
  -- 未処理は null。承認は true、却下は false
  approved boolean,
  -- 「しまった印」と「答え」は必ず一緒に立つ
  constraint access_requests_resolved_pair check ((resolved_at is null) = (approved is null))
);

comment on table public.access_requests is '見せてほしいという申し出。承認しても許可の行は自動では増えない（人が足す）';
comment on column public.access_requests.approved is '未処理は NULL。承認 = true / 却下 = false';

-- 同じ人が同じページに、未処理の申し出を 2 つ持てない
-- （しまったあとなら、もう一度お願いできる）
create unique index access_requests_pending_key
  on public.access_requests (page_id, requester_email) where resolved_at is null;

-- 「このページの未処理の申し出を新しい順に」引く
create index access_requests_pending_idx
  on public.access_requests (page_id, created_at desc) where resolved_at is null;

-- ---------------------------------------------------------------------------
-- 5. 管理者
-- ---------------------------------------------------------------------------
-- メールアドレスは必ず小文字で入れる。
--
-- 判定は「入っている値と、聞かれた値を突き合わせる」だけなので、
-- 片方が大文字混じりだと**静かに外れる**（許可したはずの人が入れない、
-- あるいは名簿から外したはずの人が入れる）。揃えるのを書く側の心がけに任せず、
-- ここで入り口を塞ぐ。揃っていない値は insert の時点で落ちる。
create table public.admins (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);

comment on table public.admins is '全部のページを開けられる人。ここに載っている人は restricted も素通しになる';

-- 最初の 1 人。ここが空だと、誰も restricted のページを助けられなくなる
insert into public.admins (email) values ('owner@example.com') on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 6. 可否の材料を 1 回で取る
-- ---------------------------------------------------------------------------
--
-- restricted のページを開くたびに「管理者か」「個人として許可されているか」
-- 「入っているまとまりが許可されているか」を別々に聞きに行くと、
-- 1 枚めくるだけで往復が 3 回になる。まとめて 1 回で返す。
--
-- security definer は付けない（呼んだ人の権限のまま動く）。
-- サービスロール以外から呼ばれても、表側の RLS で 1 行も見えないので false が返る。
create function public.page_access_facts(p_page_id uuid, p_email text)
returns table (is_admin boolean, is_granted boolean)
language sql
stable
set search_path = ''
as $$
  select
    exists (
      select 1 from public.admins a where a.email = lower(p_email)
    ) as is_admin,
    exists (
      select 1
      from public.page_permissions p
      -- まとまり経由の許可は、そのまとまりが**生きているときだけ**通す。
      -- ここを見ないと「まとまりを消したのに、そこ経由で見えたまま」になる。
      -- 消す人は「もう見えなくなった」と思っているので、いちばん危ない食い違い。
      left join public.groups g
        on g.id = p.group_id and g.deleted_at is null
      left join public.group_members m
        on m.group_id = g.id
      where p.page_id = p_page_id
        and (
          (p.grantee_kind = 'member' and p.member_email = lower(p_email))
          or (p.grantee_kind = 'group' and m.member_email = lower(p_email))
        )
    ) as is_granted;
$$;

comment on function public.page_access_facts(uuid, text) is
  'restricted のページの可否に要る材料を 1 回で返す（管理者か / 許可されているか）。'
  '判定そのものは lib/access.ts が持つ';

-- 呼べるのはサーバー（サービスロール）だけにしておく
revoke all on function public.page_access_facts(uuid, text) from public;
grant execute on function public.page_access_facts(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. 鍵をかける
-- ---------------------------------------------------------------------------
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.page_permissions enable row level security;
alter table public.access_requests enable row level security;
alter table public.admins enable row level security;
-- ポリシーは意図的に作らない（0004 と同じ流儀。サービスロール経由のみ・anon は全拒否）
