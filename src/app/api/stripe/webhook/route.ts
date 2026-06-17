import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { env } from '@/lib/env';
import { adminClient } from '@/lib/supabase-server';
import { notifyPlatformStatusChange } from '@/lib/platform-ghl';

export const runtime = 'nodejs';

type SubStatus = 'incomplete' | 'trialing' | 'active' | 'past_due' | 'canceled';

async function pushStatusToPlatformGhl(customerId: string, status: SubStatus) {
  if (!env.platformGhlLocation() || !env.platformGhlToken()) return;
  const db = adminClient();
  const { data } = await db
    .from('tenants')
    .select('id, slug, name')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  const tenant = data as { id: string; slug: string; name: string } | null;
  if (!tenant) return;

  // Pull the customer's email from Stripe (we set it at signup).
  let email: string | null = null;
  try {
    const customer = await stripe().customers.retrieve(customerId);
    if (customer && !customer.deleted) email = customer.email ?? null;
  } catch (e) {
    console.error('[platform-ghl] customer retrieve failed', e instanceof Error ? e.message : String(e));
  }

  notifyPlatformStatusChange({
    email,
    company: tenant.name,
    tenant_slug: tenant.slug,
    tenant_id: tenant.id,
    subscription_status: status,
  });
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'missing_signature' }, { status: 400 });

  const raw = await req.text();
  let event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, env.stripeWebhook());
  } catch (e) {
    return NextResponse.json({ error: 'bad_signature', detail: String(e) }, { status: 400 });
  }

  const db = adminClient();

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      await db
        .from('tenants')
        .update({
          stripe_subscription_id: sub.id,
          subscription_status: sub.status,
        })
        .eq('stripe_customer_id', customerId);
      await pushStatusToPlatformGhl(customerId, sub.status as SubStatus);
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      await db
        .from('tenants')
        .update({ subscription_status: 'canceled', status: 'suspended' })
        .eq('stripe_customer_id', customerId);
      await pushStatusToPlatformGhl(customerId, 'canceled');
      break;
    }
    default:
      // ignore unrelated events
      break;
  }

  return NextResponse.json({ received: true });
}
