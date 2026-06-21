// Ported from the HTML prototype. This is the *default* option schema —
// tenants override individual amounts via the pricing_rules table.
//
// Keep this in sync with C:\python\configurator\index.html until the
// configurator React port lands.

export const FRAME_COLORS = {
  anthracite: { hex: '#3a3a3a', label: 'Anthracite — matte powder-coated aluminium', metalness: 0.3, roughness: 0.5 },
  white:      { hex: '#f5f3ec', label: 'White — RAL 9016 powder-coated',             metalness: 0.05, roughness: 0.6 },
  black:      { hex: '#101010', label: 'Black — matte powder-coated',                metalness: 0.4, roughness: 0.42 },
  cream:      { hex: '#e8dcc4', label: 'Cream — RAL 9001 powder-coated',             metalness: 0.08, roughness: 0.6 },
} as const;

export const ROOF = {
  'louvred-retract': { label: 'Louvred retractable roof',  short: 'Louvred retract.', price: 3200, perM2: 180 },
  'louvred-fixed':   { label: 'Louvred fixed-angle roof',  short: 'Louvred fixed',    price: 2100, perM2: 130 },
  'glass-flat':      { label: 'Flat glass roof',           short: 'Flat glass',       price: 2400, perM2: 160 },
  'glass-sloped':    { label: 'Sloped glass roof',         short: 'Sloped glass',     price: 2000, perM2: 140 },
  'poly-sloped':     { label: 'Sloped polycarbonate roof', short: 'Sloped poly',      price: 1100, perM2:  80 },
  'fabric-retract':  { label: 'Retractable fabric awning', short: 'Fabric retract.',  price:  950, perM2: 120 },
  'fabric-fixed':    { label: 'Fixed fabric canopy',       short: 'Fabric fixed',     price:  650, perM2:  90 },
} as const;

export const WALL = {
  none:    { label: 'open',                priceFB:    0, priceLR:    0 },
  sliding: { label: 'sliding glass doors', priceFB: 1800, priceLR: 1400 },
  glass:   { label: 'fixed glass wall',    priceFB: 1200, priceLR:  950 },
  tinted:  { label: 'tinted glass wall',   priceFB: 1400, priceLR: 1100 },
  alu:     { label: 'aluminium panel',     priceFB:  600, priceLR:  500 },
  metal:   { label: 'metal sheet lamellas',priceFB: 1100, priceLR:  850 },
  zip:     { label: 'zip blind',           priceFB:  450, priceLR:  380 },
  screen:  { label: 'screen rolo',         priceFB:  520, priceLR:  430 },
  louvre:  { label: 'louvred panel',       priceFB:  900, priceLR:  700 },
} as const;

export const ADDONS = {
  lighting: { label: 'LED perimeter lighting', price: 480 },
  bar:      { label: 'Linear bar lights',      price: 380 },
  heater:   { label: 'Infrared heating (x2)',  price: 720 },
  speakers: { label: 'Ceiling speakers',       price: 540 },
} as const;

export const CLADDING = {
  none:      { label: 'No cladding',                price:    0 },
  timber:    { label: 'Timber larch cladding',      price: 1200 },
  cedar:     { label: 'Western red cedar cladding', price: 2100 },
  composite: { label: 'Composite cladding',         price: 1800 },
  pvc:       { label: 'PVC cladding',               price:  900 },
} as const;

export const FLOORING = {
  none:     { label: 'No flooring',         price:    0 },
  laminate: { label: 'Laminate flooring',   price:  600 },
  tile:     { label: 'Porcelain tile',      price:  900 },
  wood:     { label: 'Engineered wood',     price: 1500 },
  concrete: { label: 'Polished concrete',   price:  400 },
} as const;

export const INTERIOR_WALLS = {
  none:    { label: 'No interior finish',   price:    0 },
  plaster: { label: 'Plastered walls',      price:  850 },
  wood:    { label: 'Wood-panelled walls',  price: 1200 },
  paint:   { label: 'Painted plasterboard', price:  600 },
} as const;

export const AUTOMATION = {
  none:    { label: 'Manual control',              price:    0 },
  basic:   { label: 'Motorised roof + remote',     price:  680 },
  smart:   { label: 'Smart app + sensors',         price: 1450 },
  premium: { label: 'Premium home-automation kit', price: 2600 },
} as const;

export const ELECTRICAL = {
  none:     { label: 'No electrical package',  price:    0 },
  standard: { label: 'Standard sockets + RCD', price:  780 },
  premium:  { label: 'Premium (USB-C + zoned)',price: 1650 },
} as const;

export const SERVICE = {
  delivery:      { label: 'Delivery only',                  price:  300 },
  install:       { label: 'Standard installation',          price: 1400 },
  surveyInstall: { label: 'Free survey + installation',     price: 1900 },
  premium:       { label: 'Premium install + 5-yr service', price: 3300 },
} as const;

// ============================================================
// Conservatory + Extension catalog (added 2026-06)
// See docs/scoping/conservatory-extension.md
// ============================================================

// Brick types — for conservatory dwarf walls, orangery piers, extension walls.
// perM2 = visualization-first £/m² of wall face; agencies override per-tenant.
export const BRICK = {
  'london-stock':    { label: 'London stock yellow', hex: '#c9a87c', perM2: 110 },
  'red-engineering': { label: 'Red engineering',     hex: '#8a2f24', perM2:  95 },
  'buff':            { label: 'Buff multi',          hex: '#d4b988', perM2: 100 },
  'reclaimed':       { label: 'Reclaimed mixed',     hex: '#9c6b50', perM2: 145 },
  'painted-white':   { label: 'Painted white brick', hex: '#e8e2d6', perM2: 105 },
} as const;

// Render finishes — for extension walls. £/m² of wall face.
export const RENDER = {
  white:    { label: 'White silicone render',    hex: '#f0ede4', perM2: 70 },
  cream:    { label: 'Cream silicone render',    hex: '#e0d3b2', perM2: 70 },
  stone:    { label: 'Stone-grey render',        hex: '#a89e8e', perM2: 75 },
  charcoal: { label: 'Charcoal silicone render', hex: '#444a4d', perM2: 80 },
} as const;

// Roof tile / slate — for extension roofs. £/m² of roof face.
export const ROOF_TILE = {
  'slate-natural':  { label: 'Natural slate',         hex: '#3a3e44', perM2: 90 },
  'slate-grey':     { label: 'Grey slate (synthetic)', hex: '#54595e', perM2: 60 },
  terracotta:       { label: 'Terracotta clay tile',  hex: '#b4523a', perM2: 65 },
  'clay-red':       { label: 'Red clay pantile',      hex: '#9a3a2c', perM2: 70 },
  'concrete-grey':  { label: 'Concrete tile (grey)',  hex: '#6a6c6d', perM2: 55 },
} as const;

// Glazing grade uplift — applied per m² of glazed area on top of base glazing.
export const GLAZING_GRADE = {
  standard: { label: 'Standard double glazing',   perM2:  0 },
  'low-e':  { label: 'Low-e self-cleaning glass', perM2: 35 },
  triple:   { label: 'Triple glazed',             perM2: 85 },
} as const;

// Opening presets — fixed unit cost per opening, independent of wall width.
// One preset per elevation. 'solid' = no opening.
export const OPENING_PRESET = {
  solid:                   { label: 'Solid wall',                       price:    0 },
  'bifold-full':           { label: 'Bifolds (full width)',             price: 4800 },
  'french-pair':           { label: '2× French doors centered',         price: 2200 },
  'sliders-side-window':   { label: 'Sliders + side window',            price: 3600 },
  'single-french-windows': { label: 'Single French + flanking windows', price: 2800 },
  'window-large':          { label: 'Large picture window',             price: 1100 },
  'window-medium':         { label: 'Medium window',                    price:  680 },
  'window-small':          { label: 'Small window',                     price:  420 },
} as const;

// House backdrop archetypes (visual only — no price).
export const HOUSE_BACKDROP = {
  none:                { label: 'No backdrop (default wall)' },
  'modern-detached':   { label: 'Modern detached' },
  'victorian-terrace': { label: 'Victorian terrace' },
  bungalow:            { label: 'Bungalow' },
  semi:                { label: 'Semi-detached' },
} as const;

// Conservatory styles. The style is the product key; this map is purely for
// labels + visualization-first base prices. Roof geometry is locked per style.
export const CONSERVATORY_STYLE = {
  'leanto':    { label: 'Lean-to',     base:  6500, plan: 'rect',         roof: 'glass-mono'    },
  'edwardian': { label: 'Edwardian',   base:  9800, plan: 'rect',         roof: 'glass-hipped'  },
  'victorian': { label: 'Victorian',   base: 12500, plan: 'faceted-bay',  roof: 'glass-faceted' },
  'orangery':  { label: 'Orangery',    base: 18500, plan: 'rect-piers',   roof: 'flat-lantern'  },
} as const;

// Victorian bay facet count.
export const VICTORIAN_FACETS = {
  '3': { label: '3-faceted bay (90°/45°/45°/90°)' },
  '5': { label: '5-faceted bay (22.5° per facet)' },
} as const;

// Extension roof shapes — independent of conservatory roof types.
export const EXTENSION_ROOF = {
  flat:      { label: 'Flat roof',          base:  900, perM2: 110 },
  mono:      { label: 'Mono-pitch tiled',   base: 1200, perM2: 130 },
  dual:      { label: 'Dual-pitch (gable)', base: 1600, perM2: 145 },
  hipped:    { label: 'Hipped tiled',       base: 1900, perM2: 155 },
} as const;

// ============================================================

// Build the full set of line-item keys for the pricing-rules seed.
// Key namespace: "<category>.<key>[.suffix]"  — values are MINOR (pence).

// Build the full set of line-item keys for the pricing-rules seed.
// Key namespace: "<category>.<key>[.suffix]"  — values are MINOR (pence).
export function defaultPricingLineItems(): Array<{ key: string; label: string; amountMinor: number; productKey?: string }> {
  const rows: Array<{ key: string; label: string; amountMinor: number; productKey?: string }> = [];
  const m = (v: number) => Math.round(v * 100);

  // Base structure
  rows.push({ key: 'base.freestanding', label: 'Free-standing base', amountMinor: m(2200) });
  rows.push({ key: 'base.wallmounted',  label: 'Wall-mounted base',  amountMinor: m(1800) });

  // Roofs — base + perM2 stored as separate rows
  for (const [k, v] of Object.entries(ROOF)) {
    rows.push({ key: `roof.${k}.base`,  label: `${v.label} — base`,  amountMinor: m(v.price) });
    rows.push({ key: `roof.${k}.perM2`, label: `${v.label} — per m²`, amountMinor: m(v.perM2) });
  }

  // Walls per side
  for (const [k, v] of Object.entries(WALL)) {
    if (k === 'none') continue;
    rows.push({ key: `wall.${k}.frontback`, label: `${v.label} — front/back`, amountMinor: m(v.priceFB) });
    rows.push({ key: `wall.${k}.leftright`, label: `${v.label} — left/right`, amountMinor: m(v.priceLR) });
  }

  for (const [k, v] of Object.entries(ADDONS))         rows.push({ key: `addon.${k}`,    label: v.label, amountMinor: m(v.price) });
  for (const [k, v] of Object.entries(CLADDING))       if (k !== 'none') rows.push({ key: `cladding.${k}`,  label: v.label, amountMinor: m(v.price) });
  for (const [k, v] of Object.entries(FLOORING))       if (k !== 'none') rows.push({ key: `flooring.${k}`,  label: v.label, amountMinor: m(v.price) });
  for (const [k, v] of Object.entries(INTERIOR_WALLS)) if (k !== 'none') rows.push({ key: `interior.${k}`,  label: v.label, amountMinor: m(v.price) });
  for (const [k, v] of Object.entries(AUTOMATION))     if (k !== 'none') rows.push({ key: `automation.${k}`,label: v.label, amountMinor: m(v.price) });
  for (const [k, v] of Object.entries(ELECTRICAL))     if (k !== 'none') rows.push({ key: `electrical.${k}`,label: v.label, amountMinor: m(v.price) });
  for (const [k, v] of Object.entries(SERVICE))                       rows.push({ key: `service.${k}`,   label: v.label, amountMinor: m(v.price) });

  // Slats
  rows.push({ key: 'slats.isolation',   label: 'Insulated slats',                    amountMinor: m(820) });
  rows.push({ key: 'slats.twotone',     label: 'Two-tone slat colour',               amountMinor: m(240) });
  rows.push({ key: 'misc.overhang_per_m', label: 'Roof overhang per metre',          amountMinor: m(380) });
  rows.push({ key: 'misc.oversize_per_m', label: 'Oversize structural premium / m',  amountMinor: m(320) });

  // -----------------------------------------------------------
  // Conservatory + extension line items (added 2026-06)
  // -----------------------------------------------------------

  // Materials — per m² of face area
  for (const [k, v] of Object.entries(BRICK))     rows.push({ key: `material.brick.${k}.perM2`,    label: `${v.label} — per m²`, amountMinor: m(v.perM2) });
  for (const [k, v] of Object.entries(RENDER))    rows.push({ key: `material.render.${k}.perM2`,   label: `${v.label} — per m²`, amountMinor: m(v.perM2) });
  for (const [k, v] of Object.entries(ROOF_TILE)) rows.push({ key: `material.tile.${k}.perM2`,     label: `${v.label} — per m²`, amountMinor: m(v.perM2) });
  for (const [k, v] of Object.entries(GLAZING_GRADE)) {
    if (v.perM2 > 0) rows.push({ key: `material.glazing.${k}.perM2`, label: `${v.label} — per m² uplift`, amountMinor: m(v.perM2) });
  }

  // Opening presets — unit cost per opening
  for (const [k, v] of Object.entries(OPENING_PRESET)) {
    if (v.price > 0) rows.push({ key: `opening.${k}.unit`, label: `${v.label} — per opening`, amountMinor: m(v.price) });
  }

  // Conservatory style base prices (per-product base)
  for (const [k, v] of Object.entries(CONSERVATORY_STYLE)) {
    rows.push({ key: `product.conservatory-${k}.base`, label: `Conservatory · ${v.label} — base`, amountMinor: m(v.base), productKey: `conservatory-${k}` });
  }

  // Dwarf wall (conservatory) — per linear metre of perimeter
  rows.push({ key: 'conservatory.dwarf-wall.perM', label: 'Conservatory dwarf wall — per linear metre', amountMinor: m(180) });

  // Orangery extras
  rows.push({ key: 'orangery.pier.unit',     label: 'Orangery brick pier — per pier',           amountMinor: m( 380) });
  rows.push({ key: 'orangery.lantern.perM2', label: 'Orangery roof lantern — per m² of lantern', amountMinor: m( 240) });

  // Extension base + roof shapes
  rows.push({ key: 'product.extension.base', label: 'House extension — base', amountMinor: m(4500), productKey: 'extension' });
  for (const [k, v] of Object.entries(EXTENSION_ROOF)) {
    rows.push({ key: `extension.roof.${k}.base`,  label: `${v.label} — base`,  amountMinor: m(v.base),  productKey: 'extension' });
    rows.push({ key: `extension.roof.${k}.perM2`, label: `${v.label} — per m²`, amountMinor: m(v.perM2), productKey: 'extension' });
  }
  rows.push({ key: 'extension.lantern.unit',       label: 'Extension roof lantern — per lantern', amountMinor: m(2200), productKey: 'extension' });
  rows.push({ key: 'extension.return-leg.uplift',  label: 'Extension return leg (L / wraparound) — uplift', amountMinor: m(1800), productKey: 'extension' });
  rows.push({ key: 'extension.storey-2.uplift_per_m2', label: 'Extension 2nd storey — per m² of upper footprint', amountMinor: m(950), productKey: 'extension' });

  return rows;
}
