'use client';

import { useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  FRAME_COLORS, ROOF, WALL, ADDONS, CLADDING, FLOORING, INTERIOR_WALLS,
  AUTOMATION, ELECTRICAL, SERVICE,
} from '@/lib/catalog';
import { quote, formatMoney, type ConfigState } from '@/lib/pricing';
import type { SceneHandle, SceneView } from './Scene';

// Three.js scene is browser-only — bypass SSR
const Scene = dynamic(() => import('./Scene').then(m => m.Scene), { ssr: false });

type Props = {
  tenantName: string;
  tenantSlug: string;
  currency: string;
  productKey: string;
  productName: string;
  productTagline: string;
  defaultSchema: Record<string, unknown>;
  pricing: { key: string; label: string; amountMinor: number }[];
};

const DEFAULT_STATE: ConfigState = {
  product: 'pergola',
  structure: 'freestanding',
  frameColor: 'anthracite',
  slatColor: 'anthracite',
  length: 5.0,
  depth: 3.5,
  height: 2.6,
  overhang: 0.2,
  angle: 0,
  roof: 'louvred-retract',
  slatDirection: 'width',
  slatRotation: 'left',
  slatIsolation: false,
  walls: { front: 'none', back: 'none', left: 'none', right: 'none' },
  addons: { lighting: false, bar: false, heater: false, speakers: false },
  cladding: 'none',
  flooring: 'none',
  interiorWalls: 'none',
  automation: 'none',
  electrical: 'none',
  service: 'install',
  elementsPosition: 'perimeter',
};

export function ConfiguratorClient(props: Props) {
  const [state, setState] = useState<ConfigState>(() => ({
    ...DEFAULT_STATE,
    product: props.productKey,
    structure: (props.defaultSchema.structure as ConfigState['structure']) ?? DEFAULT_STATE.structure,
    roof: (props.defaultSchema.roof as string) ?? DEFAULT_STATE.roof,
  }));
  const [modalOpen, setModalOpen] = useState(false);
  const [view, setView] = useState<SceneView>('iso');
  const [time, setTime] = useState(13);
  const [spin, setSpin] = useState(false);
  const [roofOpen, setRoofOpen] = useState(false);
  const [fps, setFps] = useState(60);
  const sceneRef = useRef<SceneHandle>(null);

  const productScene = (props.defaultSchema.scene as string | undefined) ?? null;

  const pricingMap = useMemo(
    () => new Map(props.pricing.map(p => [p.key, { label: p.label, amountMinor: p.amountMinor }])),
    [props.pricing]
  );

  const { lines, subtotalMinor } = useMemo(() => quote(state, pricingMap), [state, pricingMap]);

  const set = <K extends keyof ConfigState>(k: K, v: ConfigState[K]) => setState(s => ({ ...s, [k]: v }));
  const setWall = (side: keyof ConfigState['walls'], v: string) =>
    setState(s => ({ ...s, walls: { ...s.walls, [side]: v } }));
  const setAddon = (k: keyof ConfigState['addons'], v: boolean) =>
    setState(s => ({ ...s, addons: { ...s.addons, [k]: v } }));

  return (
    <main className="grid grid-cols-12 max-w-[1700px] mx-auto">
      {/* LEFT: options */}
      <aside className="col-span-12 lg:col-span-4 border-r border-stone-200 bg-white p-6 max-h-[calc(100vh-3.5rem)] overflow-y-auto">
        <div className="text-[10px] uppercase tracking-[0.18em] text-stone-500 mb-1.5">Configure</div>
        <h2 className="text-3xl tracking-tight" style={{ fontFamily: 'serif' }}>{props.productName}</h2>
        <p className="text-xs text-stone-500 mt-2">{props.productTagline}</p>

        <Section title="Structure">
          <Chips value={state.structure} options={[['freestanding', 'Free-standing'], ['wallmounted', 'Wall-mounted']]} onChange={v => set('structure', v as ConfigState['structure'])} />
        </Section>

        <Section title="Frame finish">
          <Swatches value={state.frameColor} options={Object.entries(FRAME_COLORS).map(([k, v]) => ({ value: k, hex: v.hex, title: v.label }))} onChange={v => set('frameColor', v)} />
          <p className="text-[11px] text-stone-500 mt-2">{FRAME_COLORS[state.frameColor as keyof typeof FRAME_COLORS]?.label}</p>
        </Section>

        <Section title="Dimensions">
          <Slider label="Width"      value={state.length}  min={1} max={10} step={0.1}  unit="m" onChange={v => set('length', v)} />
          <Slider label="Projection" value={state.depth}   min={0.05} max={5} step={0.05} unit="m" onChange={v => set('depth', v)} />
          <Slider label="Height"     value={state.height}  min={2.0} max={3.5} step={0.05} unit="m" onChange={v => set('height', v)} />
          <div className="mt-2 text-[10px] uppercase tracking-wider text-stone-500 flex justify-between">
            <span>Footprint</span>
            <span className="tabular-nums">{(state.length * state.depth).toFixed(1)} m²</span>
          </div>
        </Section>

        <Section title="Roof system">
          <RadioList value={state.roof} options={Object.entries(ROOF).map(([k, v]) => ({ value: k, label: v.label }))} onChange={v => set('roof', v)} />
        </Section>

        <Section title="Walls & enclosures">
          {(['front', 'back', 'left', 'right'] as const).map(side => (
            <Select key={side} label={cap(side)} value={state.walls[side]} options={Object.entries(WALL).map(([k, v]) => ({ value: k, label: v.label }))} onChange={v => setWall(side, v)} />
          ))}
        </Section>

        <Section title="Add-ons">
          {(Object.entries(ADDONS) as [keyof typeof ADDONS, typeof ADDONS[keyof typeof ADDONS]][]).map(([k, v]) => (
            <Checkbox key={k} label={v.label} checked={!!state.addons[k]} onChange={c => setAddon(k, c)} />
          ))}
        </Section>

        <Section title="Materials">
          <Select label="Cladding"        value={state.cladding}       options={Object.entries(CLADDING).map(([k, v]) => ({ value: k, label: v.label }))} onChange={v => set('cladding', v)} />
          <Select label="Flooring"        value={state.flooring}       options={Object.entries(FLOORING).map(([k, v]) => ({ value: k, label: v.label }))} onChange={v => set('flooring', v)} />
          <Select label="Interior walls"  value={state.interiorWalls}  options={Object.entries(INTERIOR_WALLS).map(([k, v]) => ({ value: k, label: v.label }))} onChange={v => set('interiorWalls', v)} />
        </Section>

        <Section title="Smart features">
          <Select label="Automation"  value={state.automation} options={Object.entries(AUTOMATION).map(([k, v]) => ({ value: k, label: v.label }))} onChange={v => set('automation', v)} />
          <Select label="Electrical"  value={state.electrical} options={Object.entries(ELECTRICAL).map(([k, v]) => ({ value: k, label: v.label }))} onChange={v => set('electrical', v)} />
        </Section>

        <Section title="Service & delivery">
          <Select label="Service tier" value={state.service} options={Object.entries(SERVICE).map(([k, v]) => ({ value: k, label: v.label }))} onChange={v => set('service', v)} />
        </Section>
      </aside>

      {/* CENTER: 3D preview */}
      <section className="col-span-12 lg:col-span-5 relative overflow-hidden min-h-[60vh] lg:min-h-[calc(100vh-3.5rem)]" style={{ background: '#0e1116' }}>
        <Scene
          ref={sceneRef}
          state={state}
          scene={productScene}
          view={view}
          time={time}
          spin={spin}
          roofOpen={roofOpen}
          onFps={setFps}
        />

        {/* Top-left: view toggle + scene buttons */}
        <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 pointer-events-auto">
          <div className="bg-white/70 backdrop-blur rounded-xl p-1 border border-white/30 shadow-sm inline-flex gap-0.5">
            {(['iso', 'front', 'side', 'top'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`text-[11px] px-3 py-1.5 rounded-lg ${view === v ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-100'}`}>
                {v === 'iso' ? 'Orbit' : cap(v)}
              </button>
            ))}
          </div>
          <div className="bg-white/70 backdrop-blur rounded-xl px-2 py-1.5 border border-white/30 shadow-sm inline-flex items-center gap-1.5 text-[11px]">
            <button onClick={() => { setSpin(s => !s); if (!spin) setView('iso'); }}
              className={`px-2 py-1 rounded ${spin ? 'bg-stone-900 text-white' : 'border border-stone-200 hover:bg-stone-100'}`}>
              {spin ? 'Stop orbit' : 'Auto-orbit'}
            </button>
            {state.roof === 'louvred-retract' && (
              <button onClick={() => setRoofOpen(o => !o)}
                className="px-2 py-1 rounded border border-stone-200 hover:bg-stone-100">
                {roofOpen ? 'Close roof' : 'Open roof'}
              </button>
            )}
            <button onClick={() => {
              const url = sceneRef.current?.snapshot();
              if (!url) return;
              const a = document.createElement('a'); a.href = url; a.download = `canopy-${Date.now()}.png`; a.click();
            }} className="px-2 py-1 rounded border border-stone-200 hover:bg-stone-100">Snapshot</button>
          </div>
        </div>

        {/* Top-right: time-of-day */}
        <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2 pointer-events-auto">
          <div className="bg-white/70 backdrop-blur rounded-xl p-1 border border-white/30 shadow-sm inline-flex gap-0.5">
            {[
              { t: 13,    label: 'Day' },
              { t: 19.2,  label: 'Sunset' },
              { t: 21.8,  label: 'Night' },
            ].map(p => (
              <button key={p.label} onClick={() => setTime(p.t)}
                className={`text-[11px] px-3 py-1.5 rounded-lg ${Math.abs(time - p.t) < 0.3 ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-100'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="bg-white/70 backdrop-blur rounded-xl px-3 py-2 border border-white/30 shadow-sm flex items-center gap-2.5">
            <input type="range" min={5.5} max={22} step={0.1} value={time}
              onChange={e => setTime(parseFloat(e.target.value))} className="w-28" />
            <span className="text-[11px] text-stone-600 w-10 tabular-nums">
              {Math.floor(time)}:{String(Math.round((time % 1) * 60)).padStart(2, '0')}
            </span>
          </div>
          <div className="bg-white/70 backdrop-blur rounded-xl px-3 py-1.5 border border-white/30 shadow-sm text-[11px] text-stone-600 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
            WebGL · {fps} fps
          </div>
        </div>

        {/* Bottom-left: config summary */}
        <div className="absolute bottom-4 left-4 z-10 bg-white/70 backdrop-blur rounded-xl px-4 py-3 border border-white/30 shadow-sm max-w-md pointer-events-auto">
          <div className="text-[10px] uppercase tracking-[0.18em] text-stone-500 mb-1">Your build</div>
          <div className="font-medium text-sm">{props.productName}</div>
          <div className="text-[11px] text-stone-600 mt-1">
            {state.length.toFixed(1)} × {state.depth.toFixed(2)} m · {ROOF[state.roof as keyof typeof ROOF]?.short}
          </div>
        </div>
      </section>

      {/* RIGHT: summary */}
      <aside className="col-span-12 lg:col-span-3 border-l border-stone-200 bg-white p-6 max-h-[calc(100vh-3.5rem)] overflow-y-auto flex flex-col">
        <div className="text-[10px] uppercase tracking-[0.18em] text-stone-500 mb-1.5">Summary</div>
        <h2 className="text-3xl tracking-tight" style={{ fontFamily: 'serif' }}>Your quote.</h2>

        <div className="mt-5 space-y-2 text-xs flex-1">
          {lines.length === 0 ? (
            <p className="text-stone-500">No priced line items yet. Your admin can configure prices under Pricing.</p>
          ) : lines.map((l, i) => (
            <div key={i} className="flex items-start justify-between gap-3">
              <span className="text-stone-600">{l.label}</span>
              <span className="font-medium text-stone-900 tabular-nums">{formatMoney(l.amountMinor, props.currency)}</span>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-5 border-t border-stone-100 bg-stone-50/60 -mx-6 px-6 pb-5">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-stone-500">Total</span>
            <span className="text-[10px] text-stone-400">ex. VAT, ex. delivery</span>
          </div>
          <div className="text-5xl tabular-nums tracking-tight" style={{ fontFamily: 'serif' }}>{formatMoney(subtotalMinor, props.currency)}</div>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="mt-4 w-full px-4 py-3 rounded-lg text-white text-sm font-medium hover:opacity-90"
          style={{ background: 'var(--brand, #1c1917)' }}
        >
          Request detailed quote →
        </button>
      </aside>

      {modalOpen && (
        <QuoteModal
          state={state}
          subtotalMinor={subtotalMinor}
          currency={props.currency}
          productKey={props.productKey}
          onClose={() => setModalOpen(false)}
        />
      )}
    </main>
  );
}

function QuoteModal({ state, subtotalMinor, currency, productKey, onClose }: { state: ConfigState; subtotalMinor: number; currency: string; productKey: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      product_key: productKey,
      configuration: state as unknown as Record<string, unknown>,
      price_quoted_minor: subtotalMinor,
      customer: {
        first_name: String(fd.get('first')),
        last_name: String(fd.get('last')),
        email: String(fd.get('email')),
        phone: String(fd.get('phone') ?? '') || undefined,
        postcode: String(fd.get('postcode')),
        notes: String(fd.get('notes') ?? '') || undefined,
      },
      source_url: typeof window !== 'undefined' ? window.location.href : undefined,
    };
    const r = await fetch('/api/leads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await r.json();
    if (!r.ok) { setErr(body.error ?? 'Failed to submit'); setBusy(false); return; }
    setDone(true); setBusy(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 grid place-items-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
        {done ? (
          <div className="text-center py-6">
            <h3 className="text-2xl" style={{ fontFamily: 'serif' }}>Request received.</h3>
            <p className="text-xs text-stone-500 mt-1">We'll be in touch within 1 working day.</p>
            <button onClick={onClose} className="mt-5 px-4 py-2 rounded-lg border border-stone-300 text-sm">Close</button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-2xl" style={{ fontFamily: 'serif' }}>Request a quote</h3>
                <p className="text-xs text-stone-500 mt-1">We'll send a fully priced spec within 1 working day.</p>
              </div>
              <button onClick={onClose}>×</button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input name="first" label="First name" required />
                <Input name="last"  label="Last name" required />
              </div>
              <Input name="email"    label="Email" type="email" required />
              <Input name="phone"    label="Phone (optional)" />
              <Input name="postcode" label="Postcode" required />
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-stone-600">Notes (optional)</span>
                <textarea name="notes" rows={3} className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-900" />
              </label>
              <div className="bg-stone-50 rounded-lg p-3 text-[11px] text-stone-600">
                <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">Your configuration</div>
                <div>{state.length.toFixed(1)} × {state.depth.toFixed(2)} m · {ROOF[state.roof as keyof typeof ROOF]?.label}</div>
                <div className="mt-2 pt-2 border-t border-stone-200 flex justify-between">
                  <span>Estimated total</span>
                  <span className="font-semibold text-stone-900">{formatMoney(subtotalMinor, currency)}</span>
                </div>
              </div>
              {err && <p className="text-xs text-red-600">{err}</p>}
              <button disabled={busy} className="w-full px-4 py-3 rounded-lg text-white font-medium text-sm" style={{ background: 'var(--brand, #1c1917)' }}>
                {busy ? 'Sending…' : 'Send request'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- small primitives ---------- */
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
    <div className="flex gap-3">
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
function RadioList({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`w-full text-left text-xs px-3 py-2.5 rounded-lg border flex items-center justify-between ${value === o.value ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-200 hover:bg-stone-50'}`}>
          <span>{o.label}</span>
        </button>
      ))}
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
function Input({ name, label, type = 'text', required }: { name: string; label: string; type?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-stone-600">{label}</span>
      <input name={name} type={type} required={required} className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-900" />
    </label>
  );
}
function cap(s: string) { return s[0].toUpperCase() + s.slice(1); }
