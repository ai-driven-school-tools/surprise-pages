-- 名乗りの鍵に期限を足す。足すだけの変更。
--
-- iOS アプリの鍵（kind = 'app'）は発行から 30 日で切れる。会社の Google アカウントを止めても
-- 電話の鍵だけで読み続けられる状態を残さないため。切れたらアプリはログインし直し、
-- そのときに Google と会社ドメインの判定をもう一度通る。
-- 投稿の鍵（kind = 'publish'）は空のまま＝今までどおり期限なし。期限の判定はサーバー
-- （lib/publish-tokens.ts の verifyToken）が照合のたびに行う。

alter table public.publish_tokens add column expires_at timestamptz;

comment on column public.publish_tokens.expires_at is
  '鍵の期限。空は期限なし（投稿の鍵）。iOS アプリの鍵は発行から 30 日';
