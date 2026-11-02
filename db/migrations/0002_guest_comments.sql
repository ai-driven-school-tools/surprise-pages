-- 公開ページ（/p）に、ログインしていない人が名前だけで書けるようにする。
--
-- 書いた人の見分け方が 2 通りになる:
--   会社の人  … author_email（Google ログイン）
--   ゲスト    … guest_id（サーバーが発行し、署名付き cookie で持たせる目印）
-- どちらか一方は必ず入る。両方空の行は作らせない。

alter table public.page_comments
  alter column author_email drop not null;

alter table public.page_comments
  add column guest_id text;

alter table public.page_comments
  add constraint page_comments_author_present
  check (author_email is not null or guest_id is not null);

-- 自分のコメントかどうかの判定で毎回引くため
create index page_comments_guest_idx on public.page_comments (guest_id);

-- ページの呼び名に見せ方を含める（例: internal/example/hello / public/guide/intro）。
-- ここまでの行はすべて社内ページのものなので、頭に internal/ を付けて揃える。
update public.page_comments
   set page_slug = 'internal/' || page_slug
 where page_slug not like 'internal/%'
   and page_slug not like 'public/%';

-- resolved_by は「誰が解決にしたか」を画面に出すためだけの列。
-- ここから先は表示名を入れる（公開ページで会社のメールアドレスが外に出ないようにするため）。
comment on column public.page_comments.resolved_by is '解決にした人の表示名（識別子ではない）';
comment on column public.page_comments.guest_id is 'ログインしていない人の目印。署名付き cookie の中身と一致する';
