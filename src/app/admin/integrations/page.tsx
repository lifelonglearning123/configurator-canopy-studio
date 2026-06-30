import { requireSessionTenant } from '@/lib/session';
import { adminClient } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { deliverGhl, type GhlPayload } from '@/lib/ghl';

// Representative payload used by the "Send test payload" button. The shape
// mirrors what the live /api/leads route ships on a real submission, so any
// GHL workflow that handles this test event is guaranteed to handle real
// leads identically. Marked clearly as a test so it never gets mistaken for
// a real enquiry.
function buildTestPayload(slug: string, currency: string): GhlPayload {
  return {
    tenant_slug: slug,
    product_key: 'pergola',
    customer: {
      first_name: 'Test',
      last_name:  'Lead',
      email:      'test+integration@canopystudio.io',
      phone:      '+44 7000 000000',
      postcode:   'SW1A 1AA',
      notes:      'TEST PAYLOAD — sent from the Canopy Studio integrations page to verify the GHL workflow. No real customer action; safe to delete in GHL.',
    },
    configuration: {
      _test: true,
      structure: 'freestanding',
      frameColor: 'anthracite',
      length: 5,
      depth: 3.5,
      height: 2.6,
      roof: 'louvred-retract',
      walls: { front: 'none', back: 'none', left: 'none', right: 'none' },
      addons: { lighting: true, bar: false, heater: false, speakers: false },
    },
    price_quoted_minor: 728400,
    currency,
    source_url: `https://${slug}.canopystudio.io/configure/pergola`,
  };
}

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ test?: string; status?: string; detail?: string }> }) {
  const { tenant } = await requireSessionTenant();
  const sp = await searchParams;
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

  async function sendTest() {
    'use server';
    const { tenant } = await requireSessionTenant();
    const db = adminClient();
    const { data } = await db.from('tenants').select('ghl_webhook_url').eq('id', tenant.id).maybeSingle();
    const webhook = (data as { ghl_webhook_url: string | null } | null)?.ghl_webhook_url;
    if (!webhook) {
      redirect('/admin/integrations?test=missing');
    }
    const result = await deliverGhl(webhook, buildTestPayload(tenant.slug, tenant.currency));
    const params = new URLSearchParams({
      test: result.ok ? 'ok' : 'fail',
      status: String(result.status),
      detail: (result.body || '').slice(0, 300),
    });
    redirect(`/admin/integrations?${params.toString()}`);
  }

  const testBanner = sp.test ? <TestResult test={sp.test} status={sp.status} detail={sp.detail} /> : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">GHL & integrations</h1>
        <p className="text-sm text-stone-600">Every quote request is posted to your GHL inbound webhook in addition to being stored here.</p>
      </header>

      {testBanner}

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

      <div className="bg-white border border-stone-200 rounded-xl p-6 max-w-xl space-y-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Send a test payload</h2>
          <p className="text-xs text-stone-500 mt-1">
            Posts a representative example payload to the webhook URL above so you can wire up the workflow
            in GHL against a real event. The payload is clearly marked as a test (customer name "Test Lead",
            note included) — your GHL trigger will see exactly the same JSON shape as a live lead.
          </p>
        </div>
        <form action={sendTest}>
          <button className="px-4 py-2.5 rounded-lg border border-stone-900 text-sm font-medium hover:bg-stone-100">
            Send test payload to GHL →
          </button>
        </form>
      </div>

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

function TestResult({ test, status, detail }: { test: string; status?: string; detail?: string }) {
  if (test === 'missing') {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 max-w-xl text-sm text-amber-900">
        Add a GHL webhook URL above and save it before sending a test payload.
      </div>
    );
  }
  if (test === 'ok') {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 max-w-xl text-sm text-emerald-900">
        ✓ Test payload delivered. GHL responded with <span className="font-mono">{status}</span>.
        {detail ? <pre className="mt-2 text-[10px] font-mono whitespace-pre-wrap text-emerald-800">{detail}</pre> : null}
      </div>
    );
  }
  return (
    <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 max-w-xl text-sm text-rose-900">
      ✗ Test payload failed. GHL responded with <span className="font-mono">{status || '(no response)'}</span>.
      {detail ? <pre className="mt-2 text-[10px] font-mono whitespace-pre-wrap text-rose-800">{detail}</pre> : null}
      <p className="mt-2 text-xs">
        Double-check the webhook URL is correct and the workflow trigger is active. Save the URL again if you just pasted it.
      </p>
    </div>
  );
}
