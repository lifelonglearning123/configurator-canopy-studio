import Link from 'next/link';
import { adminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

type TenantSummary = {
  id: string;
  slug: string;
  name: string;
  subscription_status: string;
  status: string;
  stripe_customer_id: string | null;
  created_at: string;
};

type OwnerLink = { tenant_id: string; user_id: string; role: string };

async function listTenants(query: string): Promise<Array<TenantSummary & { ownerEmail: string | null; leadCount: number }>> {
  const db = adminClient();

  let q = db
    .from('tenants')
    .select('id, slug, name, subscription_status, status, stripe_customer_id, created_at')
    .order('created_at', { ascending: false });
  if (query) q = q.or(`slug.ilike.%${query}%,name.ilike.%${query}%`);
  const { data: tenants } = await q;
  const rows = (tenants ?? []) as TenantSummary[];
  if (!rows.length) return [];

  const ids = rows.map(t => t.id);

  // Owners (one query for all tenants on screen).
  const { data: links } = await db
    .from('tenant_users')
    .select('tenant_id, user_id, role')
    .in('tenant_id', ids)
    .eq('role', 'owner');
  const ownerByTenant = new Map<string, string>();
  for (const l of (links ?? []) as OwnerLink[]) ownerByTenant.set(l.tenant_id, l.user_id);

  // Resolve auth user emails via admin API (per-user — cheap for <50 tenants).
  const emailByUser = new Map<string, string>();
  const userIds = Array.from(new Set(ownerByTenant.values()));
  await Promise.all(userIds.map(async uid => {
    try {
      const r = await db.auth.admin.getUserById(uid);
      const e = r.data.user?.email ?? null;
      if (e) emailByUser.set(uid, e);
    } catch {/* ignore */}
  }));

  // Lead counts per tenant.
  const leadCounts = new Map<string, number>();
  await Promise.all(ids.map(async id => {
    const { count } = await db.from('leads').select('id', { count: 'exact', head: true }).eq('tenant_id', id);
    leadCounts.set(id, count ?? 0);
  }));

  return rows.map(t => ({
    ...t,
    ownerEmail: emailByUser.get(ownerByTenant.get(t.id) ?? '') ?? null,
    leadCount: leadCounts.get(t.id) ?? 0,
  }));
}

export default async function SuperAdminTenantsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  const rows = await listTenants(q.trim());

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tenants</h1>
          <p className="text-sm text-stone-600">{rows.length} {rows.length === 1 ? 'agency' : 'agencies'} on the platform.</p>
        </div>
        <Link href="/super-admin/create" className="px-4 py-2.5 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-black">
          New tenant →
        </Link>
      </header>

      <form className="flex gap-2" action="/super-admin">
        <input name="q" defaultValue={q} placeholder="Search slug or name…"
          className="flex-1 px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-900" />
        <button className="px-4 py-2 rounded-lg border border-stone-300 text-sm hover:bg-stone-100">Search</button>
        {q && <Link href="/super-admin" className="px-4 py-2 rounded-lg text-sm text-stone-500 hover:bg-stone-100">Clear</Link>}
      </form>

      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        {rows.length ? (
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wider text-stone-500">
              <tr>
                <th className="text-left p-3">Tenant</th>
                <th className="text-left p-3">Owner</th>
                <th className="text-left p-3">Subscription</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Leads</th>
                <th className="text-right p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.id} className="border-t border-stone-100 hover:bg-stone-50">
                  <td className="p-3">
                    <Link href={`/super-admin/tenants/${t.id}`} className="font-medium hover:underline">{t.name}</Link>
                    <div className="text-xs text-stone-500">{t.slug}</div>
                  </td>
                  <td className="p-3 text-stone-600">{t.ownerEmail ?? <span className="text-stone-400">—</span>}</td>
                  <td className="p-3"><StatusBadge value={t.subscription_status} /></td>
                  <td className="p-3"><StatusBadge value={t.status} /></td>
                  <td className="p-3 text-right tabular-nums">{t.leadCount}</td>
                  <td className="p-3 text-right text-xs text-stone-500">{new Date(t.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-6 text-sm text-stone-500">No tenants match.</p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  const tone =
    value === 'active' ? 'bg-emerald-100 text-emerald-900' :
    value === 'trialing' ? 'bg-sky-100 text-sky-900' :
    value === 'incomplete' ? 'bg-amber-100 text-amber-900' :
    value === 'past_due' ? 'bg-orange-100 text-orange-900' :
    value === 'canceled' || value === 'suspended' || value === 'deleted' ? 'bg-rose-100 text-rose-900' :
    'bg-stone-100 text-stone-700';
  return <span className={`inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${tone}`}>{value}</span>;
}
