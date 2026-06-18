import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { adminClient } from '@/lib/supabase-server';
import { requireSuperAdmin } from '@/lib/super-admin';
import { sendMagicLinkEmail, sendResetPasswordEmail } from '@/lib/auth-email';

export const dynamic = 'force-dynamic';

const SUB_STATES = ['incomplete', 'trialing', 'active', 'past_due', 'canceled'] as const;
const LIFECYCLE = ['active', 'suspended', 'deleted'] as const;

type FullTenant = {
  id: string;
  slug: string;
  name: string;
  currency: string;
  subscription_status: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
};

async function loadTenant(id: string) {
  const db = adminClient();
  const { data } = await db
    .from('tenants')
    .select('id, slug, name, currency, subscription_status, status, stripe_customer_id, stripe_subscription_id, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();
  const tenant = data as FullTenant | null;
  if (!tenant) return null;

  const { data: link } = await db
    .from('tenant_users')
    .select('user_id, role')
    .eq('tenant_id', id)
    .eq('role', 'owner')
    .maybeSingle();
  const ownerUserId = (link as { user_id: string } | null)?.user_id ?? null;

  let ownerEmail: string | null = null;
  if (ownerUserId) {
    try {
      const r = await db.auth.admin.getUserById(ownerUserId);
      ownerEmail = r.data.user?.email ?? null;
    } catch {/* ignore */}
  }

  const { count: leadCount } = await db.from('leads').select('id', { count: 'exact', head: true }).eq('tenant_id', id);

  return { tenant, ownerUserId, ownerEmail, leadCount: leadCount ?? 0 };
}

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadTenant(id);
  if (!ctx) notFound();
  const { tenant, ownerEmail, leadCount } = ctx;

  async function updateSubscription(formData: FormData) {
    'use server';
    await requireSuperAdmin();
    const next = String(formData.get('subscription_status') ?? '');
    if (!SUB_STATES.includes(next as (typeof SUB_STATES)[number])) return;
    await adminClient().from('tenants').update({ subscription_status: next }).eq('id', id);
    revalidatePath(`/super-admin/tenants/${id}`);
    revalidatePath('/super-admin');
  }

  async function updateLifecycle(formData: FormData) {
    'use server';
    await requireSuperAdmin();
    const next = String(formData.get('status') ?? '');
    if (!LIFECYCLE.includes(next as (typeof LIFECYCLE)[number])) return;
    await adminClient().from('tenants').update({ status: next }).eq('id', id);
    revalidatePath(`/super-admin/tenants/${id}`);
    revalidatePath('/super-admin');
  }

  async function sendMagic() {
    'use server';
    await requireSuperAdmin();
    if (!ownerEmail) return;
    await sendMagicLinkEmail(ownerEmail);
    redirect(`/super-admin/tenants/${id}?sent=magic`);
  }

  async function sendReset() {
    'use server';
    await requireSuperAdmin();
    if (!ownerEmail) return;
    await sendResetPasswordEmail(ownerEmail);
    redirect(`/super-admin/tenants/${id}?sent=reset`);
  }

  const stripeBase = 'https://dashboard.stripe.com';

  return (
    <div className="space-y-8">
      <header>
        <Link href="/super-admin" className="text-xs text-stone-500 hover:underline">← All tenants</Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">{tenant.name}</h1>
        <p className="text-sm text-stone-600">
          <span className="font-mono">{tenant.slug}.canopystudio.io</span>
          <span className="mx-2 text-stone-300">·</span>
          Created {new Date(tenant.created_at).toLocaleDateString()}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4">
        <Card label="Owner email" value={ownerEmail ?? '—'} />
        <Card label="Leads" value={String(leadCount)} />
        <Card label="Subscription" value={tenant.subscription_status} />
        <Card label="Lifecycle status" value={tenant.status} />
        <Card label="Stripe customer" value={tenant.stripe_customer_id ?? '—'}
          href={tenant.stripe_customer_id ? `${stripeBase}/customers/${tenant.stripe_customer_id}` : undefined} />
        <Card label="Stripe subscription" value={tenant.stripe_subscription_id ?? '—'}
          href={tenant.stripe_subscription_id ? `${stripeBase}/subscriptions/${tenant.stripe_subscription_id}` : undefined} />
      </section>

      <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-5 max-w-2xl">
        <h2 className="text-sm font-semibold tracking-tight">Billing</h2>
        <form action={updateSubscription} className="flex items-center gap-2">
          <select name="subscription_status" defaultValue={tenant.subscription_status}
            className="px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-900">
            {SUB_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="px-4 py-2 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-black">
            Update subscription
          </button>
        </form>
        <p className="text-xs text-stone-500">
          Marking as <span className="font-mono">active</span> overrides what Stripe last reported. If their Stripe subscription is
          still <span className="font-mono">incomplete</span>, it will auto-cancel after ~23 h and the webhook will flip this back.
          To comp permanently, cancel the Stripe subscription first.
        </p>
      </section>

      <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-5 max-w-2xl">
        <h2 className="text-sm font-semibold tracking-tight">Lifecycle</h2>
        <form action={updateLifecycle} className="flex items-center gap-2">
          <select name="status" defaultValue={tenant.status}
            className="px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-900">
            {LIFECYCLE.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="px-4 py-2 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-black">
            Update lifecycle
          </button>
        </form>
        <p className="text-xs text-stone-500">
          <span className="font-mono">suspended</span> blocks tenant access without deleting their data; <span className="font-mono">deleted</span> is
          intended for permanent off-boarding.
        </p>
      </section>

      <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-3 max-w-2xl">
        <h2 className="text-sm font-semibold tracking-tight">Send email to owner</h2>
        {ownerEmail ? (
          <div className="flex gap-2">
            <form action={sendMagic}>
              <button className="px-4 py-2 rounded-lg border border-stone-300 text-sm hover:bg-stone-100">
                Send sign-in link
              </button>
            </form>
            <form action={sendReset}>
              <button className="px-4 py-2 rounded-lg border border-stone-300 text-sm hover:bg-stone-100">
                Send password reset
              </button>
            </form>
          </div>
        ) : (
          <p className="text-xs text-stone-500">No owner email on file. Make sure an auth user is linked via tenant_users.</p>
        )}
      </section>
    </div>
  );
}

function Card({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <div className="text-xs uppercase tracking-wider text-stone-500">{label}</div>
      <div className="text-sm font-medium mt-1 break-all">
        {href ? <a className="underline" href={href} target="_blank" rel="noreferrer">{value}</a> : value}
      </div>
    </div>
  );
}
