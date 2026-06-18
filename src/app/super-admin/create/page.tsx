import { redirect } from 'next/navigation';
import { requireSuperAdmin } from '@/lib/super-admin';
import { adminClient } from '@/lib/supabase-server';
import { stripe } from '@/lib/stripe';
import { defaultPricingLineItems } from '@/lib/catalog';
import { sendMagicLinkEmail } from '@/lib/auth-email';
import { notifyPlatformSignup } from '@/lib/platform-ghl';

export const dynamic = 'force-dynamic';

const SUB_STATES = ['incomplete', 'trialing', 'active', 'past_due', 'canceled'] as const;

async function provisionTenant(formData: FormData): Promise<{ id: string } | { error: string }> {
  'use server';
  await requireSuperAdmin();

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const company = String(formData.get('company') ?? '').trim();
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const subscriptionStatusRaw = String(formData.get('subscription_status') ?? 'active');
  const createStripe = formData.get('create_stripe') === 'on';
  const sendLink = formData.get('send_link') === 'on';

  if (!email.includes('@')) return { error: 'Valid email required' };
  if (!company) return { error: 'Company required' };
  if (!/^[a-z0-9-]{2,50}$/.test(slug)) return { error: 'Slug must be 2-50 chars, lowercase / digits / hyphens' };
  const subscriptionStatus = SUB_STATES.find(s => s === subscriptionStatusRaw);
  if (!subscriptionStatus) return { error: 'Invalid subscription status' };

  const db = adminClient();

  const { data: taken } = await db.from('tenants').select('id').eq('slug', slug).maybeSingle();
  if (taken) return { error: 'Slug already taken' };

  // 1. Auth user. If they already exist (re-provision scenario), find and reuse.
  let userId: string | null = null;
  const createRes = await db.auth.admin.createUser({ email, email_confirm: true });
  if (createRes.error) {
    // Likely already exists — look them up.
    const list = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`,
        },
      },
    );
    const j = (await list.json()) as { users?: Array<{ id: string; email?: string | null }> };
    const found = (j.users ?? []).find(u => (u.email ?? '').toLowerCase() === email);
    if (!found) return { error: `Could not create or find auth user: ${createRes.error.message}` };
    userId = found.id;
  } else {
    userId = createRes.data.user?.id ?? null;
  }
  if (!userId) return { error: 'Auth user creation failed' };

  // 2. Optional Stripe customer.
  let stripeCustomerId: string | null = null;
  if (createStripe) {
    try {
      const customer = await stripe().customers.create({
        email,
        name: company,
        metadata: { user_id: userId, slug, source: 'super-admin' },
      });
      stripeCustomerId = customer.id;
    } catch (e) {
      return { error: `Stripe customer failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  // 3. Tenant row.
  const { data: tenant, error: tErr } = await db
    .from('tenants')
    .insert({
      slug,
      name: company,
      stripe_customer_id: stripeCustomerId,
      subscription_status: subscriptionStatus,
    })
    .select('id')
    .single();
  if (tErr || !tenant) return { error: `Tenant insert failed: ${tErr?.message ?? 'unknown'}` };
  const tenantId = (tenant as { id: string }).id;

  // 4. Owner link. Ignore "already linked" conflicts so re-runs are safe.
  await db.from('tenant_users').upsert(
    { user_id: userId, tenant_id: tenantId, role: 'owner' },
    { onConflict: 'user_id,tenant_id' },
  );

  // 5. Pricing rules (defaults).
  const rules = defaultPricingLineItems().map(r => ({
    tenant_id: tenantId,
    line_item_key: r.key,
    label: r.label,
    amount_minor: r.amountMinor,
    product_key: r.productKey ?? null,
  }));
  await db.from('pricing_rules').insert(rules);

  // 6. Enable all products by default.
  const { data: products } = await db.from('products').select('id').order('key');
  if (products?.length) {
    await db.from('tenant_products').insert(
      products.map((p, i) => ({ tenant_id: tenantId, product_id: (p as { id: string }).id, enabled: true, sort_order: i })),
    );
  }

  // 7. Push to platform GHL.
  notifyPlatformSignup({
    email,
    company,
    tenant_slug: slug,
    tenant_id: tenantId,
    subscription_status: subscriptionStatus,
  });

  // 8. Optionally email them a sign-in link.
  if (sendLink) {
    await sendMagicLinkEmail(email);
  }

  return { id: tenantId };
}

async function submit(formData: FormData) {
  'use server';
  const r = await provisionTenant(formData);
  if ('error' in r) {
    redirect(`/super-admin/create?error=${encodeURIComponent(r.error)}`);
  }
  redirect(`/super-admin/tenants/${r.id}?created=1`);
}

export default async function CreateTenantPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireSuperAdmin();
  const { error } = await searchParams;

  return (
    <div className="space-y-6 max-w-xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Create tenant</h1>
        <p className="text-sm text-stone-600">
          Provision an agency manually — creates the auth user, tenant, default catalog and pricing, and optionally a Stripe customer.
        </p>
      </header>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

      <form action={submit} className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
        <Field label="Owner email" name="email" type="email" placeholder="founder@agency.com" required />
        <Field label="Company name" name="company" placeholder="ACME Pergolas Ltd" required />
        <Field label="Workspace slug" name="slug" placeholder="acme" required hint=".canopystudio.io" />

        <label className="block">
          <span className="text-xs uppercase tracking-wider text-stone-600">Subscription status</span>
          <select name="subscription_status" defaultValue="active"
            className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-900">
            {SUB_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="text-xs text-stone-500 mt-1 block">Use <span className="font-mono">active</span> to comp them, or <span className="font-mono">incomplete</span> if they'll pay later.</span>
        </label>

        <label className="flex items-center gap-2">
          <input type="checkbox" name="create_stripe" defaultChecked className="rounded" />
          <span className="text-sm">Create Stripe customer (recommended — lets you bill them later)</span>
        </label>

        <label className="flex items-center gap-2">
          <input type="checkbox" name="send_link" defaultChecked className="rounded" />
          <span className="text-sm">Email them a sign-in link</span>
        </label>

        <button className="w-full px-4 py-2.5 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-black">
          Provision tenant →
        </button>
      </form>
    </div>
  );
}

function Field({ label, name, type = 'text', placeholder, required, hint }: {
  label: string; name: string; type?: string; placeholder?: string; required?: boolean; hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-stone-600">{label}</span>
      {hint ? (
        <div className="mt-1 flex items-center rounded-lg border border-stone-300 overflow-hidden focus-within:border-stone-900">
          <input required={required} type={type} name={name} placeholder={placeholder}
            className="flex-1 px-3 py-2 text-sm focus:outline-none" />
          <span className="px-3 py-2 text-xs text-stone-500 bg-stone-50 border-l border-stone-200">{hint}</span>
        </div>
      ) : (
        <input required={required} type={type} name={name} placeholder={placeholder}
          className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-900" />
      )}
    </label>
  );
}
