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
