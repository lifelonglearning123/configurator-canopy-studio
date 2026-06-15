import { requireSessionTenant } from '@/lib/session';
import { adminClient } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';

export default async function IntegrationsPage() {
  const { tenant } = await requireSessionTenant();
  const db = adminClient();
  const { data } = await db.from('tenants').select('ghl_webhook_url, ghl_location_id').eq('id', tenant.id).maybeSingle();
  const t = (data as { ghl_webhook_url: string | null; ghl_location_id: string | null } | null) ?? { ghl_webhook_url: '', ghl_location_id: '' };

  async function save(formData: FormData) {
    'use server';
    const { tenant } = await requireSessionTenant();
    const db = adminClient();
    await db.from('tenants').update({
      ghl_webhook_url: String(formData.get('ghl_webhook_url') ?? '') || null,
      ghl_location_id: String(formData.get('ghl_location_id') ?? '') || null,
    }).eq('id', tenant.id);
    revalidatePath('/admin/integrations');
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">GHL & integrations</h1>
        <p className="text-sm text-stone-600">Every quote request is posted to your GHL inbound webhook in addition to being stored here.</p>
      </header>

      <form action={save} className="bg-white border border-stone-200 rounded-xl p-6 space-y-4 max-w-xl">
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-stone-600">GHL inbound webhook URL</span>
          <input name="ghl_webhook_url" defaultValue={t.ghl_webhook_url ?? ''} placeholder="https://services.leadconnectorhq.com/hooks/…"
            className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-900 font-mono text-xs" />
          <span className="text-[11px] text-stone-500 mt-1 block">In GHL: Automation → Workflows → Trigger: Inbound Webhook → copy URL.</span>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-stone-600">GHL location ID (optional)</span>
          <input name="ghl_location_id" defaultValue={t.ghl_location_id ?? ''} placeholder="abcDEF123…"
            className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-900 font-mono text-xs" />
        </label>
        <button className="px-4 py-2.5 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-black">Save</button>
      </form>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 max-w-xl text-xs text-amber-900">
        <strong>Payload sent on each lead:</strong>
        <pre className="mt-2 text-[10px] font-mono whitespace-pre-wrap">{`{
  "tenant_slug": "your-slug",
  "product_key": "pergola",
  "customer": { "first_name", "last_name", "email", "phone", "postcode", "notes" },
  "configuration": { …full config snapshot… },
  "price_quoted_minor": 728400,
  "currency": "${tenant.currency}",
  "source_url": "https://…"
}`}</pre>
      </div>
    </div>
  );
}
