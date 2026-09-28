// Size-only product presets: a fixed version of an existing product where the
// buyer only sets width / projection / height. Every other option is locked
// here, and pricing (rows + size-band grid) is shared with `baseProduct`, so
// sellers keep one set of prices in /admin/pricing. The full base product
// stays available for buyers who want every option.

import type { ConfigState } from './pricing';

export type ProductPreset = {
  /** Product whose pricing + full configurator this preset is a version of. */
  baseProduct: string;
  /** Option values the buyer cannot change. */
  locked: Partial<ConfigState>;
  /** Slider ranges in metres — kept inside the base product's price-grid bands. */
  ranges: { width: [number, number]; depth: [number, number]; height: [number, number] };
};

const VERANDA_LOCKED: Partial<ConfigState> = {
  structure: 'wallmounted',
  frameColor: 'anthracite',
  slatColor: 'anthracite',
  overhang: 0,
  walls: { front: 'none', back: 'none', left: 'none', right: 'none' },
  addons: { lighting: false, bar: false, heater: false, speakers: false },
  cladding: 'none',
  flooring: 'none',
  interiorWalls: 'none',
  automation: 'none',
  electrical: 'none',
  service: 'install',
};

// Matches the veranda size-band grid in price-matrix.ts (3–7 m × 2.5–4 m).
const VERANDA_RANGES: ProductPreset['ranges'] = { width: [3, 7], depth: [2.5, 4], height: [2.0, 3.5] };

export const PRODUCT_PRESETS: Record<string, ProductPreset> = {
  'veranda-glass': { baseProduct: 'veranda', locked: { ...VERANDA_LOCKED, roof: 'glass-sloped' }, ranges: VERANDA_RANGES },
  'veranda-poly':  { baseProduct: 'veranda', locked: { ...VERANDA_LOCKED, roof: 'poly-sloped' },  ranges: VERANDA_RANGES },
};

export function presetFor(productKey: string): ProductPreset | null {
  return PRODUCT_PRESETS[productKey] ?? null;
}

/** The product whose pricing a key uses — the base for presets, itself otherwise. */
export function pricingProductKey(productKey: string): string {
  return presetFor(productKey)?.baseProduct ?? productKey;
}

/** Preset keys built on a given base product (for admin hints). */
export function presetsOf(baseProduct: string): string[] {
  return Object.entries(PRODUCT_PRESETS).filter(([, p]) => p.baseProduct === baseProduct).map(([k]) => k);
}
