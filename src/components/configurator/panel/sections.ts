// Per-product configurator panel system. New products (conservatory + extension)
// opt in by defining a list of sections here; the renderer in PanelRenderer.tsx
// turns the list into UI. The existing 10 products keep the legacy hardcoded
// panel in ConfiguratorClient.tsx untouched.
//
// See docs/scoping/conservatory-extension.md §3.

import {
  BRICK, RENDER, ROOF_TILE, GLAZING_GRADE, OPENING_PRESET, HOUSE_BACKDROP,
  CONSERVATORY_STYLE, VICTORIAN_FACETS, EXTENSION_ROOF,
} from '@/lib/catalog';
import type { ConfigState } from '@/lib/pricing';

// One Section = one renderable card in the left panel. Discriminated by `kind`.
export type Section =
  | { kind: 'styleHeader' }                                              // conservatory style label (locked, no input)
  | { kind: 'frameColor' }
  | { kind: 'dimensions'; widthRange?: [number, number]; depthRange?: [number, number]; heightRange?: [number, number] }
  | { kind: 'victorianFacets' }
  | { kind: 'dwarfWall'; perimeterSides: ('front' | 'back' | 'left' | 'right')[] }
  | { kind: 'glazing' }
  | { kind: 'roofFinishGlass' }                                          // conservatory glass tint placeholder
  | { kind: 'openings' }
  | { kind: 'addons' }
  | { kind: 'service' }
  | { kind: 'extensionPlan' }
  | { kind: 'extensionStoreys' }
  | { kind: 'extensionWalls' }
  | { kind: 'extensionRoof' }
  | { kind: 'houseBackdrop' };

export type SectionEntry = { title: string; section: Section };

// ------------------------------------------------------------
// Per-product panel definitions
// ------------------------------------------------------------

const CONSERVATORY_COMMON: SectionEntry[] = [
  { title: 'Style',           section: { kind: 'styleHeader' } },
  { title: 'Frame finish',    section: { kind: 'frameColor' } },
  { title: 'Dimensions',      section: { kind: 'dimensions', widthRange: [2.5, 8], depthRange: [2, 5], heightRange: [2.4, 3.2] } },
  { title: 'Dwarf wall',      section: { kind: 'dwarfWall', perimeterSides: ['front', 'left', 'right'] } },
  { title: 'Glazing',         section: { kind: 'glazing' } },
  { title: 'Roof finish',     section: { kind: 'roofFinishGlass' } },
  { title: 'Openings',        section: { kind: 'openings' } },
  { title: 'House backdrop',  section: { kind: 'houseBackdrop' } },
  { title: 'Add-ons',         section: { kind: 'addons' } },
  { title: 'Service',         section: { kind: 'service' } },
];

export const PRODUCT_PANELS: Record<string, SectionEntry[]> = {
  'conservatory-leanto':    CONSERVATORY_COMMON,
  'conservatory-edwardian': CONSERVATORY_COMMON,
  'conservatory-orangery':  CONSERVATORY_COMMON,
  'conservatory-victorian': [
    { title: 'Style',           section: { kind: 'styleHeader' } },
    { title: 'Frame finish',    section: { kind: 'frameColor' } },
    { title: 'Bay shape',       section: { kind: 'victorianFacets' } },
    { title: 'Dimensions',      section: { kind: 'dimensions', widthRange: [3, 6], depthRange: [2.5, 4], heightRange: [2.4, 3.2] } },
    { title: 'Dwarf wall',      section: { kind: 'dwarfWall', perimeterSides: ['front', 'left', 'right'] } },
    { title: 'Glazing',         section: { kind: 'glazing' } },
    { title: 'Roof finish',     section: { kind: 'roofFinishGlass' } },
    { title: 'House backdrop',  section: { kind: 'houseBackdrop' } },
    { title: 'Add-ons',         section: { kind: 'addons' } },
    { title: 'Service',         section: { kind: 'service' } },
  ],
  'extension': [
    { title: 'Frame finish',    section: { kind: 'frameColor' } },
    { title: 'Plan',            section: { kind: 'extensionPlan' } },
    { title: 'Storeys',         section: { kind: 'extensionStoreys' } },
    { title: 'Walls',           section: { kind: 'extensionWalls' } },
    { title: 'Roof',            section: { kind: 'extensionRoof' } },
    { title: 'Openings',        section: { kind: 'openings' } },
    { title: 'House backdrop',  section: { kind: 'houseBackdrop' } },
    { title: 'Add-ons',         section: { kind: 'addons' } },
    { title: 'Service',         section: { kind: 'service' } },
  ],
};

// True iff this product uses the new per-product panel (vs the legacy shared one).
export function usesNewPanel(productKey: string): boolean {
  return productKey in PRODUCT_PANELS;
}

// ------------------------------------------------------------
// Per-product defaults — merged into ConfigState at mount.
// ------------------------------------------------------------

const DEFAULT_OPENINGS = { front: 'bifold-full', back: 'solid', left: 'window-medium', right: 'window-medium' } as const;
const DEFAULT_DWARF: { height: number; brick: string } = { height: 0.6, brick: 'red-engineering' };

export function productDefaults(productKey: string): Partial<ConfigState> {
  if (productKey.startsWith('conservatory-')) {
    const styleKey = productKey.replace('conservatory-', '') as keyof typeof CONSERVATORY_STYLE;
    return {
      conservatoryStyle: styleKey,
      structure: 'wallmounted',
      length: 4.5,
      depth: 3.2,
      height: 2.7,
      roof: 'glass-sloped',
      walls: { front: 'glass', back: 'none', left: 'glass', right: 'glass' },
      dwarfWall: { ...DEFAULT_DWARF },
      glazingGrade: 'standard',
      openings: { ...DEFAULT_OPENINGS },
      houseBackdrop: 'modern-detached',
      ...(styleKey === 'victorian' ? { victorianFacets: '3' as const } : {}),
    };
  }
  if (productKey === 'extension') {
    return {
      structure: 'wallmounted',
      length: 6,
      depth: 4,
      height: 2.7,
      roof: 'glass-flat',  // visual fallback until extension roof builder lands
      extensionPlan: { primary: { length: 6, depth: 4 }, return: null },
      storeys: 1,
      extensionWalls: {
        front: { kind: 'brick', finish: 'london-stock' },
        back:  { kind: 'brick', finish: 'london-stock' },
        left:  { kind: 'brick', finish: 'london-stock' },
        right: { kind: 'brick', finish: 'london-stock' },
      },
      extensionRoof: { shape: 'dual', tile: 'slate-grey', lantern: false },
      openings: { front: 'bifold-full', back: 'solid', left: 'window-medium', right: 'window-medium' },
      houseBackdrop: 'modern-detached',
    };
  }
  return {};
}

// Re-export catalog maps the renderer consumes, so callers don't import both.
export { BRICK, RENDER, ROOF_TILE, GLAZING_GRADE, OPENING_PRESET, HOUSE_BACKDROP, CONSERVATORY_STYLE, VICTORIAN_FACETS, EXTENSION_ROOF };
