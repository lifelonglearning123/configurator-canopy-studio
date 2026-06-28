// Hard-coded mirror of the 15 products seeded by migrations 0003 + 0004.
// Used as a fallback on the marketing page so it always shows the full range,
// even when the deployed Supabase isn't reachable / hasn't been seeded yet.
// Keep in sync with supabase/migrations/0003_seed_products.sql and 0004.

export type MarketingProduct = { key: string; name: string; tagline: string };

export const MARKETING_PRODUCTS: MarketingProduct[] = [
  { key: 'pergola',                 name: 'Pergola Lux',           tagline: 'Free-standing louvred pergola with motorised slats' },
  { key: 'veranda',                 name: 'Veranda Glass',         tagline: 'Wall-mounted glass veranda with side glazing' },
  { key: 'carport',                 name: 'Carport Pro',           tagline: 'Sheltered parking with polycarbonate canopy' },
  { key: 'studio',                  name: 'Garden Room',           tagline: 'Fully enclosed outdoor room, glazed front' },
  { key: 'awning',                  name: 'Awning Flex',           tagline: 'Wall-mounted retractable fabric awning' },
  { key: 'container',               name: 'Container Studio',      tagline: 'Converted shipping container garden room' },
  { key: 'fence',                   name: 'Fence Line',            tagline: 'Composite slatted boundary fence' },
  { key: 'garage',                  name: 'Garage Door Pro',       tagline: 'Sectional insulated garage door' },
  { key: 'glassroom',               name: 'Glass Room',            tagline: 'Fully glazed sunroom enclosure' },
  { key: 'enclosure',               name: 'Pool Enclosure',        tagline: 'Retractable glazed pool/spa cover' },
  { key: 'conservatory-leanto',     name: 'Lean-to Conservatory',  tagline: 'Wall-mounted glass conservatory with brick dwarf wall and mono-pitch glazed roof' },
  { key: 'conservatory-edwardian',  name: 'Edwardian Conservatory',tagline: 'Rectangular conservatory with 4-panel hipped glass roof and dwarf wall' },
  { key: 'conservatory-victorian',  name: 'Victorian Conservatory',tagline: '3- or 5-faceted bay conservatory with faceted hip roof' },
  { key: 'conservatory-orangery',   name: 'Orangery',              tagline: 'Brick-pier orangery with flat perimeter roof and central glass lantern' },
  { key: 'extension',               name: 'House Extension',       tagline: 'Architectural single- or two-storey extension with configurable plan, walls, roof and openings' },
];
