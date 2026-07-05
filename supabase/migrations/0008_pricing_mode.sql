-- =============================================================
-- Per-product pricing detail level, chosen by the seller on
-- /admin/pricing (docs/scoping/flexible-pricing.md follow-up):
--
--   detailed — structural price (band or formula) + itemised extras
--              (walls, add-ons, service…). The default.
--   simple   — the size-band price IS the whole guide price; buyers
--              still design extras in 3D and they are captured on the
--              lead, but they are not priced in the guide.
--
-- Lives on price_matrices because simple mode only makes sense when a
-- band grid supplies the all-in price.
-- =============================================================

alter table price_matrices
  add column if not exists mode text not null default 'detailed'
  check (mode in ('detailed', 'simple'));
