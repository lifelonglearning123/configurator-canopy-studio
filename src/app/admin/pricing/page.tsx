import { requireSessionTenant } from '@/lib/session';
import { adminClient } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import { formatMoney } from '@/lib/pricing';
import { pricingRowAppliesTo, ROOF } from '@/lib/catalog';
import { defaultVerandaMatrix, matrixProductKeys, priceMatrixSchema, type PriceMatrix } from '@/lib/price-matrix';
import { MARKETING_PRODUCTS } from '@/lib/marketing-products';
import Link from 'next/link';

type Rule = { id: string; line_item_key: string; label: string; amount_minor: number; enabled: boolean; product_key: string | null };

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const { tenant } = await requireSessionTenant();
  const { product } = await searchParams;
  const db = adminClient();

  const { data } = await db
    .from('pricing_rules')
    .select('id, line_item_key, label, amount_minor, enabled, product_key')
    .eq('tenant_id', tenant.id)
    .order('line_item_key');
  const rules = (data as Rule[] | null) ?? [];

  // Per-product view: only the rows this product's quotes can use.
  const productKeys = MARKETING_PRODUCTS.map(p => p.key);
  const selected = product && productKeys.includes(product) ? product : null;
  const visible = selected ? rules.filter(r => pricingRowAppliesTo(r.line_item_key, selected)) : rules;

  // A row shown under one product may be shared by others — same single price.
  const sharedCount = (key: string) => productKeys.filter(p => pricingRowAppliesTo(key, p)).length;

  // Size-band grid for matrix-priced products (rollout: veranda first).
  // The seller edits example prices per width×projection band; blank cells
  // fall back to the formula rows below.
  const matrixProduct = selected && matrixProductKeys().includes(selected) ? selected : null;
  let matrix: PriceMatrix | null = null;
  let matrixEnabled = false;
  if (matrixProduct) {
    const { data: mrow } = await db
      .from('price_matrices')
      .select('grid, enabled')
      .eq('tenant_id', tenant.id)
      .eq('product_key', matrixProduct)
      .maybeSingle();
    if (mrow) {
      const parsed = priceMatrixSchema.safeParse((mrow as { grid: unknown }).grid);
      if (parsed.success) {
        matrix = parsed.data;
        matrixEnabled = (mrow as { enabled: boolean }).enabled;
      }
    }
    if (!matrix) matrix = defaultVerandaMatrix(); // template prefilled from formula rates
  }

  // Group by namespace prefix (e.g. "roof", "wall", "addon")
  const grouped = new Map<string, Rule[]>();
  for (const r of visible) {
    const ns = r.line_item_key.split('.')[0];
    if (!grouped.has(ns)) grouped.set(ns, []);
    grouped.get(ns)!.push(r);
  }

  async function update(formData: FormData) {
    'use server';
    const { tenant } = await requireSessionTenant();
    const id = String(formData.get('id'));
    const amountMinor = Math.round(Number(formData.get('amount')) * 100);
    const enabled = formData.get('enabled') === 'on';
    const db = adminClient();
    await db.from('pricing_rules').update({ amount_minor: amountMinor, enabled }).eq('id', id).eq('tenant_id', tenant.id);
    revalidatePath('/admin/pricing');
  }

  async function saveMatrix(formData: FormData) {
    'use server';
    const { tenant } = await requireSessionTenant();
    const productKey = String(formData.get('productKey'));
    const enabled = formData.get('enabled') === 'on';
    const widths = String(formData.get('widths')).split(',').map(Number);
    const depths = String(formData.get('depths')).split(',').map(Number);
    const roofs = String(formData.get('roofs')).split(',');
    const columns: Record<string, (number | null)[][]> = {};
    for (const rk of roofs) {
      columns[rk] = depths.map((_, di) => widths.map((_, wi) => {
        const v = String(formData.get(`cell:${rk}:${di}:${wi}`) ?? '').trim();
        if (!v) return null; // blank = this band falls back to formula pricing
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
      }));
    }
    const parsed = priceMatrixSchema.safeParse({ widths, depths, columns });
    if (!parsed.success) return;
    const db = adminClient();
    await db.from('price_matrices').upsert(
      { tenant_id: tenant.id, product_key: productKey, grid: parsed.data, enabled, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id,product_key' }
    );
    revalidatePath('/admin/pricing');
  }

  async function bulkMarkup(formData: FormData) {
    'use server';
    const { tenant } = await requireSessionTenant();
    const pct = Number(formData.get('pct')) / 100;
    const scope = String(formData.get('scope') ?? '');
    if (!Number.isFinite(pct) || pct === 0) return;
    const db = adminClient();
    const { data: rs } = await db.from('pricing_rules').select('id, line_item_key, amount_minor').eq('tenant_id', tenant.id);
    if (!rs) return;
    // Scope the markup to the selected product's rows — an unscoped markup
    // silently repriced every product, which is exactly the old confusion.
    const targets = (rs as { id: string; line_item_key: string; amount_minor: number }[])
      .filter(r => !scope || pricingRowAppliesTo(r.line_item_key, scope));
    for (const r of targets) {
      await db.from('pricing_rules').update({ amount_minor: Math.round(r.amount_minor * (1 + pct)) }).eq('id', r.id);
    }
    revalidatePath('/admin/pricing');
  }

  // const alias so TS narrowing survives into the JSX map callbacks below
  const m = matrix;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
          <p className="text-sm text-stone-600">
            {selected
              ? <>Line items used by <strong>{MARKETING_PRODUCTS.find(p => p.key === selected)?.name}</strong> quotes. Currency: {tenant.currency}.</>
              : <>Every line item that can appear in a quote. Pick a product to see only its rows. Currency: {tenant.currency}.</>}
          </p>
        </div>
        <form action={bulkMarkup} className="flex items-center gap-2">
          <input type="hidden" name="scope" value={selected ?? ''} />
          <label className="text-xs text-stone-600">Bulk markup {selected ? '(this product)' : '(all products)'}</label>
          <input name="pct" type="number" step="0.5" defaultValue={0} className="w-20 px-2 py-1.5 rounded border border-stone-300 text-sm" />
          <span className="text-xs text-stone-500">%</span>
          <button className="px-3 py-1.5 rounded-md bg-stone-900 text-white text-xs">Apply</button>
        </form>
      </header>

      {/* Product selector */}
      <nav className="flex flex-wrap gap-1.5">
        <Link
          href="/admin/pricing"
          className={`px-2.5 py-1 rounded-full text-xs border ${!selected ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-300 text-stone-600 hover:bg-stone-100'}`}
        >
          All products
        </Link>
        {MARKETING_PRODUCTS.map(p => (
          <Link
            key={p.key}
            href={`/admin/pricing?product=${p.key}`}
            className={`px-2.5 py-1 rounded-full text-xs border ${selected === p.key ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-300 text-stone-600 hover:bg-stone-100'}`}
          >
            {p.name}
          </Link>
        ))}
      </nav>

      {selected && (
        <p className="text-xs text-stone-500">
          Rows marked <span className="inline-block px-1.5 rounded bg-stone-100 border border-stone-200">shared</span> are
          used by other products too — changing them here changes every quote that uses them.
        </p>
      )}

      {matrixProduct && m && (
        <section className="bg-white border border-stone-200 rounded-xl p-5">
          <div className="flex items-baseline justify-between mb-1">
            <h2 className="text-sm font-medium">Size-band guide prices</h2>
            <span className="text-[11px] text-stone-500">£ per structure · width × projection</span>
          </div>
          <p className="text-xs text-stone-500 mb-4">
            Enter the price you would quote for each size — buyers between sizes are charged at the
            next band up. Leave a cell blank to price that size with the per-m² rows below instead.
          </p>
          <form action={saveMatrix} className="space-y-5">
            <input type="hidden" name="productKey" value={matrixProduct} />
            <input type="hidden" name="widths" value={m.widths.join(',')} />
            <input type="hidden" name="depths" value={m.depths.join(',')} />
            <input type="hidden" name="roofs" value={Object.keys(m.columns).join(',')} />
            {Object.entries(m.columns).map(([rk, rows]) => (
              <div key={rk}>
                <h3 className="text-xs uppercase tracking-wider text-stone-500 mb-2">{ROOF[rk as keyof typeof ROOF]?.label ?? rk}</h3>
                <table className="text-sm">
                  <thead>
                    <tr>
                      <th className="text-left pr-3 text-[10px] uppercase tracking-wider text-stone-400 font-normal">proj ↓ · width →</th>
                      {m.widths.map(w => <th key={w} className="px-1 pb-1 text-xs text-stone-500 font-normal">{w} m</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, di) => (
                      <tr key={di}>
                        <td className="pr-3 text-xs text-stone-500">{m.depths[di]} m</td>
                        {r.map((cell, wi) => (
                          <td key={wi} className="p-0.5">
                            <input
                              name={`cell:${rk}:${di}:${wi}`}
                              type="number" step="1" min="0"
                              defaultValue={cell == null ? '' : Math.round(cell / 100)}
                              className="w-20 px-2 py-1 rounded border border-stone-300 text-xs tabular-nums"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-stone-600">
                <input type="checkbox" name="enabled" defaultChecked={matrixEnabled} className="w-3.5 h-3.5 accent-stone-900" />
                Use this grid for quotes
              </label>
              <button className="px-3 py-1.5 rounded-md bg-stone-900 text-white text-xs">Save grid</button>
            </div>
          </form>
        </section>
      )}

      <div className="space-y-6">
        {[...grouped.entries()].map(([ns, rs]) => (
          <section key={ns}>
            <h2 className="text-xs uppercase tracking-wider text-stone-500 mb-2">{ns}</h2>
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-xs uppercase tracking-wider text-stone-500">
                  <tr><th className="text-left p-3">Key</th><th className="text-left p-3">Label</th><th className="text-right p-3">Amount</th><th className="text-center p-3 w-24">Enabled</th><th className="w-20"></th></tr>
                </thead>
                <tbody>
                  {rs.map(r => (
                    <tr key={r.id} className="border-t border-stone-100">
                      <td className="p-3 text-xs font-mono text-stone-500">
                        {r.line_item_key}
                        {selected && sharedCount(r.line_item_key) > 1 && (
                          <span className="ml-2 inline-block px-1.5 rounded bg-stone-100 border border-stone-200 font-sans text-[10px] text-stone-500">shared</span>
                        )}
                      </td>
                      <td className="p-3">{r.label}</td>
                      <td className="p-3 text-right tabular-nums text-xs text-stone-500">{formatMoney(r.amount_minor, tenant.currency)}</td>
                      <td className="p-3"><span className={`text-xs ${r.enabled ? 'text-emerald-700' : 'text-stone-400'}`}>{r.enabled ? 'on' : 'off'}</span></td>
                      <td className="p-3 text-right">
                        <form action={update} className="flex items-center gap-2 justify-end">
                          <input type="hidden" name="id" value={r.id} />
                          <input name="amount" type="number" step="1" defaultValue={(r.amount_minor / 100).toFixed(0)} className="w-20 px-2 py-1 rounded border border-stone-300 text-xs" />
                          <input type="checkbox" name="enabled" defaultChecked={r.enabled} className="w-3.5 h-3.5 accent-stone-900" />
                          <button className="px-2 py-1 rounded border border-stone-300 text-xs hover:bg-stone-100">Save</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
