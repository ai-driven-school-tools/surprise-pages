-- Catalog edits use an opaque version, because SQL clients may round timestamp precision.
-- Nullable addition preserves old inserts/reads; existing rows receive a version from the default.
alter table public.recording_repository_catalog
  add column revision uuid default gen_random_uuid();
