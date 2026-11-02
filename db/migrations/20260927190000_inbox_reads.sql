-- アプリのホームの「あなたの番」（GET /api/v1/inbox）で、返信と共有を「まだ見ていないもの」に
-- 絞るための記録（の決定 2）。**足すだけ**の変更で、既にある表と行には触らない。
--
-- 持つのは「どこまで見たか」の時刻 1 つだけ（1 人 1 行・アドレスは小文字）。どの返信を見たかを
-- 1 件ずつは持たない。端末をまたいで 1 件ずつ合わせる必要が出たら、そのとき表を足す。
--
-- 書くのは既読にする窓口（POST /api/v1/inbox/seen）だけ。読むだけの GET では書き換えない
-- （開いただけで既読になると、通信が途中で切れた返事や、裏での読み直しで見落としが生まれる）。

create table public.inbox_reads (
  viewer_email text primary key check (viewer_email = lower(viewer_email)),
  seen_until timestamptz not null,
  updated_at timestamptz not null default now()
);

comment on table public.inbox_reads is
  '「あなたの番」をどこまで見たか（1 人 1 行）。この時刻より後の返信・共有を「まだ見ていない」とする。'
  '本人の既読の控えなので、ページ側から誰が見たかを数える口は作らない';
comment on column public.inbox_reads.viewer_email is '見た人のメールアドレス。必ず小文字（大文字混じりが入ると同じ人が 2 行に割れる）';
comment on column public.inbox_reads.seen_until is 'ここまで見た時刻。前へしか進まない（mark_inbox_seen）';

alter table public.inbox_reads enable row level security;
revoke all on public.inbox_reads from public, anon, authenticated;
grant all on public.inbox_reads to service_role;

-- 既読の時刻を 1 往復で進める。**戻さない**（2 台の端末が前後して送っても、新しいほうが残る）。
-- 未来の時刻は今に切り詰める（端末の時計がずれていても、まだ来ていない返信を既読にしない）。
create function public.mark_inbox_seen(p_email text, p_until timestamptz)
returns table (seen_until timestamptz)
language sql
volatile
security invoker
set search_path = ''
as $$
  insert into public.inbox_reads as r (viewer_email, seen_until, updated_at)
  values (lower(p_email), least(p_until, now()), now())
  on conflict (viewer_email) do update
    set seen_until = greatest(r.seen_until, excluded.seen_until),
        updated_at = now()
  returning r.seen_until;
$$;

comment on function public.mark_inbox_seen(text, timestamptz) is
  '「あなたの番」をどこまで見たかを進める。前へしか進まず、未来の時刻は今に切り詰める';

revoke all on function public.mark_inbox_seen(text, timestamptz) from public, anon, authenticated;
grant execute on function public.mark_inbox_seen(text, timestamptz) to service_role;

-- 「この時刻より後に付いた返信」を新しい順に引く向き（自分のコメントへの返信を探す）。
-- 親コメントの行と消した印の立っている行は入れない（読む口が必ず外すため）
create index page_comments_reply_recent_idx
  on public.page_comments (created_at desc)
  where parent_id is not null and deleted_at is null;

-- 「このページの未解決の親コメント」を引く向き（自分のページの未解決を数える）
create index page_comments_open_top_idx
  on public.page_comments (page_slug, created_at desc)
  where parent_id is null and resolved_at is null and deleted_at is null;
