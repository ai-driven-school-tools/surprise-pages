-- read_aloud_preferences: 個人設定の「読み上げ」（声と速さ）を控える列。
-- 選べる声と速さの正本はアプリ側（lib/read-aloud-settings.ts）。ここでは形だけを縛る。
--
-- 足すだけの変更。既存の行はすべて NULL のまま（＝既定の声・等速）で、下の縛りは NULL を通すので弾かれない。
-- 前の版のアプリはこの列を読まない・書かない（upsert は appearance / locale の列だけを渡す）。
-- db-contract: reviewed 縛りは今回足す 2 列（NULL 可・既定なし）だけに掛かる。既存の行は NULL のままで通り、前の版のアプリはこの 2 列を書かないので弾かれない
alter table public.workspace_preferences
  add column read_aloud_voice text check (char_length(read_aloud_voice) between 1 and 40),
  add column read_aloud_rate numeric(3, 2) check (read_aloud_rate between 0.5 and 3);

comment on column public.workspace_preferences.read_aloud_voice is
  '自然な声の読み上げ（ベータ機能 natural-voice）の声の名前。NULL は既定の声。選べる名前はアプリ側の lib/read-aloud-settings.ts';
comment on column public.workspace_preferences.read_aloud_rate is
  '読み上げの速さ。NULL は等速。選べる段はアプリ側の lib/read-aloud-settings.ts';
