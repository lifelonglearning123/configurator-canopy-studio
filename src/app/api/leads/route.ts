import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase-server';
import { resolveTenantByHost } from '@/lib/tenant';
import { deliverCrm } from '@/lib/crm';
import { env } from '@/lib/env';

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
  /** JPEG of the configured build, captured at submit time (hi-res snapshot
   *  or the photo render). Stored in the `renders` bucket; its public URL
   *  travels with the lead to the CRM and the admin lead list. */
  render_data_url: z.string().regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/).max(2_400_000).optional(),
  /** What `render_data_url` is: a path-traced photo, a raster snapshot, or
   *  nothing (phones). Anything but a photo queues a photoreal render for
   *  the GPU render worker when that is enabled. */
  render_kind: z.enum(['photo', 'snapshot', 'none']).optional(),
  /** Product scene id, needed to rebuild the exact scene off-device. */
  scene: z.string().max(50).optional(),
});

// Upload the lead's render and return its public URL, or null. Never throws:
// a missing picture must not lose the lead.
async function storeRender(db: ReturnType<typeof adminClient>, tenantId: string, leadId: string, dataUrl: string | undefined): Promise<string | null> {
  if (!dataUrl) return null;
  try {
    const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
    const path = `${tenantId}/${leadId}.jpg`;
    const { error } = await db.storage.from('renders').upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) { console.warn('lead render upload failed', error.message); return null; }
    return db.storage.from('renders').getPublicUrl(path).data.publicUrl;
  } catch (e) {
    console.warn('lead render upload failed', e);
    return null;
  }
}

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
  const leadId = (lead as { id: string }).id;

  const renderUrl = await storeRender(db, tenant.id, leadId, parsed.render_data_url);
  if (renderUrl) await db.from('leads').update({ render_url: renderUrl }).eq('id', leadId);

  // Queue a photoreal still for the render worker unless the request already
  // carries one. Best effort: the lead is stored whatever happens here.
  if (env.renderJobsEnabled() && parsed.render_kind !== 'photo') {
    const { error: jobErr } = await db.from('render_jobs').insert({
      tenant_id: tenant.id,
      lead_id: leadId,
      product_key: parsed.product_key,
      scene: parsed.scene ?? null,
      config_json: parsed.configuration as never,
    });
    if (jobErr) console.warn('render job enqueue failed', jobErr.message);
  }

  // Look up the tenant's CRM webhook URL.
  // (DB column is still named `ghl_webhook_url` — it's a generic webhook now.)
  const { data: ten } = await db
    .from('tenants')
    .select('ghl_webhook_url')
    .eq('id', tenant.id)
    .maybeSingle();
  const webhook = (ten as { ghl_webhook_url: string | null } | null)?.ghl_webhook_url;

  if (!webhook) {
    await db.from('leads').update({ ghl_status: 'skipped' }).eq('id', leadId);
    return NextResponse.json({ ok: true, lead_id: leadId, crm: 'skipped', render_url: renderUrl ?? undefined });
  }

  // Fire-and-await CRM delivery (this route is invoked from a form submit;
  // a small extra latency is acceptable and the user sees immediate confirmation).
  const result = await deliverCrm(webhook, {
    tenant_slug: tenant.slug,
    product_key: parsed.product_key,
    customer: parsed.customer,
    configuration: parsed.configuration,
    price_quoted_minor: parsed.price_quoted_minor,
    currency: tenant.currency,
    source_url: parsed.source_url,
    render_url: renderUrl ?? undefined,
  });

  await db
    .from('leads')
    .update({
      ghl_status: result.ok ? 'sent' : 'failed',
      ghl_response: { status: result.status, body: result.body.slice(0, 2000) },
      ghl_attempts: 1,
    })
    .eq('id', leadId);

  return NextResponse.json({ ok: true, lead_id: leadId, crm: result.ok ? 'sent' : 'failed', render_url: renderUrl ?? undefined });
}
