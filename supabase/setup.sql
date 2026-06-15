-- =============================================================
-- Canopy Studio — initial schema
-- Multi-tenant configurator SaaS for construction companies.
-- =============================================================

create extension if not exists "pgcrypto";

-- ---------- tenants ----------
create table tenants (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text unique not null,
  name                  text not null,
  currency              text not null default 'GBP',          -- ISO 4217
  logo_url              text,
  primary_color         text default '#1c1917',
  ghl_webhook_url       text,
  ghl_location_id       text,
  stripe_customer_id    text unique,
  stripe_subscription_id text unique,
  subscription_status   text not null default 'incomplete'
                        check (subscription_status in ('incomplete','trialing','active','past_due','canceled')),
  status                text not null default 'active'
                        check (status in ('active','suspended','deleted')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on tenants(slug);
create index on tenants(stripe_customer_id);

-- ---------- tenant_domains ----------
-- A tenant may have many custom hostnames pointing at the central app.
create table tenant_domains (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  hostname      text unique not null,
  is_primary    boolean not null default false,
  verified_at   timestamptz,
  ssl_status    text not null default 'pending'
                check (ssl_status in ('pending','issued','failed')),
  vercel_domain_id text,
  created_at    timestamptz not null default now()
);
create index on tenant_domains(hostname);
create index on tenant_domains(tenant_id);

-- ---------- tenant_users ----------
-- Auth users mapped to tenants. Owner = the sign-up user; editors invited later.
create table tenant_users (
  user_id     uuid not null references auth.users(id) on delete cascade,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  role        text not null default 'owner' check (role in ('owner','editor')),
  created_at  timestamptz not null default now(),
  primary key (user_id, tenant_id)
);
create index on tenant_users(tenant_id);

-- ---------- products (global catalog) ----------
-- The fixed catalog of structure types. Tenants choose which to offer.
create table products (
  id            uuid primary key default gen_random_uuid(),
  key           text unique not null,                          -- 'pergola','veranda','carport',...
  name          text not null,
  tagline       text,
  default_schema_json jsonb not null,                          -- option ranges + defaults for the configurator
  created_at    timestamptz not null default now()
);

-- ---------- tenant_products (junction) ----------
create table tenant_products (
  tenant_id     uuid not null references tenants(id) on delete cascade,
  product_id    uuid not null references products(id) on delete cascade,
  enabled       boolean not null default true,
  custom_name   text,                                          -- override "Pergola Lux" with their own
  custom_tagline text,
  sort_order    int not null default 0,
  primary key (tenant_id, product_id)
);

-- ---------- pricing_rules ----------
-- Every priceable line item is a row here.
-- line_item_key is namespaced, e.g. "roof.louvred-retract.base",
-- "roof.louvred-retract.perM2", "wall.glass.front", "addon.lighting",
-- "service.install", "automation.smart", "frame.anthracite", ...
create table pricing_rules (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  product_key   text,                                          -- null = global to tenant
  line_item_key text not null,
  label         text not null,
  amount_minor  bigint not null default 0,                     -- pence/cents (currency on tenant)
  enabled       boolean not null default true,
  updated_at    timestamptz not null default now(),
  unique (tenant_id, product_key, line_item_key)
);
create index on pricing_rules(tenant_id, product_key);

-- ---------- leads ----------
create table leads (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  product_key     text,
  config_json     jsonb not null,                              -- full state snapshot
  first_name      text not null,
  last_name       text not null,
  email           text not null,
  phone           text,
  postcode        text,
  notes           text,
  price_quoted_minor bigint not null default 0,
  currency        text not null default 'GBP',
  status          text not null default 'new'
                  check (status in ('new','contacted','quoted','won','lost')),
  ghl_status      text not null default 'pending'
                  check (ghl_status in ('pending','sent','failed','skipped')),
  ghl_response    jsonb,
  ghl_attempts    int not null default 0,
  source_url      text,
  user_agent      text,
  ip              inet,
  created_at      timestamptz not null default now()
);
create index on leads(tenant_id, created_at desc);
create index on leads(email);
create index on leads(ghl_status) where ghl_status = 'pending';

-- ---------- updated_at triggers ----------
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger tenants_updated   before update on tenants
  for each row execute function set_updated_at();
create trigger pricing_updated   before update on pricing_rules
  for each row execute function set_updated_at();
-- =============================================================
-- Row Level Security policies.
-- =============================================================

alter table tenants          enable row level security;
alter table tenant_domains   enable row level security;
alter table tenant_users     enable row level security;
alter table products         enable row level security;
alter table tenant_products  enable row level security;
alter table pricing_rules    enable row level security;
alter table leads            enable row level security;

-- Helper: tenants this user belongs to
create or replace function current_tenant_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select tenant_id from tenant_users where user_id = auth.uid();
$$;

-- ---------- tenants ----------
-- Users can read their own tenant; updates only by owners.
create policy tenants_select on tenants
  for select using (id in (select current_tenant_ids()));
create policy tenants_update on tenants
  for update using (
    id in (select tu.tenant_id from tenant_users tu
           where tu.user_id = auth.uid() and tu.role = 'owner')
  );
-- Insert is handled by service-role (signup flow); no policy needed for anon.

-- ---------- tenant_domains ----------
create policy tdomains_select on tenant_domains
  for select using (tenant_id in (select current_tenant_ids()));
create policy tdomains_modify on tenant_domains
  for all using (tenant_id in (select current_tenant_ids()))
          with check (tenant_id in (select current_tenant_ids()));

-- ---------- tenant_users ----------
create policy tu_select on tenant_users
  for select using (tenant_id in (select current_tenant_ids()));
create policy tu_insert_owner on tenant_users
  for insert with check (
    tenant_id in (select tu.tenant_id from tenant_users tu
                  where tu.user_id = auth.uid() and tu.role = 'owner')
  );

-- ---------- products (global catalog, read-only to everyone) ----------
create policy products_select_all on products
  for select using (true);

-- ---------- tenant_products ----------
create policy tp_select on tenant_products
  for select using (tenant_id in (select current_tenant_ids()));
create policy tp_modify on tenant_products
  for all using (tenant_id in (select current_tenant_ids()))
          with check (tenant_id in (select current_tenant_ids()));

-- ---------- pricing_rules ----------
create policy pr_select on pricing_rules
  for select using (tenant_id in (select current_tenant_ids()));
create policy pr_modify on pricing_rules
  for all using (tenant_id in (select current_tenant_ids()))
          with check (tenant_id in (select current_tenant_ids()));

-- ---------- leads ----------
-- Owners/editors see all their tenant's leads.
-- Public lead insertion goes through service-role API route.
create policy leads_select on leads
  for select using (tenant_id in (select current_tenant_ids()));
create policy leads_update on leads
  for update using (tenant_id in (select current_tenant_ids()));
-- =============================================================
-- Seed the global product catalog. Matches the 10 product types
-- already implemented in the HTML prototype.
-- =============================================================
insert into products (key, name, tagline, default_schema_json) values
('pergola',   'Pergola Lux',        'Free-standing louvred pergola with motorised slats',
  '{"structure":"freestanding","roof":"louvred-retract"}'::jsonb),
('veranda',   'Veranda Glass',      'Wall-mounted glass veranda with side glazing',
  '{"structure":"wallmounted","roof":"glass-sloped"}'::jsonb),
('carport',   'Carport Pro',        'Sheltered parking with polycarbonate canopy',
  '{"structure":"freestanding","roof":"poly-sloped","scene":"car"}'::jsonb),
('studio',    'Garden Room',        'Fully enclosed outdoor room, glazed front',
  '{"structure":"freestanding","roof":"glass-flat"}'::jsonb),
('awning',    'Awning Flex',        'Wall-mounted retractable fabric awning',
  '{"structure":"wallmounted","roof":"fabric-retract","scene":"awning"}'::jsonb),
('container', 'Container Studio',   'Converted shipping container garden room',
  '{"structure":"freestanding","scene":"container"}'::jsonb),
('fence',     'Fence Line',         'Composite slatted boundary fence',
  '{"scene":"fence"}'::jsonb),
('garage',    'Garage Door Pro',    'Sectional insulated garage door',
  '{"structure":"wallmounted","scene":"garage"}'::jsonb),
('glassroom', 'Glass Room',         'Fully glazed sunroom enclosure',
  '{"structure":"freestanding","roof":"glass-flat"}'::jsonb),
('enclosure', 'Pool Enclosure',     'Retractable glazed pool/spa cover',
  '{"structure":"freestanding","roof":"glass-sloped"}'::jsonb);
