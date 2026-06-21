'use client';

// Renders a Section[] (from sections.ts) into the left-side configurator UI.
// Reads from / writes to the parent's ConfigState via the `state` / `set` props.

import { FRAME_COLORS, ADDONS, SERVICE } from '@/lib/catalog';
import type { ConfigState, Elevation, WallMaterialKind } from '@/lib/pricing';
import {
  PRODUCT_PANELS, BRICK, RENDER, ROOF_TILE, GLAZING_GRADE, OPENING_PRESET,
  HOUSE_BACKDROP, CONSERVATORY_STYLE, VICTORIAN_FACETS, EXTENSION_ROOF,
} from './sections';

type Props = {
  productKey: string;
  productName: string;
  productTagline: string;
  state: ConfigState;
  setState: (updater: (s: ConfigState) => ConfigState) => void;
};

export function PanelRenderer({ productKey, productName, productTagline, state, setState }: Props) {
  const sections = PRODUCT_PANELS[productKey];
  if (!sections) return null;

  const set = <K extends keyof ConfigState>(k: K, v: ConfigState[K]) => setState(s => ({ ...s, [k]: v }));
  const setOpening = (side: Elevation, v: string) =>
    setState(s => ({ ...s, openings: { front: s.openings?.front ?? 'solid', back: s.openings?.back ?? 'solid', left: s.openings?.left ?? 'solid', right: s.openings?.right ?? 'solid', [side]: v } }));
  const setWallMat = (side: Elevation, kind: WallMaterialKind, finish: string) =>
    setState(s => ({ ...s, extensionWalls: { ...(s.extensionWalls ?? { front: { kind, finish }, back: { kind, finish }, left: { kind, finish }, right: { kind, finish } }), [side]: { kind, finish } } }));
  const setAddon = (k: keyof ConfigState['addons'], v: boolean) =>
    setState(s => ({ ...s, addons: { ...s.addons, [k]: v } }));

  return (
    <>
      <div className="text-[10px] uppercase tracking-[0.18em] text-stone-500 mb-1.5">Configure</div>
      <h2 className="text-3xl tracking-tight" style={{ fontFamily: 'serif' }}>{productName}</h2>
      <p className="text-xs text-stone-500 mt-2">{productTagline}</p>

      {sections.map((entry, i) => {
        const s = entry.section;
        return (
          <Section key={i} title={entry.title}>
            {s.kind === 'styleHeader' && state.conservatoryStyle && (
              <div className="text-xs px-3 py-3 rounded-lg bg-stone-50 border border-stone-200">
                <span className="font-medium">{CONSERVATORY_STYLE[state.conservatoryStyle].label}</span>
                <span className="text-stone-500 ml-2">— roof locked to style</span>
              </div>
            )}

            {s.kind === 'frameColor' && (
              <>
                <Swatches value={state.frameColor} options={Object.entries(FRAME_COLORS).map(([k, v]) => ({ value: k, hex: v.hex, title: v.label }))} onChange={v => set('frameColor', v)} />
                <p className="text-[11px] text-stone-500 mt-2">{FRAME_COLORS[state.frameColor as keyof typeof FRAME_COLORS]?.label}</p>
              </>
            )}

            {s.kind === 'dimensions' && (
              <>
                <Slider label="Width"      value={state.length} min={s.widthRange?.[0]  ?? 1}   max={s.widthRange?.[1]  ?? 10}  step={0.1}  unit="m" onChange={v => set('length', v)} />
                <Slider label="Projection" value={state.depth}  min={s.depthRange?.[0]  ?? 0.5} max={s.depthRange?.[1]  ?? 5}   step={0.05} unit="m" onChange={v => set('depth', v)} />
                <Slider label="Height"     value={state.height} min={s.heightRange?.[0] ?? 2.0} max={s.heightRange?.[1] ?? 3.5} step={0.05} unit="m" onChange={v => set('height', v)} />
                <div className="mt-2 text-[10px] uppercase tracking-wider text-stone-500 flex justify-between">
                  <span>Footprint</span>
                  <span className="tabular-nums">{(state.length * state.depth).toFixed(1)} m²</span>
                </div>
              </>
            )}

            {s.kind === 'victorianFacets' && (
              <Chips
                value={state.victorianFacets ?? '3'}
                options={Object.entries(VICTORIAN_FACETS).map(([k, v]) => [k, v.label] as [string, string])}
                onChange={v => set('victorianFacets', v as '3' | '5')}
              />
            )}

            {s.kind === 'dwarfWall' && (
              <>
                <Slider label="Height" value={state.dwarfWall?.height ?? 0.6} min={0} max={1.2} step={0.05} unit="m"
                  onChange={v => setState(st => ({ ...st, dwarfWall: { brick: st.dwarfWall?.brick ?? 'red-engineering', height: v } }))} />
                <Swatches
                  value={state.dwarfWall?.brick ?? 'red-engineering'}
                  options={Object.entries(BRICK).map(([k, v]) => ({ value: k, hex: v.hex, title: v.label }))}
                  onChange={v => setState(st => ({ ...st, dwarfWall: { height: st.dwarfWall?.height ?? 0.6, brick: v } }))}
                />
                <p className="text-[11px] text-stone-500 mt-1">{BRICK[state.dwarfWall?.brick as keyof typeof BRICK]?.label ?? '—'}</p>
              </>
            )}

            {s.kind === 'glazing' && (
              <Select label="Glazing grade" value={state.glazingGrade ?? 'standard'}
                options={Object.entries(GLAZING_GRADE).map(([k, v]) => ({ value: k, label: v.label }))}
                onChange={v => set('glazingGrade', v)} />
            )}

            {s.kind === 'roofFinishGlass' && (
              <p className="text-[11px] text-stone-500">Glass tint / trim options — coming in a later release.</p>
            )}

            {s.kind === 'openings' && (
              <>
                {(['front', 'back', 'left', 'right'] as const).map(side => (
                  <Select key={side} label={cap(side)}
                    value={state.openings?.[side] ?? 'solid'}
                    options={Object.entries(OPENING_PRESET).map(([k, v]) => ({ value: k, label: v.label }))}
                    onChange={v => setOpening(side, v)} />
                ))}
              </>
            )}

            {s.kind === 'addons' && (
              <>
                {(Object.entries(ADDONS) as [keyof typeof ADDONS, typeof ADDONS[keyof typeof ADDONS]][]).map(([k, v]) => (
                  <Checkbox key={k} label={v.label} checked={!!state.addons[k]} onChange={c => setAddon(k, c)} />
                ))}
              </>
            )}

            {s.kind === 'service' && (
              <Select label="Service tier" value={state.service}
                options={Object.entries(SERVICE).map(([k, v]) => ({ value: k, label: v.label }))}
                onChange={v => set('service', v)} />
            )}

            {s.kind === 'extensionPlan' && (
              <>
                <Slider label="Primary width" value={state.extensionPlan?.primary.length ?? 6} min={3} max={12} step={0.25} unit="m"
                  onChange={v => setState(st => ({ ...st, extensionPlan: { primary: { length: v, depth: st.extensionPlan?.primary.depth ?? 4 }, return: st.extensionPlan?.return ?? null }, length: v }))} />
                <Slider label="Primary depth" value={state.extensionPlan?.primary.depth ?? 4} min={2} max={8} step={0.25} unit="m"
                  onChange={v => setState(st => ({ ...st, extensionPlan: { primary: { length: st.extensionPlan?.primary.length ?? 6, depth: v }, return: st.extensionPlan?.return ?? null }, depth: v }))} />
                <Checkbox label="Add return leg (L / wraparound)"
                  checked={!!state.extensionPlan?.return}
                  onChange={c => setState(st => ({ ...st, extensionPlan: { primary: st.extensionPlan?.primary ?? { length: 6, depth: 4 }, return: c ? { length: 3, depth: 2, edge: 'left' } : null } }))} />
                {state.extensionPlan?.return && (
                  <div className="pl-3 border-l-2 border-stone-200 space-y-3">
                    <Slider label="Return width" value={state.extensionPlan.return.length} min={1.5} max={6} step={0.25} unit="m"
                      onChange={v => setState(st => ({ ...st, extensionPlan: { primary: st.extensionPlan!.primary, return: { ...st.extensionPlan!.return!, length: v } } }))} />
                    <Slider label="Return depth" value={state.extensionPlan.return.depth} min={1.5} max={5} step={0.25} unit="m"
                      onChange={v => setState(st => ({ ...st, extensionPlan: { primary: st.extensionPlan!.primary, return: { ...st.extensionPlan!.return!, depth: v } } }))} />
                    <Select label="Attached to" value={state.extensionPlan.return.edge}
                      options={(['front', 'back', 'left', 'right'] as const).map(e => ({ value: e, label: cap(e) }))}
                      onChange={v => setState(st => ({ ...st, extensionPlan: { primary: st.extensionPlan!.primary, return: { ...st.extensionPlan!.return!, edge: v as Elevation } } }))} />
                  </div>
                )}
                <p className="text-[11px] text-stone-500 mt-1">Visual rendering of L/wraparound footprint lands in a later release.</p>
              </>
            )}

            {s.kind === 'extensionStoreys' && (
              <Chips value={String(state.storeys ?? 1)}
                options={[['1', 'Single storey'], ['2', 'Two storeys']]}
                onChange={v => set('storeys', (v === '2' ? 2 : 1) as 1 | 2)} />
            )}

            {s.kind === 'extensionWalls' && (
              <>
                {(['front', 'back', 'left', 'right'] as const).map(side => {
                  const w = state.extensionWalls?.[side];
                  const kind = w?.kind ?? 'brick';
                  const opts = kind === 'brick' ? BRICK : kind === 'render' ? RENDER : {};
                  return (
                    <div key={side} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-stone-600 w-16">{cap(side)}</span>
                        <select value={kind} onChange={e => setWallMat(side, e.target.value as WallMaterialKind, e.target.value === 'brick' ? 'london-stock' : e.target.value === 'render' ? 'white' : 'timber')}
                          className="px-2 py-1.5 rounded border border-stone-200 bg-white text-xs">
                          <option value="brick">Brick</option>
                          <option value="render">Render</option>
                          <option value="cladding">Cladding</option>
                        </select>
                        {kind !== 'cladding' && (
                          <select value={w?.finish ?? Object.keys(opts)[0]} onChange={e => setWallMat(side, kind, e.target.value)}
                            className="flex-1 px-2 py-1.5 rounded border border-stone-200 bg-white text-xs">
                            {Object.entries(opts).map(([k, v]) => <option key={k} value={k}>{(v as { label: string }).label}</option>)}
                          </select>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {s.kind === 'extensionRoof' && (
              <>
                <Select label="Shape" value={state.extensionRoof?.shape ?? 'dual'}
                  options={Object.entries(EXTENSION_ROOF).map(([k, v]) => ({ value: k, label: v.label }))}
                  onChange={v => setState(st => ({ ...st, extensionRoof: { shape: v as 'flat' | 'mono' | 'dual' | 'hipped', tile: st.extensionRoof?.tile ?? 'slate-grey', lantern: st.extensionRoof?.lantern ?? false } }))} />
                <Select label="Tile / slate" value={state.extensionRoof?.tile ?? 'slate-grey'}
                  options={Object.entries(ROOF_TILE).map(([k, v]) => ({ value: k, label: v.label }))}
                  onChange={v => setState(st => ({ ...st, extensionRoof: { shape: st.extensionRoof?.shape ?? 'dual', tile: v, lantern: st.extensionRoof?.lantern ?? false } }))} />
                <Checkbox label="Add roof lantern"
                  checked={!!state.extensionRoof?.lantern}
                  onChange={c => setState(st => ({ ...st, extensionRoof: { shape: st.extensionRoof?.shape ?? 'dual', tile: st.extensionRoof?.tile ?? 'slate-grey', lantern: c } }))} />
              </>
            )}

            {s.kind === 'houseBackdrop' && (
              <Select label="Backdrop" value={state.houseBackdrop ?? 'none'}
                options={Object.entries(HOUSE_BACKDROP).map(([k, v]) => ({ value: k, label: v.label }))}
                onChange={v => set('houseBackdrop', v)} />
            )}
          </Section>
        );
      })}
    </>
  );
}

/* ---------- small primitives (mirror those in ConfiguratorClient) ---------- */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="border-b border-stone-100 py-4">
      <summary className="font-medium text-sm cursor-pointer mb-3">{title}</summary>
      <div className="space-y-3 pt-1">{children}</div>
    </details>
  );
}
function Chips({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`text-xs px-3 py-3 rounded-lg border ${value === v ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-200 hover:bg-stone-50'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}
function Swatches({ value, options, onChange }: { value: string; options: { value: string; hex: string; title?: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-3 flex-wrap">
      {options.map(o => (
        <button key={o.value} type="button" title={o.title} onClick={() => onChange(o.value)}
          style={{ background: o.hex }}
          className={`w-10 h-10 rounded-full border-2 ${value === o.value ? 'border-stone-900 ring-2 ring-white' : 'border-transparent'}`} />
      ))}
    </div>
  );
}
function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-2">
        <span className="text-stone-600">{label}</span>
        <span className="tabular-nums font-medium">{value.toFixed(2)} {unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} className="w-full" />
    </div>
  );
}
function Select({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-stone-600 w-24">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="flex-1 px-2 py-1.5 rounded border border-stone-200 bg-white text-xs focus:outline-none focus:border-stone-900">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 text-xs p-3 rounded-lg border border-stone-200 cursor-pointer hover:bg-stone-50">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="w-4 h-4 accent-stone-900" />
      <span>{label}</span>
    </label>
  );
}
function cap(s: string) { return s[0].toUpperCase() + s.slice(1); }
