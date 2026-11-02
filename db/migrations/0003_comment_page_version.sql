-- コメントが「どの版の本文に対して付いたか」を残す。
--
-- 本文の履歴そのものは git が正本なので、ここに持つのは版の目印（コミットの sha）だけ。
-- 文章の写しは置かない。二重に持つと、git と食い違ったときにどちらが本当か分からなくなる。
--
-- 空でもよい。履歴を引く鍵が無い環境や、git 側が読めなかったときは空のまま入る
-- （コメントが保存できないほうが困るため、版が取れないことを失敗にはしない）。
alter table public.page_comments
  add column page_version text;

comment on column public.page_comments.page_version is
  'コメントが付いたときのページの版（git のコミット sha）。取得できなければ NULL';
