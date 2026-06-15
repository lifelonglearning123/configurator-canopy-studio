import { requireSessionTenant } from '@/lib/session';
import { adminClient } from '@/lib/supabase-server';
import { formatMoney } from '@/lib/pricing';

export default async function AdminHome() {
  const { tenant } = await requireSessionTenant();
  const db = adminClient();

  const [{ count: leadCount }, { count: enabledProducts }, { data: recentLeads }] = await Promise.all([
    db.from('leads').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
    db.from('tenant_products').select('product_id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('enabled', true),
    db.from('leads').select('id, first_name, last_name, email, price_quoted_minor, currency, created_at, product_key')
      .eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(8),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-stone-600">Welcome back to {tenant.name}.</p>
      </header>

      <section className="grid grid-cols-3 gap-4">
        <Stat label="Leads" value={String(leadCount ?? 0)} />
        <Stat label="Products live" value={String(enabledProducts ?? 0)} />
        <Stat label="Plan" value={tenant.subscription_status} />
      </section>

      <section>
        <h2 className="text-sm font-semibold tracking-tight mb-3">Recent leads</h2>
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          {recentLeads?.length ? (
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-xs uppercase tracking-wider text-stone-500">
                <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Product</th><th className="text-right p-3">Quote</th><th className="text-right p-3">Date</th></tr>
              </thead>
              <tbody>
                {(recentLeads as { id: string; first_name: string; last_name: string; email: string; price_quoted_minor: number; currency: string; created_at: string; product_key: string | null }[]).map(l => (
                  <tr key={l.id} className="border-t border-stone-100">
                    <td className="p-3">{l.first_name} {l.last_name}<div className="text-xs text-stone-500">{l.email}</div></td>
                    <td className="p-3 text-stone-600">{l.product_key ?? '—'}</td>
                    <td className="p-3 text-right tabular-nums">{formatMoney(l.price_quoted_minor, l.currency)}</td>
                    <td className="p-3 text-right text-xs text-stone-500">{new Date(l.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-6 text-sm text-stone-500">No leads yet. Share your configurator link to start receiving inquiries.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <div className="text-xs uppercase tracking-wider text-stone-500">{label}</div>
      <div className="text-2xl font-semibold tracking-tight mt-1">{value}</div>
    </div>
  );
}
