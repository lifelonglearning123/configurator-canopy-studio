// Upper-storey window layout — shared by the 3D scene (src/components/
// configurator/Scene.tsx) and quote() (src/lib/pricing.ts) so the number of
// windows RENDERED always equals the number of windows PRICED.
//
// Upper storeys take windows only (no doors), reusing the existing
// opening.window-*.unit pricing rows so no new rows need seeding. A preset is
// auto-repeated 1–3× evenly across the elevation, the way real upper storeys
// repeat windows, rather than leaving one lonely centred unit on a wide wall.

export const UPPER_WINDOW_PRESETS = ['solid', 'window-small', 'window-medium', 'window-large'] as const;

export type UpperWindowUnit = { cx: number; w: number; h: number; sill: number };

const WINDOW_UNIT: Record<string, { w: number; h: number; sill: number }> = {
  'window-small':  { w: 0.7, h: 0.8, sill: 1.1 },
  'window-medium': { w: 1.2, h: 1.1, sill: 0.9 },
  'window-large':  { w: 2.2, h: 1.4, sill: 0.8 },
};

export function isUpperWindowPreset(preset: string): boolean {
  return preset in WINDOW_UNIT;
}

// How many units of this preset fit the elevation (1–3, needs ~1m of brick
// between/around units). Must stay in lock-step with upperWindowLayout().
export function upperWindowCount(preset: string, wallW: number): number {
  const u = WINDOW_UNIT[preset];
  if (!u) return 0;
  const w = Math.min(u.w, Math.max(0.6, wallW - 0.8));
  return Math.max(1, Math.min(3, Math.floor((wallW - 0.6) / (w + 1.0))));
}

// Unit rectangles in wall-local coords (cx from wall centre, sill from the
// storey floor), spread evenly across the elevation.
export function upperWindowLayout(preset: string, wallW: number): UpperWindowUnit[] {
  const u = WINDOW_UNIT[preset];
  if (!u) return [];
  const w = Math.min(u.w, Math.max(0.6, wallW - 0.8));
  const n = upperWindowCount(preset, wallW);
  const out: UpperWindowUnit[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ cx: -wallW / 2 + (wallW * (i + 0.5)) / n, w, h: u.h, sill: u.sill });
  }
  return out;
}
