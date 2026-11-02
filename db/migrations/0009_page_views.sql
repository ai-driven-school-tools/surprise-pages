-- 「誰が、どのページを、いつ見たか」の控え。**本人が自分の分を見返すためだけ**に置く。
--
-- 出口は /me（見たページとコメント）1 つきりで、他人の分を見る画面も、
-- 「このページを何人が見たか」を数える画面も作らない。作った人が見たがるのは分かるが、
-- それはアクセス解析という別の機能で、集める目的も、断られたときに何が起きるかも違う。
-- 混ぜた瞬間に、この表は「本人のための控え」から「見張りの記録」に変わる。
--
-- 積むのは社内ページ（と、会社の人としてログイン中に開いた公開ページ）だけ。
-- 名乗っていない人が公開ページを見た分は**ブラウザの中にしか残さない**
-- （社外の人に、閲覧を追う目印を無言で配らないため。lib/viewed-pages.ts）。
--
-- ## この表の 3 つの決めごと
--
--   1 人 1 ページ 1 行 … 訪問のたびに積まない。同じページが時系列で何十行も並ぶ一覧は
--                        読み返す道具にならない。要るのは「最後に見たのはいつか」と「何回見たか」
--   小文字のアドレス   … 大文字混じりが 1 回でも入ると同じ人が 2 行に割れ、
--                        「1 人 1 ページ 1 行」という前提そのものが崩れる（0006 の名簿と同じ流儀）
--   消すのは物理削除   … 消した印を立てる方式にしない。閲覧の記録は本人のプライバシーの控えで、
--                        「消した」のに保管庫に残っているのは約束を破ることになる。
--                        印の方式が守っているのは「あとから取り戻せること」だが、
--                        ここは取り戻す価値より、消える確かさのほうが重い
--
-- 読み書きはサービスロール（サーバー）経由のみ。行を守るのは Route Handler の判定。
-- 0004 / 0006 と同じ流儀で、RLS は有効にしてポリシーは作らない（anon からは何も見えない）。

-- ---------------------------------------------------------------------------
-- 1. 見たページの控え
-- ---------------------------------------------------------------------------
--
-- **ページを消しても、この行は自動では消えない。** ページの削除は「消した印を立てる」方式
-- （0004。行そのものは残る）なので、`on delete cascade` を書いても一生発火しない。
-- 書けば「消えるはず」と読めてしまうぶん、無いほうが正しい。
-- 一覧では消した印の立ったページが絞り込みで自然に落ちるので画面には出ないが、
-- **行そのものは 90 日の掃除まで残る**（下の 3）。すぐに消したいなら、
-- ページを消すときに対応する行も明示的に消す処理を足すこと。
create table public.page_views (
  page_id uuid not null references public.pages(id),
  viewer_email text not null check (viewer_email = lower(viewer_email)),
  last_viewed_at timestamptz not null default now(),
  view_count integer not null default 1 check (view_count > 0),
  -- 同じ人が同じページで 2 行を持たない
  primary key (page_id, viewer_email)
);

comment on table public.page_views is
  '見たページの控え（1 人 1 ページ 1 行）。本人が /me で見返すためだけのもので、'
  'ページ側から「誰が何回見たか」を数える口は作らない。'
  'ページを消してもこの行は残る（削除は消した印を立てる方式なので繋がりでは消えない）。'
  '古い行は 90 日の掃除（/api/cron/views）で物理削除する';
comment on column public.page_views.viewer_email is
  '見た人のメールアドレス。必ず小文字（大文字混じりが入ると同じ人が 2 行に割れる）';
comment on column public.page_views.last_viewed_at is '最後に見た時刻。掃除の物差しであり、一覧の並び順でもある';
comment on column public.page_views.view_count is '何回見たか。画面では 2 回目から出す（1 回なら添えない）';

-- 「この人が見たページを、最後に見た順に」引く向き。/me はこの 1 本だけを使う。
-- 掃除（last_viewed_at で古い行を消す）もこの索引の後ろ半分に乗る
create index page_views_by_viewer on public.page_views (viewer_email, last_viewed_at desc);

-- ---------------------------------------------------------------------------
-- 2. 「記録を残さない」を選んだ人
-- ---------------------------------------------------------------------------
--
-- 名簿ではなく**本人の意思表示**なので、1 人 1 行だけ持つ。載っている人の行は
-- 下の関数が最初から積まない。行を消したいときは、この表から外す（印は立てない）。
--
-- いまブラウザ側にも同じ名前の設定がある（lib/viewed-pages.ts の VIEWED_OFF_KEY）。
-- あちらは「そのブラウザから送らない」ための足止めで、こちらは「万一届いても積まない」ための
-- 最後の砦。**画面からここへ設定を入れる道は、消す操作と同じ段で繋ぐ**（それまでは空のまま）。
create table public.page_view_optouts (
  viewer_email text primary key check (viewer_email = lower(viewer_email)),
  added_at timestamptz not null default now()
);

comment on table public.page_view_optouts is
  '見たページを控えないでほしい人。ここに載っている間、record_page_view は 1 行も積まない';

-- ---------------------------------------------------------------------------
-- 3. 記録を 1 回の往復で終わらせる
-- ---------------------------------------------------------------------------
--
-- 手前で「残さない設定が入っているか」を確かめてから積むと、往復が 1 回増えるうえ、
-- **確かめてから積むまでの隙間**が残る。1 文にまとめれば、設定が入っている人の行が
-- 万一にも増えないことを表の側で保証できる（0006 の page_access_facts と同じ考え方で、
-- あちらは「材料を 1 回で取る」、こちらは「確かめと積み増しを 1 回で済ませる」）。
--
-- security definer は付けない（呼んだ人の権限のまま動く）。サービスロール以外から
-- 呼ばれても、表側の RLS で 1 行も見えないので何も起きない。
create function public.record_page_view(p_page_id uuid, p_email text)
returns void
language sql
volatile
set search_path = ''
as $$
  insert into public.page_views (page_id, viewer_email)
  select p_page_id, lower(p_email)
  where not exists (
    select 1 from public.page_view_optouts o where o.viewer_email = lower(p_email)
  )
  on conflict (page_id, viewer_email) do update
    set last_viewed_at = now(),
        view_count = page_views.view_count + 1;
$$;

comment on function public.record_page_view(uuid, text) is
  'このページを見たことを 1 回の往復で控える。「残さない」設定が入っている人には 1 行も積まない。'
  '同じページを見直したときは行を増やさず、最後に見た時刻と回数だけを進める';

-- 呼べるのはサーバー（サービスロール）だけにしておく
revoke all on function public.record_page_view(uuid, text) from public;
grant execute on function public.record_page_view(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. 鍵をかける
-- ---------------------------------------------------------------------------
alter table public.page_views enable row level security;
alter table public.page_view_optouts enable row level security;
-- ポリシーは意図的に作らない（0004 / 0006 と同じ流儀。サービスロール経由のみ・anon は全拒否）
