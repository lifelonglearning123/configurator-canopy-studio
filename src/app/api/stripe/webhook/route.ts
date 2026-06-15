import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { env } from '@/lib/env';
import { adminClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

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
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      await db
        .from('tenants')
        .update({ subscription_status: 'canceled', status: 'suspended' })
        .eq('stripe_customer_id', customerId);
      break;
    }
    default:
      // ignore unrelated events
      break;
  }

  return NextResponse.json({ received: true });
}
