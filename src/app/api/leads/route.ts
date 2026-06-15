import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase-server';
import { resolveTenantByHost } from '@/lib/tenant';
import { deliverGhl } from '@/lib/ghl';

const Body = z.object({
  product_key: z.string().min(1),
  configuration: z.record(z.string(), z.unknown()),
  price_quoted_minor: z.number().int().nonnegative(),
  customer: z.object({
    first_name: z.string().min(1).max(100),
    last_name: z.string().min(1).max(100),
    email: z.string().email().max(200),
    phone: z.string().max(50).optional(),
    postcode: z.string().max(20).optional(),
    notes: z.string().max(2000).optional(),
  }),
  source_url: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'invalid_payload', detail: String(e) }, { status: 400 });
  }

  // Resolve tenant from Host. Public configurator → always tenant context.
  const host = req.headers.get('x-canopy-host') ?? req.headers.get('host') ?? '';
  const tenant = await resolveTenantByHost(host);
  if (!tenant) return NextResponse.json({ error: 'unknown_tenant' }, { status: 404 });
  if (tenant.status !== 'active') return NextResponse.json({ error: 'tenant_inactive' }, { status: 403 });

  const db = adminClient();

  // Insert the lead first — we want it stored even if GHL delivery later fails.
  const { data: lead, error } = await db
    .from('leads')
    .insert({
      tenant_id: tenant.id,
      product_key: parsed.product_key,
      config_json: parsed.configuration as never,
      first_name: parsed.customer.first_name,
      last_name: parsed.customer.last_name,
      email: parsed.customer.email,
      phone: parsed.customer.phone ?? null,
      postcode: parsed.customer.postcode ?? null,
      notes: parsed.customer.notes ?? null,
      price_quoted_minor: parsed.price_quoted_minor,
      currency: tenant.currency,
      source_url: parsed.source_url ?? null,
      user_agent: req.headers.get('user-agent') ?? null,
    })
    .select('id')
    .single();
  if (error || !lead) return NextResponse.json({ error: 'db_insert_failed', detail: error?.message }, { status: 500 });

  // Look up the tenant's GHL webhook URL.
  const { data: ten } = await db
    .from('tenants')
    .select('ghl_webhook_url')
    .eq('id', tenant.id)
    .maybeSingle();
  const webhook = (ten as { ghl_webhook_url: string | null } | null)?.ghl_webhook_url;

  if (!webhook) {
    await db.from('leads').update({ ghl_status: 'skipped' }).eq('id', (lead as { id: string }).id);
    return NextResponse.json({ ok: true, lead_id: (lead as { id: string }).id, ghl: 'skipped' });
  }

  // Fire-and-await GHL delivery (this route is invoked from a form submit;
  // a small extra latency is acceptable and the user sees immediate confirmation).
  const result = await deliverGhl(webhook, {
    tenant_slug: tenant.slug,
    product_key: parsed.product_key,
    customer: parsed.customer,
    configuration: parsed.configuration,
    price_quoted_minor: parsed.price_quoted_minor,
    currency: tenant.currency,
    source_url: parsed.source_url,
  });

  await db
    .from('leads')
    .update({
      ghl_status: result.ok ? 'sent' : 'failed',
      ghl_response: { status: result.status, body: result.body.slice(0, 2000) },
      ghl_attempts: 1,
    })
    .eq('id', (lead as { id: string }).id);

  return NextResponse.json({ ok: true, lead_id: (lead as { id: string }).id, ghl: result.ok ? 'sent' : 'failed' });
}
