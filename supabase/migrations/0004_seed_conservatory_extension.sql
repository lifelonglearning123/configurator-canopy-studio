-- =============================================================
-- Add the conservatory + extension product lines.
--
-- 1. Insert 5 new product rows (4 conservatory styles + 1 extension).
-- 2. Backfill `pricing_rules` for every existing tenant with the
--    new line items (materials, opening presets, per-product bases).
--    New tenants get them via defaultPricingLineItems() in catalog.ts.
--
-- See docs/scoping/conservatory-extension.md
-- =============================================================

-- ----- 1. Products --------------------------------------------

insert into products (key, name, tagline, default_schema_json) values
('conservatory-leanto',    'Lean-to Conservatory',
  'Wall-mounted glass conservatory with brick dwarf wall and mono-pitch glazed roof',
  '{"structure":"wallmounted","scene":"conservatory-leanto","style":"leanto","plan":"rect","roof":"glass-sloped"}'::jsonb),

('conservatory-edwardian', 'Edwardian Conservatory',
  'Rectangular conservatory with 4-panel hipped glass roof and dwarf wall',
  '{"structure":"wallmounted","scene":"conservatory-edwardian","style":"edwardian","plan":"rect","roof":"glass-sloped"}'::jsonb),

('conservatory-victorian', 'Victorian Conservatory',
  '3- or 5-faceted bay conservatory with faceted hip roof',
  '{"structure":"wallmounted","scene":"conservatory-victorian","style":"victorian","plan":"faceted-bay","roof":"glass-sloped","facets":"3"}'::jsonb),

('conservatory-orangery',  'Orangery',
  'Brick-pier orangery with flat perimeter roof and central glass lantern',
  '{"structure":"wallmounted","scene":"conservatory-orangery","style":"orangery","plan":"rect-piers","roof":"glass-flat"}'::jsonb),

('extension',              'House Extension',
  'Architectural single- or two-storey extension with configurable plan, walls, roof and openings',
  '{"structure":"wallmounted","scene":"extension","plan":{"primary":{"length":6,"depth":4},"return":null},"storeys":1,"roof":"glass-flat"}'::jsonb);


-- ----- 2. Backfill pricing_rules for every existing tenant ----
--
-- Each VALUES row below mirrors a row produced by defaultPricingLineItems().
-- We INSERT … SELECT from `tenants` so every tenant gets every new key.
-- The unique constraint (tenant_id, product_key, line_item_key) makes this
-- a safe re-run via ON CONFLICT DO NOTHING.

with new_rules (line_item_key, label, amount_minor, product_key) as (
  values
    -- Materials: brick
    ('material.brick.london-stock.perM2',    'London stock yellow — per m²',     11000::bigint, null::text),
    ('material.brick.red-engineering.perM2', 'Red engineering — per m²',          9500,         null),
    ('material.brick.buff.perM2',            'Buff multi — per m²',              10000,         null),
    ('material.brick.reclaimed.perM2',       'Reclaimed mixed — per m²',         14500,         null),
    ('material.brick.painted-white.perM2',   'Painted white brick — per m²',     10500,         null),

    -- Materials: render
    ('material.render.white.perM2',          'White silicone render — per m²',    7000,         null),
    ('material.render.cream.perM2',          'Cream silicone render — per m²',    7000,         null),
    ('material.render.stone.perM2',          'Stone-grey render — per m²',        7500,         null),
    ('material.render.charcoal.perM2',       'Charcoal silicone render — per m²', 8000,         null),

    -- Materials: roof tile / slate
    ('material.tile.slate-natural.perM2',    'Natural slate — per m²',            9000,         null),
    ('material.tile.slate-grey.perM2',       'Grey slate (synthetic) — per m²',   6000,         null),
    ('material.tile.terracotta.perM2',       'Terracotta clay tile — per m²',     6500,         null),
    ('material.tile.clay-red.perM2',         'Red clay pantile — per m²',         7000,         null),
    ('material.tile.concrete-grey.perM2',    'Concrete tile (grey) — per m²',     5500,         null),

    -- Glazing grade uplifts
    ('material.glazing.low-e.perM2',         'Low-e self-cleaning glass — per m² uplift', 3500, null),
    ('material.glazing.triple.perM2',        'Triple glazed — per m² uplift',     8500,         null),

    -- Opening presets — unit cost per opening
    ('opening.bifold-full.unit',             'Bifolds (full width) — per opening',          480000, null),
    ('opening.french-pair.unit',             '2× French doors centered — per opening',      220000, null),
    ('opening.sliders-side-window.unit',     'Sliders + side window — per opening',         360000, null),
    ('opening.single-french-windows.unit',   'Single French + flanking windows — per opening', 280000, null),
    ('opening.window-large.unit',            'Large picture window — per opening',          110000, null),
    ('opening.window-medium.unit',           'Medium window — per opening',                  68000, null),
    ('opening.window-small.unit',            'Small window — per opening',                   42000, null),

    -- Conservatory style base prices (per-product)
    ('product.conservatory-leanto.base',     'Conservatory · Lean-to — base',     650000, 'conservatory-leanto'),
    ('product.conservatory-edwardian.base',  'Conservatory · Edwardian — base',   980000, 'conservatory-edwardian'),
    ('product.conservatory-victorian.base',  'Conservatory · Victorian — base',  1250000, 'conservatory-victorian'),
    ('product.conservatory-orangery.base',   'Conservatory · Orangery — base',   1850000, 'conservatory-orangery'),

    -- Dwarf wall + orangery extras
    ('conservatory.dwarf-wall.perM',         'Conservatory dwarf wall — per linear metre',  18000, null),
    ('orangery.pier.unit',                   'Orangery brick pier — per pier',              38000, null),
    ('orangery.lantern.perM2',               'Orangery roof lantern — per m² of lantern',   24000, null),

    -- Extension base + roof shapes
    ('product.extension.base',                 'House extension — base',                  450000, 'extension'),
    ('extension.roof.flat.base',               'Flat roof — base',                         90000, 'extension'),
    ('extension.roof.flat.perM2',              'Flat roof — per m²',                       11000, 'extension'),
    ('extension.roof.mono.base',               'Mono-pitch tiled — base',                 120000, 'extension'),
    ('extension.roof.mono.perM2',              'Mono-pitch tiled — per m²',                13000, 'extension'),
    ('extension.roof.dual.base',               'Dual-pitch (gable) — base',               160000, 'extension'),
    ('extension.roof.dual.perM2',              'Dual-pitch (gable) — per m²',              14500, 'extension'),
    ('extension.roof.hipped.base',             'Hipped tiled — base',                     190000, 'extension'),
    ('extension.roof.hipped.perM2',            'Hipped tiled — per m²',                    15500, 'extension'),
    ('extension.lantern.unit',                 'Extension roof lantern — per lantern',    220000, 'extension'),
    ('extension.return-leg.uplift',            'Extension return leg (L / wraparound) — uplift', 180000, 'extension'),
    ('extension.storey-2.uplift_per_m2',       'Extension 2nd storey — per m² of upper footprint', 95000, 'extension')
)
insert into pricing_rules (tenant_id, product_key, line_item_key, label, amount_minor)
select t.id, nr.product_key, nr.line_item_key, nr.label, nr.amount_minor
from tenants t
cross join new_rules nr
on conflict (tenant_id, product_key, line_item_key) do nothing;
