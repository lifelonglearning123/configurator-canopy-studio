import { requireSessionTenant } from '@/lib/session';
import { adminClient } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import { formatMoney } from '@/lib/pricing';

export default async function PricingPage() {
  const { tenant } = await requireSessionTenant();
  const db = adminClient();

  const { data: rules } = await db
    .from('pricing_rules')
    .select('id, line_item_key, label, amount_minor, enabled, product_key')
    .eq('tenant_id', tenant.id)
    .order('line_item_key');

  // Group by namespace prefix (e.g. "roof", "wall", "addon")
  const grouped = new Map<string, typeof rules>();
  for (const r of (rules as { id: string; line_item_key: string; label: string; amount_minor: number; enabled: boolean; product_key: string | null }[] ?? [])) {
    const ns = r.line_item_key.split('.')[0];
    if (!grouped.has(ns)) grouped.set(ns, []);
    grouped.get(ns)!.push(r as never);
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
    if (!Number.isFinite(pct) || pct === 0) return;
    const db = adminClient();
    const { data: rs } = await db.from('pricing_rules').select('id, amount_minor').eq('tenant_id', tenant.id);
    if (!rs) return;
    for (const r of rs as { id: string; amount_minor: number }[]) {
      await db.from('pricing_rules').update({ amount_minor: Math.round(r.amount_minor * (1 + pct)) }).eq('id', r.id);
    }
    revalidatePath('/admin/pricing');
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
          <p className="text-sm text-stone-600">Every line item that can appear in a quote. Currency: {tenant.currency}.</p>
        </div>
        <form action={bulkMarkup} className="flex items-center gap-2">
          <label className="text-xs text-stone-600">Bulk markup</label>
          <input name="pct" type="number" step="0.5" defaultValue={0} className="w-20 px-2 py-1.5 rounded border border-stone-300 text-sm" />
          <span className="text-xs text-stone-500">%</span>
          <button className="px-3 py-1.5 rounded-md bg-stone-900 text-white text-xs">Apply</button>
        </form>
      </header>

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
                  {(rs as { id: string; line_item_key: string; label: string; amount_minor: number; enabled: boolean }[]).map(r => (
                    <tr key={r.id} className="border-t border-stone-100">
                      <td className="p-3 text-xs font-mono text-stone-500">{r.line_item_key}</td>
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
