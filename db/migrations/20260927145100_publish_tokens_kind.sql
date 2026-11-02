-- 名乗りの鍵に「種類」を足す。足すだけの変更。
--
-- publish … 投稿コマンド（pages-publish login）で作る、投稿もできる鍵。いままでの鍵はすべてこれ。
-- app     … iOS アプリのログインで作る、読むこととコメントだけの鍵。投稿・素材の受け取り・
--            本文の取り寄せ・素材の凍結の入口（ownerFromRequest）では断る。
--
-- 既定を publish にしてあるので、いまある行も、この列を知らない古いサーバーが足す行も
-- 今までどおりの鍵のまま。種類の見分けはサーバー（lib/publish-tokens.ts）だけが行う。

alter table public.publish_tokens
  add column kind text not null default 'publish'
  constraint publish_tokens_kind_check check (kind in ('publish', 'app'));

comment on column public.publish_tokens.kind is
  '鍵の種類。publish は投稿もできる鍵、app は iOS アプリ用で投稿の入口では断る';
