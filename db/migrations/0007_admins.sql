-- 管理者の名簿（admins）を、画面から足し引きできるものにする。
--
-- 0006 では最初の 1 人を insert で入れただけだった。ここに 2 つ足す:
--   誰が入れたか … added_by（最初の 1 人は NULL。あとから遡って埋めない）
--   0 人にしない … 番人（トリガ）で、最後の 1 人を外すのを拒む
--
-- 管理者が 0 人になると、restricted のページを誰も助けられなくなる。
-- 名簿から自分を外すのは正しい操作なので入口では止められない。数えるのはデータベース側でやる。
--
-- 消す印（deleted_at）は置かない。管理者は「いま誰か」だけが要る名簿で、
-- 消した印を残すと「載っているが効いていない行」ができ、数える側が必ず読み違える
-- （page_permissions を消す印にしなかったのと同じ理由）。

-- ---------------------------------------------------------------------------
-- 1. 誰が管理者にしたか
-- ---------------------------------------------------------------------------
-- 隣（groups.created_by / group_members.added_by）に揃える。
-- あちらと同じく lower() の check は付けない（判定に使う列ではなく、画面に出すだけのため）。
alter table public.admins
  add column added_by text;

comment on column public.admins.added_by is '管理者にした人のメールアドレス。最初の 1 人は NULL';

-- ---------------------------------------------------------------------------
-- 2. 0 人にしない番人
-- ---------------------------------------------------------------------------
-- UPDATE は全面で拒む。
--   `update admins set email = '別人'` は「件数は 1 のまま管理者だけが入れ替わる」ので、
--   数を数える番人をすり抜ける。名簿にできることを「足す」「外す」の 2 つに絞れば、
--   数えるだけで 0 人を防げる。入れ替えたい人は、足してから外せばよい。
--
-- DELETE は残りが 1 人のときだけ拒む。
--   数える前に錠を取る。取らないと「2 人を別々に外す」が同時に走ったとき、
--   どちらも「まだ 2 人いる」と読んで両方通り、0 人になる。
--   錠はこの表 1 つぶんの合言葉で取るので、管理者の足し引きどうしだけが順番待ちになる。
--   `delete from admins;` のように 1 文でまとめて消す場合も止まる（実測）。
--   行ごとに呼ばれる番人は、同じ文で先に消えた行を「もう無い」と見るので、
--   最後の 1 行の番になったところで残り 1 人と数えて拒む。文全体が取り消される。
--
-- 拒むときの SQLSTATE は自前の 'ADMIN'。
-- 既定の P0001 は plpgsql のすべての raise に付くので、呼ぶ側が「0 人を止められた」のか
-- 「別の何かが壊れた」のかを見分けられない。
create function public.forbid_admin_shrink() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  remaining integer;
begin
  if tg_op = 'UPDATE' then
    raise exception '管理者の名簿は書き換えられません（足すか外すかの 2 つだけです）。入れ替えたいときは、先に新しい人を足してから古い人を外してください'
      using errcode = 'ADMIN';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.admins'));

  select pg_catalog.count(*) into remaining from public.admins;
  if remaining <= 1 then
    raise exception '管理者を 0 人にはできません。先に別の人を管理者に足してから、この人を外してください'
      using errcode = 'ADMIN';
  end if;

  -- BEFORE DELETE で NULL を返すと削除そのものが取り消される。通すときは old を返す
  return old;
end;
$$;

comment on function public.forbid_admin_shrink() is
  '管理者の名簿から最後の 1 人が消えるのを拒み、書き換えも拒む番人。0007 で導入';

create trigger admins_keep_at_least_one
  before update or delete on public.admins
  for each row execute function public.forbid_admin_shrink();
