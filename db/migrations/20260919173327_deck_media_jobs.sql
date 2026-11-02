-- Processing state only. Authored media and placement remain in page HTML.
create table public.deck_media_jobs (
 id uuid primary key, page_id uuid not null references public.pages(id), page_slug text not null,
 owner_email text not null, owner_name text, label text not null default '動画', target_id text not null, original_src text not null, original_poster text not null,
 state text not null default 'queued' check(state in ('queued','processing','applying','ready','failed','cancelled','original','discarded')),
 worker_id uuid not null, workflow_run_id text, command_id text, attempt integer not null default 0,
 completion_id uuid not null, restore_id uuid not null, original_bytes bigint not null check(original_bytes>0 and original_bytes<=104857600),
 result_src text, result_poster text, result_bytes bigint, width integer, height integer,
 error text, started_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.deck_media_jobs enable row level security;
revoke all on public.deck_media_jobs from public, anon, authenticated;
grant all on public.deck_media_jobs to service_role;
create index deck_media_jobs_owner_state on public.deck_media_jobs(owner_email,state,created_at);
create index deck_media_jobs_page on public.deck_media_jobs(page_id,created_at desc);
create function public.claim_deck_media_job(p_id uuid,p_worker uuid,p_run text)
returns setof public.deck_media_jobs language plpgsql security invoker set search_path=public as $$
declare job public.deck_media_jobs;
begin
 select * into job from deck_media_jobs where id=p_id;
 if not found then return; end if;
 perform pg_advisory_xact_lock(hashtextextended(job.owner_email,5));
 select * into job from deck_media_jobs where id=p_id for update;
 if job.worker_id<>p_worker or job.state not in ('queued','processing') then return; end if;
 if job.state='processing' then if job.workflow_run_id=p_run then return next job; end if; return; end if;
 if (select count(*) from deck_media_jobs where owner_email=job.owner_email and state in ('processing','applying') and started_at>now()-interval '15 minutes')>=2 then return; end if;
 update deck_media_jobs set state='processing',workflow_run_id=p_run,started_at=now(),updated_at=now() where id=p_id returning * into job;
 return next job;
end $$;
revoke all on function public.claim_deck_media_job(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.claim_deck_media_job(uuid,uuid,text) to service_role;
