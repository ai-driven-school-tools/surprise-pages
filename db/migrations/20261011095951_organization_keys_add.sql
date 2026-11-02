-- organization_keys_add: 組織が 1 つの間だけ成り立つ「全体で一意」の縛りを縮める前に、組織ごとの縛りを先にそろえる（E1 の 1 本目）。
-- 次のファイル（organization_keys_shrink）で古い縛りを外す。足す → 縮める の順は docs/multi-organization.md の「縮める段（E1）」。
--
-- A2（20261008170329_organization_scope.sql の 3 節）で、呼び名・まとまりの名前・本人の設定の表には (organization_id, …) の一意の索引を
-- 足してある。足りないのはコメントの送り直しの目印（request_key）だけなので、ここで同じ形の索引を足す。

-- db-contract: reviewed 古い索引（author_email, request_key）が一意なので、組織を前に足した組も既存の行で必ず一意（弾く行が無い）
create unique index page_comments_organization_request_key_idx
  on public.page_comments (organization_id, author_email, request_key)
  where request_key is not null;
