-- コメントの投稿に「一度きりの目印」を足す。足すだけの変更。
--
-- iOS アプリは電波の弱い場所で投稿を送り直すことがある。送り直しのたびに 1 件増えないよう、
-- アプリの窓口（POST /api/v1/pages/{slug}/comments）は Idempotency-Key ヘッダの値をここに残し、
-- 同じ人・同じ目印の 2 回目は足さずに最初の 1 件を返す（lib/comments.ts の createCommentOnce）。
--
-- - 目印は**人ごとに一意**（書いた人のアドレスとの組で一意）。他人が同じ値を使ってもぶつからない。
-- - ブラウザの道具箱（/api/comments）と、この列を知らない古いサーバーは何も入れない（null のまま）。
--   null の行は索引に入れないので、いまある行にも今までの投稿にも影響しない。
-- - 目印は応答に載せない。読む口（COLUMNS）にも入れていない。

alter table public.page_comments
  add column request_key text
  constraint page_comments_request_key_shape check (request_key is null or request_key ~ '^[A-Za-z0-9_-]{16,128}$');

create unique index page_comments_request_key_idx
  on public.page_comments (author_email, request_key)
  where request_key is not null;

comment on column public.page_comments.request_key is
  'アプリの投稿の一度きりの目印（Idempotency-Key）。同じ人・同じ目印の送り直しで 2 件目を作らない。応答には載せない';
