-- 「自分が書いたコメント」を引くための索引。
--
-- /me（見たページとコメント）の 2 つめの節が、書いた人で絞って新しい順に引く。
-- いまある索引は 2 本だけで、どちらもこの向きには効かない:
--
--   page_comments_page_idx  (page_slug, created_at) … 1 ページ分のコメントを古い順に
--   page_comments_guest_idx (guest_id)              … ゲストの目印から
--
-- ゲストの分は既にある索引に乗るので、足りていないのは**会社の人の分**（author_email）
-- だけ。無いままだと、1 人が画面を開くたびに表を丸ごとなめることになる。
--
-- 新しい順に上限で切って引くので、時刻まで索引に含める（desc も揃える）。
-- 消した印の立っている行は読む口が必ず外すため、索引にも入れない（部分索引）。
-- 一覧に出す行だけを持つぶん索引が小さくなり、消したコメントが増えても太らない。
create index page_comments_author_idx
  on public.page_comments (author_email, created_at desc)
  where deleted_at is null;

comment on index public.page_comments_author_idx is
  '自分が書いたコメントを新しい順に引く向き（/me の 2 つめの節）。'
  '消した印の立っている行は入れない（読む口が必ず外すため）';
