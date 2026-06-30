import Link from 'next/link';
import { redirect } from 'next/navigation';
import { serverClient, adminClient } from '@/lib/supabase-server';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supa = await serverClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) redirect('/sign-in');

  // Determine the user's tenant for the sidebar header.
  const db = adminClient();
  const { data: link } = await db
    .from('tenant_users')
    .select('tenant_id, tenants(name, slug, subscription_status)')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!link) redirect('/sign-up');
  const tenant = (link as { tenants: { name: string; slug: string; subscription_status: string } }).tenants;

  const nav = [
    { href: '/admin',                label: 'Overview' },
    { href: '/admin/catalog',        label: 'Catalog' },
    { href: '/admin/pricing',        label: 'Pricing' },
    { href: '/admin/branding',       label: 'Branding' },
    { href: '/admin/integrations',   label: 'CRM & integrations' },
    { href: '/admin/domains',        label: 'Custom domain' },
    { href: '/admin/billing',        label: 'Billing' },
  ];

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 grid grid-cols-[240px_1fr]">
      <aside className="border-r border-stone-200 bg-white p-5">
        <div className="font-semibold tracking-tight">Canopy Studio</div>
        <div className="text-xs text-stone-500 mt-0.5">{tenant.name}</div>
        <div className="text-[10px] text-stone-400 mt-2">{tenant.slug}.canopystudio.io</div>
        <span className="inline-block mt-2 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-stone-100">
          {tenant.subscription_status}
        </span>

        <nav className="mt-6 space-y-0.5">
          {nav.map(n => (
            <Link key={n.href} href={n.href}
              className="block text-sm px-3 py-2 rounded-lg text-stone-700 hover:bg-stone-100">
              {n.label}
            </Link>
          ))}
        </nav>

        <form action="/api/sign-out" method="post" className="mt-8">
          <button className="text-xs text-stone-500 hover:text-stone-900">Sign out</button>
        </form>
      </aside>
      <main className="p-8 max-w-5xl">{children}</main>
    </div>
  );
}
