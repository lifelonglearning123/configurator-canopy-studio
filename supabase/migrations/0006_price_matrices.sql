-- =============================================================
-- Size-band matrix pricing (docs/scoping/flexible-pricing.md).
--
-- One row per (tenant, product): a grid of width × projection bands
-- with a price per band, one column per roof material. quote() uses a
-- matrix cell for the structural roof line when it covers the
-- configured size + roof; anything not covered falls back to the
-- base + perM2 formula rows, so a partial grid is always safe.
--
-- Grid JSON shape (validated by priceMatrixSchema in
-- src/lib/price-matrix.ts):
--   { "widths": [3,4,5,6,7],
--     "depths": [2.5,3,3.5,4],
--     "columns": { "glass-sloped": [[pence|null, ...] per width] per depth } }
-- =============================================================

create table price_matrices (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  product_key text not null,
  grid        jsonb not null,
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now(),
  unique (tenant_id, product_key)
);
create index on price_matrices(tenant_id, product_key);

alter table price_matrices enable row level security;

create policy pm_select on price_matrices
  for select using (tenant_id in (select current_tenant_ids()));
create policy pm_modify on price_matrices
  for all using (tenant_id in (select current_tenant_ids()))
          with check (tenant_id in (select current_tenant_ids()));
