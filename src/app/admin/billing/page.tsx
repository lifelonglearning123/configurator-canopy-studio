import { requireSessionTenant } from '@/lib/session';
import { adminClient } from '@/lib/supabase-server';
import { stripe } from '@/lib/stripe';
import { env } from '@/lib/env';
import { redirect } from 'next/navigation';

export default async function BillingPage() {
  const { tenant } = await requireSessionTenant();
  const db = adminClient();
  const { data } = await db.from('tenants').select('stripe_customer_id, subscription_status, stripe_subscription_id').eq('id', tenant.id).maybeSingle();
  const t = data as { stripe_customer_id: string | null; subscription_status: string; stripe_subscription_id: string | null } | null;

  async function portal() {
    'use server';
    const { tenant } = await requireSessionTenant();
    const db = adminClient();
    const { data } = await db.from('tenants').select('stripe_customer_id').eq('id', tenant.id).maybeSingle();
    const customerId = (data as { stripe_customer_id: string | null } | null)?.stripe_customer_id;
    if (!customerId) return;
    const session = await stripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${env.appUrl()}/admin/billing`,
    });
    redirect(session.url);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-stone-600">£49 / month per workspace.</p>
      </header>

      <div className="bg-white border border-stone-200 rounded-xl p-6 max-w-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-stone-600">Status</span>
          <span className="text-sm font-medium">{t?.subscription_status ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-stone-600">Subscription</span>
          <span className="text-xs font-mono text-stone-500">{t?.stripe_subscription_id ?? '—'}</span>
        </div>
        <form action={portal}>
          <button className="mt-3 px-4 py-2.5 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-black">Manage billing in Stripe portal →</button>
        </form>
      </div>
    </div>
  );
}
