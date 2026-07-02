-- =============================================================
-- Product catalog updates (2026-07):
--
-- 1. Rename "Pergola Lux"   → "Motorised Louvred Roof Pergola".
-- 2. Rename "Veranda Glass" → "Veranda Glass/Polycarbonate Roof".
--    The roof material (glass vs polycarbonate) is already a priced
--    configurator choice via the shared roof.* line items — the name
--    now advertises it.
-- 3. New product: "Premium Carport" — pergola-style frame with a
--    solid insulated aluminium roof. Adds the roof.solid-alu line
--    items for every existing tenant (new tenants get them via
--    defaultPricingLineItems() in catalog.ts) and enables the product
--    per tenant, mirroring migration 0004's pattern.
-- =============================================================

-- ----- 1 + 2. Renames ------------------------------------------

update products
   set name = 'Motorised Louvred Roof Pergola'
 where key = 'pergola';

update products
   set name    = 'Veranda Glass/Polycarbonate Roof',
       tagline = 'Wall-mounted veranda with a choice of glass or polycarbonate roof'
 where key = 'veranda';

-- ----- 3a. Premium Carport product row --------------------------
-- WHERE NOT EXISTS keeps the insert idempotent without relying on a
-- unique constraint over products.key.

insert into products (key, name, tagline, default_schema_json)
select 'carport-premium',
       'Premium Carport',
       'Pergola-style carport with a solid insulated aluminium roof',
       '{"structure":"freestanding","roof":"solid-alu","scene":"car"}'::jsonb
where not exists (select 1 from products where key = 'carport-premium');

-- ----- 3b. Backfill roof.solid-alu pricing for existing tenants --
-- Values mirror the ROOF['solid-alu'] entry in src/lib/catalog.ts
-- (£1,600 base + £110/m², stored in pence).

with new_rules (line_item_key, label, amount_minor, product_key) as (
  values
    ('roof.solid-alu.base',  'Solid aluminium roof — base',   160000::bigint, null::text),
    ('roof.solid-alu.perM2', 'Solid aluminium roof — per m²',  11000,         null)
)
insert into pricing_rules (tenant_id, product_key, line_item_key, label, amount_minor)
select t.id, nr.product_key, nr.line_item_key, nr.label, nr.amount_minor
from tenants t
cross join new_rules nr
on conflict (tenant_id, product_key, line_item_key) do nothing;

-- ----- 3c. Enable Premium Carport for every existing tenant ------
-- ON CONFLICT DO NOTHING preserves any admin's existing choice.

insert into tenant_products (tenant_id, product_id, enabled, sort_order)
select t.id, p.id, true, 120
from tenants t
cross join products p
where p.key = 'carport-premium'
on conflict (tenant_id, product_id) do nothing;
