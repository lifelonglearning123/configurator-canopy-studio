import { requireSessionTenant } from '@/lib/session';
import { adminClient } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import { formatMoney } from '@/lib/pricing';
import { pricingRowAppliesTo } from '@/lib/catalog';
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
