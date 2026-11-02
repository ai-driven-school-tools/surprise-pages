-- organization_settings: 組織ごとの秘密の鍵（Gemini の鍵など）を封をして預かる表と、組織のロゴの置き場の列を足す（複数組織対応の B2）。
-- 設計の正本は docs/multi-organization.md の「組織の設定と秘密の鍵」。足すだけで、既存の表・行・関数は 1 つも書き換えない。
--
-- 1. organization_secrets … 組織 × 名前 → 封をした値（AES-256-GCM・付加データは組織の目印と名前）・封の鍵の版・末尾 4 桁・誰がいつ。
--    生の値はどこにも置かない。読む口・書く口は lib/organization-secrets.ts だけ（画面へは「設定済み・末尾 4 桁・誰がいつ」の要約だけ）
-- 2. organizations.logo_key … 組織のロゴ（1 組織 1 枚）の素材の鍵。非公開の置き場（<素材の置き場の頭>_organization/logo-…）だけを指す
--
-- 仕掛け入りの HTML の扱い（restricted / allowed）と既定の言語は、A1（organizations）で足した列
-- html_scripts_allowed・default_locale をそのまま使う（同じ意味の列を 2 本にしない）。
--
-- 決まり（docs/db-migrations.md）
-- - 足す → 移す → 縮める の段を踏む。消す・名前を変える・NOT NULL を付けるは、別の PR に分ける（DB contract の関門が見る）
-- - 当てるのは CI（main に入るとステージングへ、本番は承認つきの実行で）。管理画面から手で当てない
-- - 前の版のアプリはこの表と列を知らないので、読み書きの形は何も変わらない
-- - 列の既定値（DEFAULT）に組織の目印を入れない（印の無い書き込みを黙って 最初の組織 に倒さない・A1 の決まり）

-- ---------------------------------------------------------------------------
-- 1. 組織の秘密の鍵
-- ---------------------------------------------------------------------------
create table public.organization_secrets (
  organization_id uuid not null references public.organizations(id),
  -- 設定の台帳（lib/organization-settings.ts）の名前。台帳に無い名前は読む口が捨てる
  name text not null check (name ~ '^[a-z][a-z0-9-]{1,39}$'),
  -- 封をした値（<封の鍵の版>.<nonce>.<tag>.<暗号文>・lib/sealed-value.ts）。生の値は置かない
  ciphertext text not null check (char_length(ciphertext) between 1 and 8192),
  -- 封をした鍵の版（PAGES_SECRETS_KEY の v1・v2…）。入れ替えの脚本（scripts/ops/rotate-secrets.mjs）が古い版の行を封じ直す
  key_version text not null check (key_version ~ '^v[0-9]{1,4}$'),
  -- 画面で見分けるための末尾 4 文字（4 文字から元の値は推せない）
  last4 text not null check (char_length(last4) <= 4),
  updated_by text check (updated_by is null or updated_by = lower(btrim(updated_by))),
  updated_at timestamptz not null default now(),
  primary key (organization_id, name)
);

comment on table public.organization_secrets is
  '組織ごとの秘密の鍵（封をした値）。読み書きは lib/organization-secrets.ts だけ。生の値は画面・ログ・応答に出さない';
comment on column public.organization_secrets.ciphertext is
  'AES-256-GCM で封をした値。付加データは組織の目印と名前なので、別の組織の行に貼り替えても開かない';

-- 取り消した鍵は行ごと消す（物理削除）。封をした値を「消した印」付きで残すと、封の鍵が漏れた日に昔の鍵まで開いてしまうため。
-- 誰がいつ取り消したかはサーバーのログ（secretName だけ）に残る

alter table public.organization_secrets enable row level security;
revoke all on public.organization_secrets from public, anon, authenticated;
grant select, insert, update, delete on public.organization_secrets to service_role;

-- ---------------------------------------------------------------------------
-- 2. 組織のロゴ
-- ---------------------------------------------------------------------------
-- 素材の鍵（非公開の置き場）。組織の素材の置き場の頭の下の _organization/ だけを指す（公開の置き場・ページの置き場を指させない）。
-- 名前に中身の指紋を入れるので、入れ替えると鍵が変わる（古いロゴの控えを握ったままにならない）
alter table public.organizations add column logo_key text
  check (
    logo_key is null
    or (
      left(logo_key, char_length(asset_prefix)) = asset_prefix
      and substr(logo_key, char_length(asset_prefix) + 1) ~ '^_organization/logo-[0-9a-f]{16}\.(png|jpg|webp|gif|avif)$'
    )
  );

comment on column public.organizations.logo_key is
  '組織のロゴの素材の鍵（非公開）。<素材の置き場の頭>_organization/logo-<指紋>.<拡張子>。null は未設定';
