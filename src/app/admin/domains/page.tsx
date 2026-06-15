import { requireSessionTenant } from '@/lib/session';
import { adminClient } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import { env } from '@/lib/env';
import { addDomain, getDomain, removeDomain, verifyDomain, isVercelConfigured } from '@/lib/vercel';

export default async function DomainsPage() {
  const { tenant } = await requireSessionTenant();
  const db = adminClient();
  const { data: doms } = await db
    .from('tenant_domains')
    .select('id, hostname, is_primary, verified_at, ssl_status, vercel_domain_id, created_at')
    .eq('tenant_id', tenant.id)
    .order('created_at');

  const vercelOn = isVercelConfigured();

  /* ---------- server actions ---------- */
  async function addDomainAction(formData: FormData) {
    'use server';
    const { tenant } = await requireSessionTenant();
    const hostname = String(formData.get('hostname') ?? '').trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!hostname || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(hostname)) return;
    const db = adminClient();

    // Insert pending row first so we have something even if Vercel call fails
    const { data: row, error } = await db
      .from('tenant_domains')
      .insert({ tenant_id: tenant.id, hostname })
      .select('id')
      .single();
    if (error || !row) return;

    if (isVercelConfigured()) {
      const r = await addDomain(hostname);
      if (r.ok && r.data) {
        await db
          .from('tenant_domains')
          .update({
            vercel_domain_id: r.data.name,
            verified_at: r.data.verified ? new Date().toISOString() : null,
            ssl_status: r.data.verified ? 'issued' : 'pending',
          })
          .eq('id', row.id);
      } else {
        // Vercel rejected the add — keep the row but flag the failure in ssl_status
        await db.from('tenant_domains').update({ ssl_status: 'failed' }).eq('id', row.id);
      }
    }
    revalidatePath('/admin/domains');
  }

  async function verifyDomainAction(formData: FormData) {
    'use server';
    const { tenant } = await requireSessionTenant();
    const id = String(formData.get('id'));
    const hostname = String(formData.get('hostname'));
    const db = adminClient();

    if (!isVercelConfigured()) return;
    const r = await verifyDomain(hostname);
    const current = await getDomain(hostname);
    const verified = (r.data?.verified ?? current.data?.verified) === true;
    await db
      .from('tenant_domains')
      .update({
        verified_at: verified ? new Date().toISOString() : null,
        ssl_status: verified ? 'issued' : 'pending',
      })
      .eq('id', id)
      .eq('tenant_id', tenant.id);
    revalidatePath('/admin/domains');
  }

  async function removeDomainAction(formData: FormData) {
    'use server';
    const { tenant } = await requireSessionTenant();
    const id = String(formData.get('id'));
    const hostname = String(formData.get('hostname'));
    const db = adminClient();
    if (isVercelConfigured()) await removeDomain(hostname);
    await db.from('tenant_domains').delete().eq('id', id).eq('tenant_id', tenant.id);
    revalidatePath('/admin/domains');
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Custom domain</h1>
        <p className="text-sm text-stone-600">
          Point a domain you own (e.g. <code className="text-xs">config.acmepergolas.co.uk</code>) at your configurator.
        </p>
      </header>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 max-w-2xl text-sm text-amber-900">
        <div className="font-medium">DNS setup</div>
        <ol className="mt-2 text-xs space-y-1 list-decimal list-inside">
          <li>Add a CNAME record on your domain:</li>
          <li>
            <code className="px-1 py-0.5 bg-amber-100 rounded">CNAME</code>{' '}
            <code className="px-1 py-0.5 bg-amber-100 rounded">config</code> →{' '}
            <code className="px-1 py-0.5 bg-amber-100 rounded">{env.cnameTarget()}</code>
          </li>
          <li>Add the hostname below — verification happens automatically. SSL is provisioned within ~5 minutes of DNS propagating.</li>
        </ol>
        {!vercelOn && (
          <p className="mt-3 text-[11px] text-amber-700">
            <strong>Vercel API not configured:</strong> domain entries will be stored but verification/SSL are manual until <code>VERCEL_TOKEN</code> + <code>VERCEL_PROJECT_ID</code> are set in env.
          </p>
        )}
      </div>

      <form action={addDomainAction} className="flex items-end gap-2 max-w-xl">
        <label className="flex-1">
          <span className="text-xs uppercase tracking-wider text-stone-600">Add hostname</span>
          <input name="hostname" placeholder="config.yourdomain.co.uk"
            className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-900" />
        </label>
        <button className="px-4 py-2 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-black">Add</button>
      </form>

      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden max-w-2xl">
        {doms?.length ? (
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wider text-stone-500">
              <tr>
                <th className="text-left p-3">Hostname</th>
                <th className="text-left p-3">SSL</th>
                <th className="text-left p-3">Verified</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(doms as { id: string; hostname: string; verified_at: string | null; ssl_status: string; vercel_domain_id: string | null }[]).map(d => (
                <tr key={d.id} className="border-t border-stone-100">
                  <td className="p-3 font-mono text-xs">{d.hostname}</td>
                  <td className="p-3 text-xs">
                    <span className={
                      d.ssl_status === 'issued' ? 'text-emerald-700 font-medium' :
                      d.ssl_status === 'failed' ? 'text-red-600' :
                      'text-stone-500'
                    }>
                      {d.ssl_status}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-stone-500">
                    {d.verified_at ? new Date(d.verified_at).toLocaleString() : '— pending —'}
                  </td>
                  <td className="p-3 text-right">
                    <div className="inline-flex gap-3 items-center">
                      {!d.verified_at && vercelOn && (
                        <form action={verifyDomainAction}>
                          <input type="hidden" name="id" value={d.id} />
                          <input type="hidden" name="hostname" value={d.hostname} />
                          <button className="text-xs text-stone-700 hover:underline">Re-verify</button>
                        </form>
                      )}
                      <form action={removeDomainAction}>
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="hostname" value={d.hostname} />
                        <button className="text-xs text-red-600 hover:underline">Remove</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-6 text-sm text-stone-500">
            No custom domains yet. Your configurator is currently at <code>{tenant.slug}.canopystudio.io</code>.
          </p>
        )}
      </div>
    </div>
  );
}
