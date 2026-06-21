# Conservatory & House Extension — Design Scope

**Status:** Scoped, not yet started
**Date:** 2026-06-20
**Owner:** TBD

This document captures the scope, decisions, and sequencing for adding **conservatory** and **house extension** products to the configurator. It is the working spec — implementation should reference this doc; deviations should be reflected back into it.

---

## 1. Why

Today the configurator covers ten outdoor structures (verandas, pergolas, carports, etc.) — all variants of "posts + beams + single-pitch roof + four wall panels." Conservatories and house extensions are a different category: enclosed rooms attached to a house, with masonry, multi-pitched roofs, plan shapes other than rectangles, and (for extensions) potentially a second storey. Adding them roughly doubles the addressable product range.

## 2. Where today's system falls short

| Capability | Today | Needed |
|---|---|---|
| Roof geometry | Flat or single-pitch | Hipped (4-panel), faceted hip (bay), flat + central lantern, dual-pitch, mono-pitch with tile finish |
| Materials | Glass, aluminium, fabric, screen, louvre | + Brick (dwarf walls, piers), render, roof tiles / slate |
| Plan shape | Rectangle only | Faceted bay (3- or 5-sided), L-shape, wraparound |
| Storeys | Single | 1 or 2 storeys (extension only) |
| Openings | Whole-side wall presets | Per-elevation door/window presets (bifold, French, sliders + window, etc.) |
| Backdrop | Single stylized "house wall" | A few stylized house archetypes for context |
| Configurator UI | One shared panel for all products | Per-product sections (new products only) |

## 3. In scope

### 3.1 Conservatory track — 4 SKUs

One product per named style. Style is the product key; roof geometry is locked to the style (users can't pick wrong combinations).

| Style | Plan | Roof | New geometry |
|---|---|---|---|
| **Lean-to** | Rectangle | Mono-pitch glass (reuses existing) | Brick dwarf wall (new material only) |
| **Edwardian** | Rectangle | Hipped glass (4 panels meeting at a ridge) | Hipped-roof primitive |
| **Victorian** | 3- or 5-faceted bay (user picks) | Faceted hip following the bay facets | Non-rectangular plan support + faceted roof |
| **Orangery** | Rectangle, brick piers at corners/intervals | Flat perimeter roof + central glass lantern at a **fixed proportion** of the roof area | Masonry pier primitive + lantern primitive |

**Per-product configurator panel sections (conservatory):**
1. Style (locked once chosen, drives roof + plan)
2. Dimensions (style-dependent — bay angles for Victorian, pier spacing for Orangery)
3. Dwarf wall (height, brick type — N/A for Orangery which uses full-height piers)
4. Glazing (frame finish, glass tint)
5. Roof finish (glass tint for sloped/lantern, lead/zinc trim options)
6. Openings (per elevation — see §3.3)
7. Add-ons (lighting, heating — reuse existing catalog)
8. Service & delivery (reuse existing)

### 3.2 Extension track — 1 SKU, many configurations

One product, internally configured. Closer to a small building designer than the canopy pattern.

- **Plan model:** primary rectangle + optional return rectangle (covers rectangle / L / wraparound). Defined **per storey**.
- **Storeys:** 1 or 2. Upper storey has its own footprint (offset + dimensions) so set-back / jettied upper floors work.
- **Walls per elevation:** brick / render / cladding (user picks one per elevation).
- **Roof:** flat / mono-pitch / dual-pitch / hipped, with optional lantern. Tile or slate finish.
- **Openings per elevation:** dropdown of presets — see §3.3.
- **2nd storey is purely external** — visible mass with its own footprint, no stairs, no interior, no floor cutouts modeled.

**Per-product configurator panel sections (extension):**
1. Plan (footprint editor — two-rect model, per storey)
2. Storeys (toggle 1 or 2; if 2, switch which storey you're editing)
3. Walls (per elevation: material + finish)
4. Roof (shape + finish + lantern toggle)
5. Openings (per elevation, per storey)
6. Add-ons / Smart features (reuse existing where relevant)
7. Service & delivery (reuse existing)

### 3.3 Preset openings system (shared)

An opening = wall cutout + glazed insert (door or window). Per elevation, the user picks one preset from a list keyed by elevation width. Examples:

- Bifolds (full width)
- 2× French doors centered
- Sliders + side window
- Single French + flanking windows
- Window only (small / medium / large)
- Solid wall

The wall builder consumes the preset and renders the cutouts and frames. No drag-to-place; no per-opening sizing in v1.

### 3.4 Shared infrastructure (Sprint 0 — gating both tracks)

1. **Material library** — brick (multiple types), render (color swatches), tile/slate. PBR materials, thumbnail swatches, catalog entries. Visual design in-house (no brand reference provided).
2. **Per-product panel system** — declarative `productKey → SectionConfig[]` map and a panel renderer that respects it. **Opt-in only for new products**; the existing 10 products keep today's shared panel untouched.
3. **House backdrop** — 3–4 stylized house archetypes (modern detached, Victorian terrace, bungalow, semi). Static GLB or primitive-composed. Camera framing adjusts so the structure attaches cleanly. Designed in-house.
4. **Preset openings system** — opening primitive + preset catalog + wall-builder integration (see §3.3).
5. **Pricing seed** — add new `line_item_key` rows to `pricing_rules` for brick £/m², render £/m², tile £/m², glazing £/m², per-opening unit costs, plus per-product base prices. Per-agency overrides flow through the existing `/admin/pricing` UI automatically (see §5).

## 4. Out of scope

Explicitly **not** doing in this body of work:

- Refactor of the existing 10 products' configurator panel (they stay on the shared/legacy panel).
- Interior of any kind — no stairs, no floor cutouts, no internal walls for 2nd storey.
- Drag-to-place openings (preset dropdowns only).
- Free polygon footprints (two-rect model only).
- User-uploaded house photos / perspective compositing.
- Quote-grade pricing accuracy — visualization-first £/m² estimates only.
- Image generation pipeline work (in-app canvas snapshot remains the only image flow).

## 5. Pricing model

The multi-tenant pricing surface is already built — no new admin UI required.

- Per-tenant rates live in the `pricing_rules` table (`supabase/migrations/0001_init.sql:79-95`).
- `loadTenantPricing()` (`src/lib/pricing-server.ts`) resolves them server-side; `src/lib/pricing.ts` applies them client-side.
- The `/admin/pricing` page (`src/app/admin/pricing/page.tsx`) lets each agency edit any line item or apply a ±% markup.

**What we add:** new `line_item_key` rows seeded into `pricing_rules` for every new material and opening preset. They appear in the admin pricing table automatically. No new components.

Examples of new keys (final list TBD during implementation):
- `material.brick.london-stock.per-m2`
- `material.brick.red-engineering.per-m2`
- `material.render.smooth.per-m2`
- `material.tile.slate.per-m2`
- `material.glazing.standard.per-m2`
- `opening.bifold-full-width.unit`
- `opening.french-pair.unit`
- `product.conservatory.edwardian.base`
- `product.extension.base`
- `extension.storey-2.uplift`

## 6. Sequencing — parallel tracks

**Sprint 0 — Shared infrastructure** (no user-visible output, but unblocks both tracks)
- Material library + swatches
- Per-product panel renderer + section config model
- House backdrop archetypes (3–4)
- Preset openings system
- New pricing line items seeded

**Track A — Conservatory** (after Sprint 0, low → high complexity)
1. Lean-to (validates the pipeline end-to-end with the simplest geometry)
2. Edwardian (introduces hipped-roof primitive)
3. Orangery (introduces lantern + brick piers)
4. Victorian (introduces faceted bay plan + faceted hip roof)

**Track B — Extension** (after Sprint 0, incrementally adds capability)
1. Single-storey rectangle MVP (walls + flat or mono roof + one opening preset per elevation)
2. Full openings preset catalog wired
3. Roof variants (dual-pitch, hipped, lantern)
4. L-shape return (second rectangle)
5. 2nd storey (separate footprint, jettying / set-back)
6. Wraparound (return on second elevation)

Tracks A and B can be staffed independently after Sprint 0.

## 7. Key decisions log

Decisions made during scoping that this document depends on:

| # | Decision | Rationale |
|---|---|---|
| 1 | All 4 conservatory styles in scope | Customer expectations — these are named styles people shop for |
| 2 | Architectural extension (not garden-room) | Single-storey-rectangle-only wasn't enough; L/wraparound/2-storey are needed |
| 3 | Per-product panel sections | Cleaner UX than one panel showing irrelevant controls |
| 4 | All new materials (brick, render, tile) | Realistic visuals matter; visualization-first means materials lead |
| 5 | Parallel tracks (not sequential, not foundation-first) | Use multiple engineers; each track demoable independently |
| 6 | Preset openings (not drag-to-place) | 80% of real configurations; ships in a fraction of the time |
| 7 | 2nd storey included from day one | Avoid a costly refactor; customers expect it |
| 8 | Visualization-first pricing | Real quotes happen offline via sales; configurator is a lead-gen + visualization tool |
| 9 | Two-rect plan model | Covers rect / L / wraparound and per-storey footprints with a simple state shape |
| 10 | Style locked to roof (conservatory) | Matches how customers shop; prevents nonsense combinations |
| 11 | Stylized house archetypes (3–4) | Better context than today's bare wall, far cheaper than photo upload |
| 12 | Existing products' UI untouched | New panel system is opt-in; no risk to live products |
| 13 | Both 3- and 5-faceted Victorian | User choice; faceting count drives bay geometry |
| 14 | Orangery lantern proportional | Fixed ratio of roof area, not user-sized |
| 15 | 2nd storey purely external | No interior / stairs / floor cutouts |
| 16 | Per-agency pricing via existing surface | `pricing_rules` already per-tenant; only seed new line items |

## 8. Open implementation questions

To be resolved during Sprint 0 or before the first product ships:

- **Brick types** — which to ship at launch? (London stock, red engineering, buff, reclaimed, painted?) Per-agency selection or a fixed catalog?
- **House archetype detail level** — fully modeled meshes or impressionistic blocks? Affects asset budget.
- **Lantern proportion** — what fixed ratio? Industry typical is ~40–50% of roof area; suggest 45% pending validation.
- **Victorian facet angles** — standard 3-faceted is typically 90°/45°/45°/90°; 5-faceted is 22.5° per facet. Confirm during geometry build.
- **Openings preset catalog** — final list of presets per elevation width. Sales input would help.
- **Pricing rate defaults** — what £/m² seeds for brick / render / tile / glazing? Agencies override, but the seed needs reasonable starting numbers.
- **Backdrop attach point** — how does the configurator know where on the chosen house archetype the structure attaches? Likely a named anchor mesh per archetype.

## 9. References

- Existing product registry: `supabase/migrations/0003_seed_products.sql`
- Scene rendering: `src/components/configurator/Scene.tsx`
- Configurator UI: `src/components/configurator/ConfiguratorClient.tsx`
- Pricing engine: `src/lib/pricing.ts`, `src/lib/pricing-server.ts`
- Per-agency pricing rules: `supabase/migrations/0001_init.sql:79-95`
- Admin pricing UI: `src/app/admin/pricing/page.tsx`
- Tenancy / RLS: `supabase/migrations/0002_rls.sql`
