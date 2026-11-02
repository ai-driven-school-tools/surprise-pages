-- 組織のデータの書き出しを、いくつかの部（part）に分けて組めるようにする（docs/multi-organization.md の「書き出しと解約」）。
--
-- 1 部は 1 回の関数の実行で必ず組み終わる量（lib/plans.ts の ORGANIZATION_EXPORT_PART）。部ごとに素材の置き場の組織の頭の下
-- `_exports/<書き出しの目印>/part-<番号>.zip` に置き、組み終えるたびに「次にどこから詰めるか」を progress に残す。
-- 途中で関数が止まっても、次の起動（自分を呼ぶ内部の口・夜間）が progress から同じ部を組み直す。
--
-- 段: 足すだけ（列を足す・blob_key の形の縛りを、前の形も通るように広げる）。前の版は新しい列を読まず、前の形の blob_key を書くので壊れない。

-- 組み終えた部（番号の順）。1 部 = { number, key, bytes, counts }。保管庫の鍵は画面にも応答にも出さない
-- db-contract: reviewed 新しい列の縛り。既定値（空の並び）が縛りを満たし、前の版はこの列を書かないので既存の行も前の版の書き込みも弾かない
alter table public.organization_exports
  add column parts jsonb not null default '[]'::jsonb check (jsonb_typeof(parts) = 'array' and octet_length(parts::text) <= 262144);

-- 次に組む部の番号（2 つの実行が同じ部を重ねて積まないよう、積むときにこの値で条件をつける）
-- db-contract: reviewed 新しい列の縛り。既定値（1）が縛りを満たし、前の版はこの列を書かないので既存の行も前の版の書き込みも弾かない
alter table public.organization_exports
  add column next_part integer not null default 1 check (next_part between 1 and 100000);

-- 次の部をどこから詰めるか（版・素材・コメントの位置と、書き出しの言語）。用意できた・失敗したら null
alter table public.organization_exports
  add column progress jsonb check (progress is null or (jsonb_typeof(progress) = 'object' and octet_length(progress::text) <= 8192));

-- 最後に進んだ時刻（部を 1 つ積むたびに今にする）。長く進まない準備中は、頼む口が失敗と見なして頼み直せる
alter table public.organization_exports
  add column progressed_at timestamptz not null default now();

-- いま組んでいる実行の持ち時間の終わり（同じ書き出しを 2 つの実行が同時に組まない）。誰も組んでいなければ過去の時刻
alter table public.organization_exports
  add column lease_until timestamptz not null default 'epoch'::timestamptz;

-- blob_key は、前の 1 つの zip の形（`_exports/<目印>.zip`）と、部の形（`_exports/<目印>/part-<番号>.zip`・用意できたときは最後の部）の両方を通す
alter table public.organization_exports drop constraint organization_exports_blob_key_check;
-- db-contract: reviewed 前の縛り（_exports/<目印>.zip だけ）を広げて部の形も通す。前の形は今までどおり通るので、既存の行と前の版の書き込みは弾かない
alter table public.organization_exports
  add constraint organization_exports_blob_key_shape check (
    blob_key is null or (
      char_length(blob_key) <= 240
      and (blob_key ~ '_exports/[0-9a-f-]{36}\.zip$' or blob_key ~ '_exports/[0-9a-f-]{36}/part-[0-9]{1,5}\.zip$')
    )
  );

comment on column public.organization_exports.parts is
  '組み終えた部（番号の順・{ number, key, bytes, counts }）。部の zip は素材の置き場の組織の頭の下 _exports/<目印>/part-<番号>.zip。';
comment on column public.organization_exports.progress is
  '次の部をどこから詰めるか（版・素材・コメントの位置・書き出しの言語）。用意できた・失敗したら null。';
