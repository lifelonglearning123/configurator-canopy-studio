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
