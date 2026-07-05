// Pre-configuration lead-gate capture. The buyer's name/email/phone go
// straight into the tenant's GoHighLevel location as a contact (tagged
// 'configurator-visitor'), so the seller holds a contact even when the
// visitor designs but never requests the detailed quote.
//
// Requires the tenant's GHL Location ID + API token (set under
// /admin/integrations); silently skips when they aren't configured, so the
// gate itself never breaks for tenants without GHL.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase-server';
import { resolveTenantByHost } from '@/lib/tenant';
import { upsertGhlContact } from '@/lib/crm';

const Body = z.object({
  name: z.string().min(1).max(150),
  email: z.string().email().max(200),
  phone: z.string().min(3).max(50),
  product_key: z.string().max(100).optional(),
  source_url: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'invalid_payload', detail: String(e) }, { status: 400 });
  }

  const host = req.headers.get('x-canopy-host') ?? req.headers.get('host') ?? '';
  const tenant = await resolveTenantByHost(host);
  if (!tenant) return NextResponse.json({ error: 'unknown_tenant' }, { status: 404 });
  if (tenant.status !== 'active') return NextResponse.json({ error: 'tenant_inactive' }, { status: 403 });

  const db = adminClient();
  const { data } = await db
    .from('tenants')
    .select('ghl_location_id, ghl_api_token')
    .eq('id', tenant.id)
    .maybeSingle();
  const t = data as { ghl_location_id: string | null; ghl_api_token: string | null } | null;

  if (!t?.ghl_location_id || !t?.ghl_api_token) {
    return NextResponse.json({ ok: true, crm: 'skipped' });
  }

  const result = await upsertGhlContact(t.ghl_location_id, t.ghl_api_token, {
    name: parsed.name,
    email: parsed.email,
    phone: parsed.phone,
    sourceUrl: parsed.source_url,
    tags: ['configurator-visitor', ...(parsed.product_key ? [`product-${parsed.product_key}`] : [])],
  });

  return NextResponse.json({ ok: true, crm: result.ok ? 'sent' : 'failed', status: result.status });
}
