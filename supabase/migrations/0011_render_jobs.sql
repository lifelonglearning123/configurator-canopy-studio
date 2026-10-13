-- =============================================================
-- Render jobs: photoreal stills rendered off-device by the GPU
-- render worker (render-worker/). A job is queued by the lead route
-- when a quote request arrives without a photo render (phones never
-- have one); the worker renders the exact build with the path tracer,
-- uploads the JPEG to the `renders` bucket and writes the URL back to
-- the lead. Service role only: no RLS policies on purpose.
-- =============================================================

create table if not exists render_jobs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  lead_id       uuid references leads(id) on delete cascade,
  product_key   text not null,
  scene         text,                      -- product scene id (car, container, extension, ...)
  config_json   jsonb not null,            -- the ConfigState that was quoted
  status        text not null default 'queued'
                check (status in ('queued', 'rendering', 'done', 'failed')),
  render_url    text,
  samples       int,
  error         text,
  attempts      int not null default 0,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz
);
create index if not exists render_jobs_queue_idx on render_jobs (status, created_at);
alter table render_jobs enable row level security;
