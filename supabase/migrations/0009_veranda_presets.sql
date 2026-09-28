-- =============================================================
-- Veranda presets (2026-09):
--
-- Two size-only versions of the veranda — the buyer picks one and only
-- sets width / projection / height. Every other option is locked in
-- PRODUCT_PRESETS (src/lib/presets.ts), and pricing is shared with the
-- `veranda` product (same pricing rows + size-band grid, the roof
-- column supplies the glass vs polycarbonate difference).
--
-- The full `veranda` product is unchanged and stays available.
--
-- Existing tenants get the presets SWITCHED OFF so no live showroom
-- changes; each seller turns them on in /admin/catalog. New tenants
-- get every product enabled via the provisioner, as before.
-- =============================================================

insert into products (key, name, tagline, default_schema_json)
select v.key, v.name, v.tagline, v.schema
from (values
  ('veranda-glass', 'Glass Veranda',
   'Wall-mounted veranda with a sloped glass roof — just choose your size',
   '{"structure":"wallmounted","roof":"glass-sloped"}'::jsonb),
  ('veranda-poly', 'Polycarbonate Veranda',
   'Wall-mounted veranda with a sloped polycarbonate roof — just choose your size',
   '{"structure":"wallmounted","roof":"poly-sloped"}'::jsonb)
) as v(key, name, tagline, schema)
where not exists (select 1 from products p where p.key = v.key);

-- Sit next to the tenant's veranda in the showroom order.
insert into tenant_products (tenant_id, product_id, enabled, sort_order)
select t.id, p.id, false,
       coalesce((select tp.sort_order
                   from tenant_products tp
                   join products vp on vp.id = tp.product_id and vp.key = 'veranda'
                  where tp.tenant_id = t.id), 0)
from tenants t
cross join products p
where p.key in ('veranda-glass', 'veranda-poly')
on conflict (tenant_id, product_id) do nothing;
