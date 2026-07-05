'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  FRAME_COLORS, ROOF, WALL, ADDONS, CLADDING, FLOORING, INTERIOR_WALLS,
  AUTOMATION, ELECTRICAL, SERVICE,
} from '@/lib/catalog';
import { quote, formatMoney, type ConfigState } from '@/lib/pricing';
import type { PriceMatrix, PricingMode } from '@/lib/price-matrix';
import type { SceneHandle, SceneView } from './Scene';
import { PanelRenderer } from './panel/PanelRenderer';
import { usesNewPanel, productDefaults } from './panel/sections';

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
  /** Seller's size-band price grid for this product (null = formula pricing only). */
  priceMatrix?: PriceMatrix | null;
  /** Seller's detail level: 'detailed' itemises extras on top of the structural
   *  price; 'simple' shows the band price as the whole guide price. */
  pricingMode?: PricingMode;
  /** True when rendered from the public marketing demo. Hides the lead-capture
   *  quote modal (which requires a tenant) and shows a demo banner. */
  demo?: boolean;
};

const DEFAULT_STATE: ConfigState = {
  product: 'pergola',
  structure: 'freestanding',
  frameColor: 'anthracite',
  slatColor: 'anthracite',
  length: 5.0,
  depth: 3.5,
  height: 2.6,
  overhang: 0, // buyer-added via the Dimensions slider — never a hidden charge
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
    ...productDefaults(props.productKey),
    product: props.productKey,
    structure: (props.defaultSchema.structure as ConfigState['structure']) ?? DEFAULT_STATE.structure,
    roof: (props.defaultSchema.roof as string) ?? DEFAULT_STATE.roof,
  }));
  const [modalOpen, setModalOpen] = useState(false);
  // Who is designing — captured up-front (tenant sites only) so the seller
  // holds a contact even if the buyer never requests the final quote.
  // undefined = not yet checked (first client render), null = gate required.
  const [visitor, setVisitor] = useState<Visitor | null | undefined>(undefined);
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
  const pricingMode = props.pricingMode ?? 'detailed';

  const { lines, subtotalMinor } = useMemo(
    () => quote(state, pricingMap, props.priceMatrix, pricingMode),
    [state, pricingMap, props.priceMatrix, pricingMode]
  );

  // Options whose pricing row the seller switched off in /admin/pricing are
  // hidden from the panel entirely — the enabled toggle removes them from
  // quotes AND from what the buyer can pick. `pricing` only contains enabled
  // rows on tenant sites; the demo route passes the full default set, so
  // everything shows there. A roof also counts as offered when the seller's
  // size-band grid has a column for it.
  const avail = useMemo(() => {
    const has = (k: string) => pricingMap.has(k);
    const withNone = (keys: string[], prefix: string) => keys.filter(k => k === 'none' || has(`${prefix}.${k}`));
    return {
      roof: Object.keys(ROOF).filter(k => has(`roof.${k}.base`) || has(`roof.${k}.perM2`) || !!props.priceMatrix?.columns[k]),
      wallFB: Object.keys(WALL).filter(k => k === 'none' || has(`wall.${k}.frontback`)),
      wallLR: Object.keys(WALL).filter(k => k === 'none' || has(`wall.${k}.leftright`)),
      addons: Object.keys(ADDONS).filter(k => has(`addon.${k}`)),
      cladding: withNone(Object.keys(CLADDING), 'cladding'),
      flooring: withNone(Object.keys(FLOORING), 'flooring'),
      interior: withNone(Object.keys(INTERIOR_WALLS), 'interior'),
      automation: withNone(Object.keys(AUTOMATION), 'automation'),
      electrical: withNone(Object.keys(ELECTRICAL), 'electrical'),
      service: Object.keys(SERVICE).filter(k => has(`service.${k}`)),
    };
  }, [pricingMap, props.priceMatrix]);

  // If the current selection points at a hidden option (e.g. the product's
  // default roof was switched off), snap it to something the seller offers
  // so the 3D, the panel and the price all agree.
  useEffect(() => {
    setState(s => {
      const n = { ...s, walls: { ...s.walls }, addons: { ...s.addons } };
      let changed = false;
      if (avail.roof.length && !avail.roof.includes(n.roof)) { n.roof = avail.roof[0]; changed = true; }
      for (const side of ['front', 'back'] as const) if (!avail.wallFB.includes(n.walls[side])) { n.walls[side] = 'none'; changed = true; }
      for (const side of ['left', 'right'] as const) if (!avail.wallLR.includes(n.walls[side])) { n.walls[side] = 'none'; changed = true; }
      for (const k of Object.keys(n.addons) as (keyof ConfigState['addons'])[]) if (n.addons[k] && !avail.addons.includes(k)) { n.addons[k] = false; changed = true; }
      if (!avail.cladding.includes(n.cladding)) { n.cladding = 'none'; changed = true; }
      if (!avail.flooring.includes(n.flooring)) { n.flooring = 'none'; changed = true; }
      if (!avail.interior.includes(n.interiorWalls)) { n.interiorWalls = 'none'; changed = true; }
      if (!avail.automation.includes(n.automation)) { n.automation = 'none'; changed = true; }
      if (!avail.electrical.includes(n.electrical)) { n.electrical = 'none'; changed = true; }
      if (avail.service.length && !avail.service.includes(n.service)) { n.service = avail.service[0]; changed = true; }
      return changed ? n : s;
    });
  }, [avail]);

  const visitorKey = `canopy-visitor:${props.tenantSlug}`;
  useEffect(() => {
    if (props.demo) return; // demo mode is ungated
    try {
      const raw = localStorage.getItem(visitorKey);
      setVisitor(raw ? (JSON.parse(raw) as Visitor) : null);
    } catch {
      setVisitor(null);
    }
  }, [props.demo, visitorKey]);

  const set = <K extends keyof ConfigState>(k: K, v: ConfigState[K]) => setState(s => ({ ...s, [k]: v }));
  const setWall = (side: keyof ConfigState['walls'], v: string) =>
    setState(s => ({ ...s, walls: { ...s.walls, [side]: v } }));
  const setAddon = (k: keyof ConfigState['addons'], v: boolean) =>
    setState(s => ({ ...s, addons: { ...s.addons, [k]: v } }));

  return (
    // The 3D preview is the product — side rails are fixed-width and the
    // canvas takes every remaining pixel, full-bleed.
    <main className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)_280px]">
      {/* LEFT: options */}
      <aside className="border-r border-stone-200 bg-white p-5 max-h-[calc(100vh-3.5rem)] overflow-y-auto">
        {usesNewPanel(props.productKey) ? (
          <PanelRenderer
            productKey={props.productKey}
            productName={props.productName}
            productTagline={props.productTagline}
            state={state}
            setState={setState}
          />
        ) : (
          <LegacyPanel state={state} set={set} setWall={setWall} setAddon={setAddon} avail={avail} productName={props.productName} productTagline={props.productTagline} />
        )}
      </aside>

      {/* CENTER: 3D preview.
          Uses `h-` not `min-h-` deliberately: the inner Scene container relies
          on `h-full` (height:100%) to size the canvas, and that only resolves
          when its parent has a *definite* height. `min-height` leaves the
          parent's `height` property at `auto`, so percent-height children
          collapse to 0 — which is exactly why /configure/* on the tenant
          subdomain was a black screen while /demo/configure/* on the platform
          host worked: the demo route had no header wrapper, and a few quirks
          of the surrounding flex layout happened to give the section a
          definite height. On the tenant route, the (public) layout wraps
          children in a header + main, breaking the chain.  */}
      <section className="relative overflow-hidden h-[60vh] lg:h-[calc(100vh-3.5rem)]" style={{ background: '#0e1116' }}>
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
            {(state.roof === 'louvred-retract' || state.roof === 'fabric-retract') && (
              <button onClick={() => setRoofOpen(o => !o)}
                className="px-2 py-1 rounded border border-stone-200 hover:bg-stone-100">
                {state.roof === 'fabric-retract'
                  ? (roofOpen ? 'Extend awning' : 'Retract awning')
                  : (roofOpen ? 'Close roof' : 'Open roof')}
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
            {state.length.toFixed(1)} × {state.depth.toFixed(2)} m · {ROOF[state.roof as keyof typeof ROOF]?.short ?? state.roof}
          </div>
        </div>
      </section>

      {/* RIGHT: compact summary — the price + CTA lead; breakdown folds away */}
      <aside className="border-l border-stone-200 bg-white p-5 max-h-[calc(100vh-3.5rem)] overflow-y-auto flex flex-col">
        <div className="text-[10px] uppercase tracking-[0.18em] text-stone-500 mb-2">Estimated guide price</div>
        <div className="text-4xl tabular-nums tracking-tight" style={{ fontFamily: 'serif' }}>{formatMoney(subtotalMinor, props.currency)}</div>
        <p className="text-[10px] text-stone-400 mt-1">ex. VAT, ex. delivery</p>
        <p className="text-[11px] text-stone-500 mt-2">
          This is a guide, not a final quote — {props.tenantName} will confirm your exact price after a free survey.
        </p>
        {pricingMode === 'simple' && (
          <p className="text-[11px] text-stone-500 mt-2">
            Walls, add-ons and finishes are shown for your design — {props.tenantName} prices them at the survey.
          </p>
        )}

        <details className="mt-4 text-xs flex-1">
          <summary className="cursor-pointer select-none text-stone-600 hover:text-stone-900">
            Price breakdown{lines.length ? ` · ${lines.length} items` : ''}
          </summary>
          <div className="mt-3 space-y-2">
            {lines.length === 0 ? (
              <p className="text-stone-500">No priced line items yet. Your admin can configure prices under Pricing.</p>
            ) : lines.map((l, i) => (
              <div key={i} className="flex items-start justify-between gap-3">
                <span className="text-stone-600">{l.label}</span>
                <span className="font-medium text-stone-900 tabular-nums">{formatMoney(l.amountMinor, props.currency)}</span>
              </div>
            ))}
          </div>
        </details>

        {props.demo ? (
          <a
            href="/sign-up"
            className="mt-4 w-full px-4 py-3 rounded-lg text-white text-sm font-medium hover:opacity-90 text-center block"
            style={{ background: 'var(--brand, #1c1917)' }}
          >
            Sell this in your own configurator →
          </a>
        ) : (
          <button
            onClick={() => setModalOpen(true)}
            className="mt-4 w-full px-4 py-3 rounded-lg text-white text-sm font-medium hover:opacity-90"
            style={{ background: 'var(--brand, #1c1917)' }}
          >
            Request detailed quote →
          </button>
        )}
      </aside>

      {modalOpen && !props.demo && (
        <QuoteModal
          state={state}
          subtotalMinor={subtotalMinor}
          currency={props.currency}
          productKey={props.productKey}
          visitor={visitor ?? undefined}
          pricingMode={pricingMode}
          onClose={() => setModalOpen(false)}
        />
      )}

      {/* Lead gate: tenant sites collect who's designing before the tools unlock. */}
      {visitor === null && !props.demo && (
        <LeadGate
          tenantName={props.tenantName}
          onDone={v => {
            try { localStorage.setItem(visitorKey, JSON.stringify(v)); } catch { /* private mode */ }
            setVisitor(v);
            // Push the contact to the seller's CRM (GoHighLevel) in the
            // background — the buyer never waits on it, and failures are the
            // seller's integration problem, not the buyer's.
            fetch('/api/visitors', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                name: v.first,
                email: v.email,
                phone: v.phone,
                product_key: props.productKey,
                source_url: window.location.href,
              }),
            }).catch(() => { /* fire-and-forget */ });
          }}
        />
      )}

      {props.demo && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
          <div className="bg-stone-900 text-white text-[11px] px-4 py-2 rounded-full shadow-lg flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Demo mode · pricing & products are illustrative
            <a href="/" className="ml-2 underline underline-offset-2 hover:no-underline">← Marketing</a>
          </div>
        </div>
      )}
    </main>
  );
}

type Visitor = { first: string; email: string; phone: string };

/* Pre-configuration lead capture — the seller holds a contact even if the
   buyer designs but never requests the detailed quote. Stored per tenant in
   localStorage so returning visitors go straight to the tools. */
function LeadGate({ tenantName, onDone }: { tenantName: string; onDone: (v: Visitor) => void }) {
  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 grid place-items-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
        <div className="text-[10px] uppercase tracking-[0.18em] text-stone-500 mb-1.5">{tenantName}</div>
        <h3 className="text-2xl" style={{ fontFamily: 'serif' }}>Design your own — with live guide prices.</h3>
        <p className="text-xs text-stone-500 mt-2">
          Tell us where to send your design and we&apos;ll open the configurator.
        </p>
        <form
          className="space-y-3 mt-4"
          onSubmit={e => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            onDone({
              first: String(fd.get('first')).trim(),
              email: String(fd.get('email')).trim(),
              phone: String(fd.get('phone')).trim(),
            });
          }}
        >
          <Input name="first" label="Name" required />
          <Input name="email" label="Email" type="email" required />
          <Input name="phone" label="Phone" type="tel" required />
          <button className="w-full px-4 py-3 rounded-lg text-white font-medium text-sm hover:opacity-90" style={{ background: 'var(--brand, #1c1917)' }}>
            Start designing →
          </button>
          <p className="text-[10px] text-stone-400 text-center">
            No obligation — prices shown are guide estimates confirmed by {tenantName} after a free survey.
          </p>
        </form>
      </div>
    </div>
  );
}

/* Which options the seller offers — anything whose pricing row is switched
   off in /admin/pricing is absent from these lists and hidden below. */
type Availability = {
  roof: string[]; wallFB: string[]; wallLR: string[]; addons: string[];
  cladding: string[]; flooring: string[]; interior: string[];
  automation: string[]; electrical: string[]; service: string[];
};

/* LegacyPanel preserves the original 10-product configurator UI, filtered to
   the options the seller actually offers. */
function LegacyPanel({ state, set, setWall, setAddon, avail, productName, productTagline }: {
  state: ConfigState;
  set: <K extends keyof ConfigState>(k: K, v: ConfigState[K]) => void;
  setWall: (side: keyof ConfigState['walls'], v: string) => void;
  setAddon: (k: keyof ConfigState['addons'], v: boolean) => void;
  avail: Availability;
  productName: string;
  productTagline: string;
}) {
  const wallOpts = (list: string[]) => list.map(k => ({ value: k, label: WALL[k as keyof typeof WALL].label }));
  const showMaterials = avail.cladding.length > 1 || avail.flooring.length > 1 || avail.interior.length > 1;
  const showSmart = avail.automation.length > 1 || avail.electrical.length > 1;
  return (
    <>
      <div className="text-[10px] uppercase tracking-[0.18em] text-stone-500 mb-1.5">Configure</div>
      <h2 className="text-3xl tracking-tight" style={{ fontFamily: 'serif' }}>{productName}</h2>
      <p className="text-xs text-stone-500 mt-2">{productTagline}</p>

      <Section title="Structure">
        <Chips value={state.structure} options={[['freestanding', 'Free-standing'], ['wallmounted', 'Wall-mounted']]} onChange={v => set('structure', v as ConfigState['structure'])} />
      </Section>

      <Section title="Frame finish">
        {/* Slats follow the frame colour — there's no separate slat control,
            so letting them drift apart silently added the two-tone charge. */}
        <Swatches value={state.frameColor} options={Object.entries(FRAME_COLORS).map(([k, v]) => ({ value: k, hex: v.hex, title: v.label }))} onChange={v => { set('frameColor', v); set('slatColor', v); }} />
        <p className="text-[11px] text-stone-500 mt-2">{FRAME_COLORS[state.frameColor as keyof typeof FRAME_COLORS]?.label}</p>
      </Section>

      <Section title="Dimensions">
        <Slider label="Width"      value={state.length}  min={1} max={10} step={0.1}  unit="m" onChange={v => set('length', v)} />
        <Slider label="Projection" value={state.depth}   min={0.05} max={5} step={0.05} unit="m" onChange={v => set('depth', v)} />
        <Slider label="Height"     value={state.height}  min={2.0} max={3.5} step={0.05} unit="m" onChange={v => set('height', v)} />
        <Slider label="Roof overhang" value={state.overhang} min={0} max={0.6} step={0.05} unit="m" onChange={v => set('overhang', v)} />
        <div className="mt-2 text-[10px] uppercase tracking-wider text-stone-500 flex justify-between">
          <span>Footprint</span>
          <span className="tabular-nums">{(state.length * state.depth).toFixed(1)} m²</span>
        </div>
      </Section>

      {avail.roof.length > 0 && (
        <Section title="Roof system">
          <RadioList value={state.roof} options={avail.roof.map(k => ({ value: k, label: ROOF[k as keyof typeof ROOF].label }))} onChange={v => set('roof', v)} />
        </Section>
      )}

      {(avail.wallFB.length > 1 || avail.wallLR.length > 1) && (
        <Section title="Walls & enclosures">
          {(['front', 'back'] as const).map(side => avail.wallFB.length > 1 && (
            <Select key={side} label={cap(side)} value={state.walls[side]} options={wallOpts(avail.wallFB)} onChange={v => setWall(side, v)} />
          ))}
          {(['left', 'right'] as const).map(side => avail.wallLR.length > 1 && (
            <Select key={side} label={cap(side)} value={state.walls[side]} options={wallOpts(avail.wallLR)} onChange={v => setWall(side, v)} />
          ))}
        </Section>
      )}

      {avail.addons.length > 0 && (
        <Section title="Add-ons">
          {avail.addons.map(k => (
            <Checkbox key={k} label={ADDONS[k as keyof typeof ADDONS].label} checked={!!state.addons[k as keyof typeof ADDONS]} onChange={c => setAddon(k as keyof typeof ADDONS, c)} />
          ))}
        </Section>
      )}

      {showMaterials && (
        <Section title="Materials">
          {avail.cladding.length > 1 && <Select label="Cladding"       value={state.cladding}      options={avail.cladding.map(k => ({ value: k, label: CLADDING[k as keyof typeof CLADDING].label }))} onChange={v => set('cladding', v)} />}
          {avail.flooring.length > 1 && <Select label="Flooring"       value={state.flooring}      options={avail.flooring.map(k => ({ value: k, label: FLOORING[k as keyof typeof FLOORING].label }))} onChange={v => set('flooring', v)} />}
          {avail.interior.length > 1 && <Select label="Interior walls" value={state.interiorWalls} options={avail.interior.map(k => ({ value: k, label: INTERIOR_WALLS[k as keyof typeof INTERIOR_WALLS].label }))} onChange={v => set('interiorWalls', v)} />}
        </Section>
      )}

      {showSmart && (
        <Section title="Smart features">
          {avail.automation.length > 1 && <Select label="Automation" value={state.automation} options={avail.automation.map(k => ({ value: k, label: AUTOMATION[k as keyof typeof AUTOMATION].label }))} onChange={v => set('automation', v)} />}
          {avail.electrical.length > 1 && <Select label="Electrical" value={state.electrical} options={avail.electrical.map(k => ({ value: k, label: ELECTRICAL[k as keyof typeof ELECTRICAL].label }))} onChange={v => set('electrical', v)} />}
        </Section>
      )}

      {avail.service.length > 0 && (
        <Section title="Service & delivery">
          <Select label="Service tier" value={state.service} options={avail.service.map(k => ({ value: k, label: SERVICE[k as keyof typeof SERVICE].label }))} onChange={v => set('service', v)} />
        </Section>
      )}
    </>
  );
}

function QuoteModal({ state, subtotalMinor, currency, productKey, visitor, pricingMode, onClose }: { state: ConfigState; subtotalMinor: number; currency: string; productKey: string; visitor?: Visitor; pricingMode: PricingMode; onClose: () => void }) {
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
                <Input name="first" label="First name" required defaultValue={visitor?.first} />
                <Input name="last"  label="Last name" required />
              </div>
              <Input name="email"    label="Email" type="email" required defaultValue={visitor?.email} />
              <Input name="phone"    label="Phone (optional)" defaultValue={visitor?.phone} />
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
                {pricingMode === 'simple' && (
                  <div className="mt-1 text-[10px] text-stone-500">Extras in your design are priced at the survey.</div>
                )}
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
function Input({ name, label, type = 'text', required, defaultValue }: { name: string; label: string; type?: string; required?: boolean; defaultValue?: string }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-stone-600">{label}</span>
      <input name={name} type={type} required={required} defaultValue={defaultValue} className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-900" />
    </label>
  );
}
function cap(s: string) { return s[0].toUpperCase() + s.slice(1); }
