-- コメントの種類に「いいね」（good）を足す。
--
-- 直してほしさ（must / better / want）とは別口。選んだ文への肯定で、本文は無くてよい。
-- 呼び名も素材の置き場所も動かない。変わるのは page_comments.priority の縛りだけ。
--
-- 名前を変えるのではなく、drop → add で作り直す（check 制約は中身を足せない）。
-- 名前が違っていたらここで落ちる。黙って古い制約が残るより、落ちたほうがよい。

alter table public.page_comments
  drop constraint page_comments_priority_check;

alter table public.page_comments
  add constraint page_comments_priority_check
  check (priority in ('must', 'better', 'want', 'good'));
