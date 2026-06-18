import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/super-admin';

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireSuperAdmin();

  const nav = [
    { href: '/super-admin',         label: 'Tenants' },
    { href: '/super-admin/create',  label: 'Create tenant' },
    { href: '/super-admin/metrics', label: 'Metrics' },
  ];

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 grid grid-cols-[240px_1fr]">
      <aside className="border-r border-stone-200 bg-white p-5">
        <div className="font-semibold tracking-tight">Canopy Studio</div>
        <div className="text-xs text-stone-500 mt-0.5">Platform admin</div>
        <span className="inline-block mt-2 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
          super-admin
        </span>
        <div className="text-[10px] text-stone-400 mt-3 break-all">{admin.email}</div>

        <nav className="mt-6 space-y-0.5">
          {nav.map(n => (
            <Link key={n.href} href={n.href}
              className="block text-sm px-3 py-2 rounded-lg text-stone-700 hover:bg-stone-100">
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="mt-8 space-y-2">
          <Link href="/admin" className="block text-xs text-stone-500 hover:text-stone-900">
            ← Back to my tenant
          </Link>
          <form action="/api/sign-out" method="post">
            <button className="text-xs text-stone-500 hover:text-stone-900">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="p-8 max-w-6xl">{children}</main>
    </div>
  );
}
