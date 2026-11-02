-- Add the independent timeline document kind without changing access policies.
alter table public.page_catalog drop constraint page_catalog_kind_check;
alter table public.page_catalog add constraint page_catalog_kind_check
  check (kind in ('deck', 'document', 'page', 'motion'));
