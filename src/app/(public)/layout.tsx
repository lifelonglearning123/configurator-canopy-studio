import { resolveTenantByHost, isPlatformHost } from '@/lib/tenant';
import { headers } from 'next/headers';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const host = h.get('host') ?? '';

  // Platform host (canopystudio.io / localhost without subdomain): show marketing/sign-up
  if (isPlatformHost(host)) {
    return <>{children}</>;
  }

  const tenant = await resolveTenantByHost(host);
  if (!tenant) {
    return (
      <main className="min-h-screen grid place-items-center bg-stone-50 px-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Workspace not found</h1>
          <p className="text-sm text-stone-600 mt-2">
            No tenant matches <code>{host}</code>. If you own this domain, finish setting it up in your admin under <em>Custom domain</em>.
          </p>
        </div>
      </main>
    );
  }
  if (tenant.status !== 'active') {
    return (
      <main className="min-h-screen grid place-items-center bg-stone-50 px-6 text-center">
        <h1 className="text-2xl font-semibold">This configurator is paused</h1>
        <p className="text-sm text-stone-600 mt-2">The workspace owner has suspended access. Please check back later.</p>
      </main>
    );
  }

  return (
    <div style={{ ['--brand' as string]: tenant.primary_color ?? '#1c1917' }}>
      <header className="border-b border-stone-200 bg-white px-5 lg:px-7 h-14 flex items-center gap-3">
        {tenant.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tenant.logo_url} alt={tenant.name} className="h-8" />
        ) : (
          <div className="w-7 h-7 rounded-md grid place-items-center text-white text-xs font-bold" style={{ background: 'var(--brand)' }}>
            {tenant.name[0]}
          </div>
        )}
        <div className="font-semibold tracking-tight text-[15px]">{tenant.name}</div>
      </header>
      {children}
    </div>
  );
}
