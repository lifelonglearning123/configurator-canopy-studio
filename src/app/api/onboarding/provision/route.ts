import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, serverClient } from '@/lib/supabase-server';
import { stripe } from '@/lib/stripe';
import { env } from '@/lib/env';
import { defaultPricingLineItems } from '@/lib/catalog';

const Body = z.object({
  company: z.string().min(1).max(120),
  slug:    z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Lowercase letters, digits and hyphens only'),
  email:   z.string().email(),
});

export async function POST(req: NextRequest) {
  // Auth required: the sign-up page just signed the user in, so we have a session.
  const auth = await serverClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: 'invalid_payload', detail: String(e) }, { status: 400 }); }

  const db = adminClient();

  // Refuse if the slug is taken.
  const { data: taken } = await db.from('tenants').select('id').eq('slug', parsed.slug).maybeSingle();
  if (taken) return NextResponse.json({ error: 'slug_taken' }, { status: 409 });

  // 1. Stripe customer.
  const customer = await stripe().customers.create({
    email: parsed.email,
    name:  parsed.company,
    metadata: { user_id: user.id, slug: parsed.slug },
  });

  // 2. Create the tenant row (subscription_status starts incomplete; webhook flips it).
  const { data: tenant, error: tErr } = await db
    .from('tenants')
    .insert({
      slug: parsed.slug,
      name: parsed.company,
      stripe_customer_id: customer.id,
    })
    .select('id')
    .single();
  if (tErr || !tenant) {
    return NextResponse.json({ error: 'tenant_insert_failed', detail: tErr?.message }, { status: 500 });
  }
  const tenantId = (tenant as { id: string }).id;

  // 3. Link user as owner.
  await db.from('tenant_users').insert({ user_id: user.id, tenant_id: tenantId, role: 'owner' });

  // 4. Default pricing rules — copy the in-code defaults so the tenant has something to edit.
  const rules = defaultPricingLineItems().map(r => ({
    tenant_id: tenantId,
    line_item_key: r.key,
    label: r.label,
    amount_minor: r.amountMinor,
    product_key: r.productKey ?? null,
  }));
  await db.from('pricing_rules').insert(rules);

  // 5. Enable all products by default (tenant turns off what they don't offer).
  const { data: products } = await db.from('products').select('id').order('key');
  if (products?.length) {
    await db.from('tenant_products').insert(
      products.map((p, i) => ({ tenant_id: tenantId, product_id: (p as { id: string }).id, enabled: true, sort_order: i }))
    );
  }

  // 6. Stripe Checkout session.
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customer.id,
    line_items: [{ price: env.stripePrice(), quantity: 1 }],
    subscription_data: {
      metadata: { tenant_id: tenantId },
    },
    success_url: `${env.appUrl()}/onboarding/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${env.appUrl()}/sign-up`,
    metadata: { tenant_id: tenantId, user_id: user.id },
  });

  return NextResponse.json({ checkout_url: session.url });
}
