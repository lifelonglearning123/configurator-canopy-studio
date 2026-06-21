// Pure pricing functions (client-safe). The server-only loader lives in pricing-server.ts.

import { WALL, ROOF, FRAME_COLORS } from './catalog';

export type Elevation = 'front' | 'back' | 'left' | 'right';

// Per-elevation opening preset for new products (conservatory + extension).
export type Openings = Record<Elevation, string>;

// Conservatory-specific extras.
export type DwarfWall = { height: number; brick: string };

// Extension-specific plan: primary rect + optional return rect attached on an edge.
export type ExtensionRect = { length: number; depth: number };
export type ExtensionReturn = { length: number; depth: number; edge: Elevation };
export type ExtensionPlan = { primary: ExtensionRect; return: ExtensionReturn | null };

// Per-elevation wall material for extension.
export type WallMaterialKind = 'brick' | 'render' | 'cladding';
export type WallMaterialChoice = { kind: WallMaterialKind; finish: string };
export type ExtensionWalls = Record<Elevation, WallMaterialChoice>;

// Extension roof config.
export type ExtensionRoof = { shape: 'flat' | 'mono' | 'dual' | 'hipped'; tile: string; lantern: boolean };

// Per-storey footprint for extension. Upper can be smaller / set-back.
export type UpperStorey = { primary: ExtensionRect & { offset: { x: number; z: number } }; return: ExtensionReturn | null };

export type ConfigState = {
  product: string;
  structure: 'freestanding' | 'wallmounted';
  frameColor: string;
  slatColor: string;
  length: number;
  depth: number;
  height: number;
  overhang: number;
  angle: number;
  roof: string;
  slatDirection: 'width' | 'length';
  slatRotation: 'left' | 'right';
  slatIsolation: boolean;
  walls: { front: string; back: string; left: string; right: string };
  addons: { lighting: boolean; bar: boolean; heater: boolean; speakers: boolean };
  cladding: string;
  flooring: string;
  interiorWalls: string;
  automation: string;
  electrical: string;
  service: string;
  elementsPosition: string;

  // ---- New-product fields (optional; only used by conservatory + extension) ----
  conservatoryStyle?: 'leanto' | 'edwardian' | 'victorian' | 'orangery';
  victorianFacets?: '3' | '5';
  dwarfWall?: DwarfWall;
  glazingGrade?: string;
  openings?: Openings;
  houseBackdrop?: string;

  extensionPlan?: ExtensionPlan;
  storeys?: 1 | 2;
  upperStorey?: UpperStorey;
  extensionWalls?: ExtensionWalls;
  extensionRoof?: ExtensionRoof;
};

export type PriceLine = { key: string; label: string; amountMinor: number };

// Pure pricing function. Takes the rules map + state, returns the breakdown.
// Mirrors priceBreakdown() in the HTML prototype but in tenant pricing terms.
export function quote(state: ConfigState, prices: Map<string, { label: string; amountMinor: number }>): {
  lines: PriceLine[];
  subtotalMinor: number;
} {
  const lines: PriceLine[] = [];
  const get = (key: string) => prices.get(key);
  const push = (key: string, fallbackLabel: string, amountMinor: number) => {
    if (amountMinor <= 0) return;
    const rule = get(key);
    lines.push({ key, label: rule?.label ?? fallbackLabel, amountMinor: rule?.amountMinor ?? amountMinor });
  };

  const area = state.length * state.depth;

  // Base
  push(`base.${state.structure}`, `Base (${state.structure})`, 0);

  // Roof: base + perM2*area
  const rk = state.roof;
  const roofBase = get(`roof.${rk}.base`)?.amountMinor ?? 0;
  const roofPerM2 = get(`roof.${rk}.perM2`)?.amountMinor ?? 0;
  const roofLabel = ROOF[rk as keyof typeof ROOF]?.label ?? rk;
  if (roofBase + roofPerM2 > 0) {
    lines.push({
      key: `roof.${rk}`,
      label: `${roofLabel} · ${area.toFixed(1)} m²`,
      amountMinor: roofBase + Math.round(roofPerM2 * area),
    });
  }

  // Slat upgrades
  if (rk.startsWith('louvred') && state.slatIsolation) push('slats.isolation', 'Insulated slats', 0);
  if (state.slatColor !== state.frameColor) {
    const c = FRAME_COLORS[state.slatColor as keyof typeof FRAME_COLORS];
    push('slats.twotone', `Two-tone slat colour (${c?.label.split(' — ')[0] ?? state.slatColor})`, 0);
  }

  // Overhang
  if (state.overhang > 0.05) {
    const per = get('misc.overhang_per_m')?.amountMinor ?? 0;
    const dim = Math.max(state.length, state.depth);
    if (per > 0) {
      lines.push({ key: 'misc.overhang', label: `Roof overhang (+${state.overhang.toFixed(2)} m)`, amountMinor: Math.round(per * state.overhang * dim) });
    }
  }

  // Walls per side
  for (const side of ['front', 'back', 'left', 'right'] as const) {
    const w = state.walls[side];
    if (!w || w === 'none') continue;
    const isFB = side === 'front' || side === 'back';
    const ruleKey = `wall.${w}.${isFB ? 'frontback' : 'leftright'}`;
    const rule = get(ruleKey);
    if (rule && rule.amountMinor > 0) {
      const label = WALL[w as keyof typeof WALL]?.label ?? w;
      lines.push({ key: `${ruleKey}.${side}`, label: `${cap(side)}: ${label}`, amountMinor: rule.amountMinor });
    }
  }

  // Materials & smart features
  if (state.cladding && state.cladding !== 'none')           push(`cladding.${state.cladding}`,    'Cladding', 0);
  if (state.flooring && state.flooring !== 'none')           push(`flooring.${state.flooring}`,    'Flooring', 0);
  if (state.interiorWalls && state.interiorWalls !== 'none') push(`interior.${state.interiorWalls}`,'Interior walls', 0);

  for (const [k, on] of Object.entries(state.addons)) if (on) push(`addon.${k}`, `Addon ${k}`, 0);

  if (state.automation && state.automation !== 'none') push(`automation.${state.automation}`, 'Automation', 0);
  if (state.electrical && state.electrical !== 'none') push(`electrical.${state.electrical}`, 'Electrical', 0);
  if (state.service) push(`service.${state.service}`, 'Service', 0);

  // Oversize premium
  if (state.length > 5) {
    const per = get('misc.oversize_per_m')?.amountMinor ?? 0;
    if (per > 0) lines.push({ key: 'misc.oversize', label: 'Oversize structural premium', amountMinor: Math.round(per * (state.length - 5)) });
  }

  // -----------------------------------------------------------
  // Conservatory + extension pricing (only fires for those products)
  // -----------------------------------------------------------

  // Per-product base for new products
  if (state.product.startsWith('conservatory-') || state.product === 'extension') {
    push(`product.${state.product}.base`, `${state.product} — base`, 0);
  }

  // Dwarf wall: pence × perimeter length (front + 2 sides for wall-mounted)
  if (state.dwarfWall && state.dwarfWall.brick) {
    const perM = get('conservatory.dwarf-wall.perM')?.amountMinor ?? 0;
    const brickPerM2 = get(`material.brick.${state.dwarfWall.brick}.perM2`)?.amountMinor ?? 0;
    const perim = state.length + state.depth * 2; // front + two sides for wall-mounted
    const wallArea = perim * state.dwarfWall.height;
    if (perM > 0)        lines.push({ key: 'conservatory.dwarf-wall', label: `Dwarf wall (${perim.toFixed(1)} m)`,             amountMinor: Math.round(perM * perim) });
    if (brickPerM2 > 0)  lines.push({ key: 'material.brick.dwarf',     label: `Dwarf wall brick (${wallArea.toFixed(1)} m²)`,  amountMinor: Math.round(brickPerM2 * wallArea) });
  }

  // Glazing grade uplift — applied to whole roof area for conservatory
  if (state.glazingGrade && state.glazingGrade !== 'standard') {
    const per = get(`material.glazing.${state.glazingGrade}.perM2`)?.amountMinor ?? 0;
    if (per > 0) lines.push({ key: `material.glazing.${state.glazingGrade}`, label: `Glazing upgrade (${area.toFixed(1)} m²)`, amountMinor: Math.round(per * area) });
  }

  // Openings — one unit cost per elevation that isn't 'solid'
  if (state.openings) {
    for (const side of ['front', 'back', 'left', 'right'] as const) {
      const preset = state.openings[side];
      if (!preset || preset === 'solid') continue;
      const rule = get(`opening.${preset}.unit`);
      if (rule && rule.amountMinor > 0) {
        lines.push({ key: `opening.${preset}.${side}`, label: `${cap(side)}: ${rule.label.replace(/ — per opening$/, '')}`, amountMinor: rule.amountMinor });
      }
    }
  }

  // Extension: walls per elevation (brick / render / cladding)
  if (state.product === 'extension' && state.extensionWalls) {
    // Each wall area ≈ side length × height (single storey baseline)
    const sideLen = (s: Elevation) => (s === 'front' || s === 'back') ? state.length : state.depth;
    for (const side of ['front', 'back', 'left', 'right'] as const) {
      const w = state.extensionWalls[side];
      if (!w) continue;
      const wallArea = sideLen(side) * state.height;
      const key = `material.${w.kind === 'cladding' ? `cladding.${w.finish}` : `${w.kind}.${w.finish}.perM2`}`;
      // cladding uses the existing flat-price catalog; brick/render use perM2 keys
      if (w.kind === 'cladding') {
        if (w.finish !== 'none') push(`cladding.${w.finish}`, `${cap(side)}: cladding`, 0);
      } else {
        const per = get(`material.${w.kind}.${w.finish}.perM2`)?.amountMinor ?? 0;
        if (per > 0) lines.push({ key: `${key}.${side}`, label: `${cap(side)}: ${w.kind} (${wallArea.toFixed(1)} m²)`, amountMinor: Math.round(per * wallArea) });
      }
    }
  }

  // Extension roof shape + tile + optional lantern
  if (state.product === 'extension' && state.extensionRoof) {
    const r = state.extensionRoof;
    const base  = get(`extension.roof.${r.shape}.base`)?.amountMinor ?? 0;
    const perM2 = get(`extension.roof.${r.shape}.perM2`)?.amountMinor ?? 0;
    if (base + perM2 > 0) {
      lines.push({ key: `extension.roof.${r.shape}`, label: `Extension roof · ${r.shape} (${area.toFixed(1)} m²)`, amountMinor: base + Math.round(perM2 * area) });
    }
    if (r.tile) {
      const tile = get(`material.tile.${r.tile}.perM2`)?.amountMinor ?? 0;
      if (tile > 0) lines.push({ key: `material.tile.${r.tile}`, label: `Roof finish (${area.toFixed(1)} m²)`, amountMinor: Math.round(tile * area) });
    }
    if (r.lantern) push('extension.lantern.unit', 'Roof lantern', 0);
  }

  // Extension: return leg uplift + 2nd-storey uplift
  if (state.product === 'extension' && state.extensionPlan?.return) {
    push('extension.return-leg.uplift', 'Return leg (L / wraparound)', 0);
  }
  if (state.product === 'extension' && state.storeys === 2 && state.upperStorey) {
    const u = state.upperStorey;
    const upperArea = u.primary.length * u.primary.depth + (u.return ? u.return.length * u.return.depth : 0);
    const per = get('extension.storey-2.uplift_per_m2')?.amountMinor ?? 0;
    if (per > 0) lines.push({ key: 'extension.storey-2', label: `2nd storey (${upperArea.toFixed(1)} m²)`, amountMinor: Math.round(per * upperArea) });
  }

  const subtotalMinor = lines.reduce((s, l) => s + l.amountMinor, 0);
  return { lines, subtotalMinor };
}

function cap(s: string): string { return s[0].toUpperCase() + s.slice(1); }

export function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amountMinor / 100);
}
