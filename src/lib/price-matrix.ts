// Size-band matrix pricing (per docs/scoping/flexible-pricing.md).
//
// Sellers price the way trade price lists do: a grid of width × projection
// bands with a hand-set price per band, one column per roof material —
// instead of (or alongside) the base + £/m² formula. quote() uses a matrix
// cell for the structural roof line whenever one covers the configured
// size + roof; anything the grid doesn't cover falls back to the formula,
// so a partially filled grid is always safe.
//
// Rollout is product-by-product; the veranda is first.

import { z } from 'zod';
import { ROOF } from './catalog';

export type PriceMatrix = {
  /** Ascending band upper edges in metres, e.g. [3, 4, 5, 6, 7]. */
  widths: number[];
  depths: number[];
  /** roof key → rows by depth index → cols by width index. Pence. null = band not priced (formula fallback). */
  columns: Record<string, Array<Array<number | null>>>;
};

export const priceMatrixSchema = z.object({
  widths: z.array(z.number().positive()).min(1).max(12),
  depths: z.array(z.number().positive()).min(1).max(12),
  columns: z.record(z.string(), z.array(z.array(z.number().int().nonnegative().nullable()))),
}).refine(m =>
  Object.values(m.columns).every(rows =>
    rows.length === m.depths.length && rows.every(r => r.length === m.widths.length)
  ), { message: 'every column grid must be depths × widths in shape' });

export type MatrixHit = { amountMinor: number; bandW: number; bandD: number };

// Snap UP to the smallest band that fits the configured size — trade price
// lists charge a 4.3 m job at the 5 m column. Sizes beyond the largest band
// (or unpriced cells) return null → caller falls back to formula pricing.
export function matrixLookup(m: PriceMatrix, roofKey: string, lengthM: number, depthM: number): MatrixHit | null {
  const col = m.columns[roofKey];
  if (!col) return null;
  const wi = m.widths.findIndex(w => w >= lengthM - 1e-9);
  const di = m.depths.findIndex(d => d >= depthM - 1e-9);
  if (wi < 0 || di < 0) return null;
  const amountMinor = col[di]?.[wi] ?? null;
  if (amountMinor == null) return null;
  return { amountMinor, bandW: m.widths[wi], bandD: m.depths[di] };
}

// Default veranda grid — same band steps as real trade price lists
// (the seller workbook uses 4–7 m × 2.5–4 m). Cells are derived from the
// current formula rates so switching a tenant to matrix mode changes
// nothing until the seller edits cells.
export const VERANDA_MATRIX_ROOFS = ['glass-sloped', 'poly-sloped'] as const;

export function defaultVerandaMatrix(): PriceMatrix {
  const widths = [3, 4, 5, 6, 7];
  const depths = [2.5, 3, 3.5, 4];
  const columns: PriceMatrix['columns'] = {};
  for (const rk of VERANDA_MATRIX_ROOFS) {
    const r = ROOF[rk];
    columns[rk] = depths.map(d => widths.map(w => Math.round((r.price + r.perM2 * w * d) * 100)));
  }
  return { widths, depths, columns };
}

// Which products have matrix pricing available (rollout list).
export function matrixProductKeys(): string[] {
  return ['veranda'];
}
