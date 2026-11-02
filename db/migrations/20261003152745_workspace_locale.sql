-- workspace_locale: 個人設定の「言語」を控える列（多言語対応の基盤・docs/i18n.md）。
-- 空（NULL）は「自動」＝ブラウザの言語に合わせる。言語の名前の正本はアプリ側（lib/i18n/locales.ts）。
--
-- 足すだけの変更。既存の行はすべて NULL のまま（＝自動）で、下の縛りは NULL を通すので弾かれない。
-- 前の版のアプリはこの列を読まない・書かない（upsert は appearance の列だけを渡す）。
alter table public.workspace_preferences
  add column locale text check (locale in ('ja', 'en'));

comment on column public.workspace_preferences.locale is
  '画面の言語。NULL は自動（ブラウザの言語）。選べる値はアプリ側の lib/i18n/locales.ts と同じ';
