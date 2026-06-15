// Pure pricing functions (client-safe). The server-only loader lives in pricing-server.ts.

import { WALL, ROOF, FRAME_COLORS } from './catalog';

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

  const subtotalMinor = lines.reduce((s, l) => s + l.amountMinor, 0);
  return { lines, subtotalMinor };
}

function cap(s: string): string { return s[0].toUpperCase() + s.slice(1); }

export function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amountMinor / 100);
}
