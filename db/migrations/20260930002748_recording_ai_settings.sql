-- Add private per-user model preferences; existing workers keep their defaults.
create table public.recording_ai_settings (
  owner_email text primary key,
  revision uuid not null default gen_random_uuid(),
  settings jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.recording_ai_settings enable row level security;
grant select, insert, update, delete on public.recording_ai_settings to service_role;
alter table public.recording_generations add column model_settings jsonb;
alter table public.recording_generations add column research_summary jsonb;
