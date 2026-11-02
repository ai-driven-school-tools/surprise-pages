-- サーバーの接続（service_role）が使う表の権限を、Supabase の「新しい表を自動で公開する」設定に頼らず明示する。
-- 足すだけの変更。本番では既に同じ権限があるので何も変わらない。anon と authenticated には何も渡さない。
grant select, insert, update, delete on table
  public.access_requests, public.admins, public.cli_login_pending, public.deck_collaboration_events,
  public.deck_edit_processors, public.deck_theme_requests, public.deck_theme_versions, public.group_members,
  public.groups, public.page_comments, public.page_favorites, public.page_permissions, public.page_revisions,
  public.page_view_optouts, public.page_views, public.pages, public.pages_installation, public.publish_tokens,
  public.workspace_preferences
to service_role;
