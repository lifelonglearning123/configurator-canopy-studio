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
