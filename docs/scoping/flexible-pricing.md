# Flexible pricing — scoping (draft for discussion)

Status: **Phase 1 built** (2026-07-05): matrix core (`price-matrix.ts`,
`quote()` integration, admin grid editor) plus a per-product **detail level**
(`price_matrices.mode`): `detailed` = band price + itemised extras (default);
`simple` = the band price is the whole guide price, extras unpriced. Band
prices are all-in for the structure — the `base.*` row no longer stacks on a
band price. Tiers/margins, availability constraints and import are still open.
Drafted 2026-07-03 from a discussion of one seller's real pricing workbook
(`CALCULATION SHEET Ver7, 2025.xlsx`, repo root).

## The problem

Our pricing is one shape: a fixed catalogue of line items priced
`base + perM2 × area` (plus per-side / per-unit rows). Every seller prices
differently; the attached workbook shows a model we cannot express:

1. **Size-band matrix** — hand-tuned prices for discrete width×projection
   bands ("5 × 3" → £4,735). Costs jump at engineering thresholds (beam
   spans); they are not linear in area.
2. **Ranges/tiers** — the same product in named quality ranges (NANTES,
   BORDEAUX, GIRONDE, PROVENCE, PROVENCE PLUS), one price column each.
3. **Availability** — `X` cells mean "not sold at this size in this range".
   Pricing data doubles as configuration constraints.
4. **Cost vs margin** — the matrix holds *cost*; sell price is
   `cost × per-range multiplier` (1.75–1.8 in this workbook). Supplier
   repricing and margin management are independent.
5. **Custom line items** — free-text extras ("keyframes above side doors",
   2 × £900).
6. **Per-qty components** — posts counted individually with per-post
   fixing options (baseplate vs concrete).

What already maps well: component add-ons (qty × price), per-elevation
infill pricing (front ≠ sides), per-elevation wall/opening choices.

## Recommended design (Option B): matrix mode alongside formula mode

Per product, a tenant chooses:

- **Formula** — today's `pricing_rules` (unchanged; right for simple sellers).
- **Matrix** — a size-band grid with tiers and margin multipliers; the
  matrix supplies the structural base price, component add-on rows still
  layer on top exactly as today.

Rejected alternatives: formula-only with per-product overrides (cannot
express the workbook at all); a free formula engine (spreadsheet-in-the-
product: fragile, unsupportable).

### Data model

One row per (tenant, product), grid as validated JSONB (edited as a whole
in the admin; zod-validated in app):

```sql
create table price_matrices (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  product_key text not null,
  -- { widths: [4,5,6,7], depths: [2.5,3,3.5,4,6],
  --   priceMode: 'cost' | 'sell',
  --   tiers: [{ key:'bordeaux', label:'BORDEAUX', multiplier:1.75 }],
  --   cells: { bordeaux: [[amountMinor|null, ...] per width] per depth } }
  grid        jsonb not null,
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now(),
  unique (tenant_id, product_key)
);
```

`null` cell = size unavailable in that tier.

### Quote resolution

```
if matrix enabled for state.product:
  band  = smallest (w, d) with w >= length and d >= depth   -- snap UP
  cell  = grid.cells[state.tier][band]
  if cell is null → size unavailable (see availability question)
  base  = round(cell × tier.multiplier)      -- when priceMode = 'cost'
  lines = [matrix base] + component rows (walls, openings, addons, service…)
else:
  current formula path (unchanged)
```

Note from the workbook: the matrix price covers the structure incl. a
standard roof; roof material (glass vs poly), gutters, fixings are add-on
rows on top. Our integration should match: matrix replaces the
`base.*` + `roof.*` structural rows only.

### Configurator

- `ConfigState.tier?: string` + a "Range" selector (renders only when the
  product has a tiered matrix).
- Size sliders snap to / display the band boundaries; unavailable
  combinations are disabled or show "ask us" (pending decision).

### Admin

- Grid editor on `/admin/pricing` when matrix mode is on: spreadsheet-style
  table (rows = depths, cols = widths), tier tabs, multiplier field per
  tier, blank cell = unavailable.
- **Import**: upload CSV (phase 1) / XLSX (phase 2) shaped like the trade
  price lists sellers already have → preview → save. This is the
  onboarding killer feature: the attached workbook would import as-is.

### Custom line items (companion feature, any pricing mode)

```sql
create table tenant_line_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  product_key text,                      -- null = all products
  label       text not null,
  mode        text not null check (mode in ('flat','per_m2','per_m','per_unit')),
  amount_minor bigint not null,
  enabled     boolean not null default true
);
```

Rendered as extra add-on checkboxes/qty steppers in the configurator;
covers the workbook's "OTHER — please specify" rows.

## Phasing

1. **Matrix core** — table, zod schema, quote integration, tier selector,
   band snapping, minimal grid editor. (Single-tier matrices work too.)
2. **Availability + margins** — configurator constraints from null cells;
   cost/sell modes with per-tier multipliers surfaced in admin.
3. **Import + custom line items** — CSV then XLSX import wizard;
   tenant_line_items end-to-end.

## Open questions (need answers before build)

1. **Architecture**: confirm Option B (matrix + formula hybrid)?
2. **Availability**: should null cells constrain the configurator
   (recommended), or price-on-application fallback?
3. **Ranges**: tier selector inside one product (recommended), separate
   products per range, or seller's choice?
4. **Band snapping**: snap UP to the next band (recommended, standard
   trade practice) — confirm, incl. behaviour past the largest band
   (clamp sliders vs POA).
5. Does the matrix replace only `base.*`+`roof.*` rows (recommended,
   matches the workbook) or the whole structural section?
