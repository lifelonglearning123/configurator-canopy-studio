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

  return rows;
}
