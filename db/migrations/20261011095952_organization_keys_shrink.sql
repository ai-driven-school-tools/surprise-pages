-- organization_keys_shrink: 組織が 1 つの間だけ成り立つ「全体で一意」の古い縛りを外し、主キーを (organization_id, …) の組にする
-- （E1 の 2 本目。複数組織対応の「縮める」段）。組織ごとの縛りは A2（organization_scope の 3 節）と前のファイルで足してある。
--
-- 当てるのは A2 の版のアプリが本番に行き渡った後だけ（前の版のアプリは古い縛りを前提に on conflict を書いている）。
-- これを当てるまで、本番で 2 つ目の組織を作らない（docs/multi-organization.md）。
--
-- 縮めるもの:
--   - ページの呼び名（pages_page_slug_key）・まとまりの名前（groups_alive_name_key）・コメントの送り直しの目印（page_comments_request_key_idx）
--     … 全体で一意 → 組織の中で一意（索引は A2 と前のファイルで足し済み）
--   - 本人の設定・控えの表の主キー（人のアドレスだけ・文書の目印とアドレス・日付とアドレス）
--     … 両方の組織に入っている人が 2 つ目の組織で書くと重複で失敗していた（「あなたの番」の既読が 500）。A2 の組の索引を主キーに上げる
--       （主キーに上げると organization_id は NOT NULL になる。A2 で全行を埋めてあり、書く口は orgDb と org_ の関数だけ）
--   - 古い縛りの列の組で on conflict を書いた、組織を取らない古い関数（新しい版のアプリは org_ の関数だけを呼ぶ）
--     … 縛りが無くなると呼んだ瞬間に失敗する関数なので、残さず消す

-- ---------------------------------------------------------------------------
-- 1. 全体で一意の古い縛りを外す
-- ---------------------------------------------------------------------------
-- db-contract: reviewed 組織の中で一意の索引（pages_organization_slug_key）が残る。新しい版の書き込みは組織つきで、重複は組織の中でだけ起きる
alter table public.pages drop constraint pages_page_slug_key;
-- db-contract: reviewed 組織の中で一意の索引（groups_organization_alive_name_key）が残る
drop index public.groups_alive_name_key;
-- db-contract: reviewed 組織の中で一意の索引（page_comments_organization_request_key_idx・前のファイル）が残る。送り直しの照合は orgDb で組織を絞って引く
drop index public.page_comments_request_key_idx;

-- ---------------------------------------------------------------------------
-- 2. 主キーを (organization_id, …) の組にする（A2 の組の索引をそのまま主キーに上げる・名前は今までの主キーの名前）
-- ---------------------------------------------------------------------------
-- db-contract: reviewed 主キーを組織つきの組に替える。書く口（orgDb の upsert・org_mark_inbox_seen）は組の on conflict を使う
alter table public.inbox_reads drop constraint inbox_reads_pkey;
alter table public.inbox_reads add constraint inbox_reads_pkey primary key using index inbox_reads_organization_key;

-- db-contract: reviewed 主キーを組織つきの組に替える。書く口（lib/page-views.ts の orgDb の upsert）は組の on conflict を使う
alter table public.page_view_optouts drop constraint page_view_optouts_pkey;
alter table public.page_view_optouts add constraint page_view_optouts_pkey primary key using index page_view_optouts_organization_key;

-- db-contract: reviewed 主キーを組織つきの組に替える。書く口（lib/beta-features-store.ts の orgDb の upsert）は組の on conflict を使う
alter table public.beta_feature_optins drop constraint beta_feature_optins_pkey;
alter table public.beta_feature_optins add constraint beta_feature_optins_pkey primary key using index beta_feature_optins_organization_key;

-- db-contract: reviewed 主キーを組織つきの組に替える。書く口（org_consume_deck_image_search）は組の on conflict を使う
alter table public.deck_image_search_usage drop constraint deck_image_search_usage_pkey;
alter table public.deck_image_search_usage add constraint deck_image_search_usage_pkey primary key using index deck_image_search_usage_organization_key;

-- db-contract: reviewed 主キーを組織つきの組に替える。文書の目印は組織をまたいで同じ（GitHub の写し）なので、組織ごとに 1 行。書く口（org_record_repository_document_view）は組の on conflict を使う
alter table public.repository_document_views drop constraint repository_document_views_pkey;
alter table public.repository_document_views add constraint repository_document_views_pkey primary key using index repository_document_views_organization_key;

-- ---------------------------------------------------------------------------
-- 3. 古い縛りの列の組で on conflict を書いた、組織を取らない古い関数を消す（新しい版は org_ の形を呼ぶ・lib/tenant-tables.json）
-- ---------------------------------------------------------------------------
drop function public.mark_inbox_seen(text, timestamptz);
drop function public.consume_deck_image_search(date, text, integer, integer);
drop function public.record_repository_document_view(uuid, bigint, text, text, text);
drop function public.prepare_recording_output(text, uuid, jsonb, text, text, jsonb, jsonb, text, jsonb, text, text);
