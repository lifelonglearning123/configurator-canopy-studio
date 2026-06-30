import Link from 'next/link';
import { headers } from 'next/headers';
import { resolveTenantByHost } from '@/lib/tenant';
import { adminClient } from '@/lib/supabase-server';

export default async function Showroom() {
  const h = await headers();
  const tenant = await resolveTenantByHost(h.get('host') ?? '');
  if (!tenant) return null;

  const db = adminClient();
  const { data: items } = await db
    .from('tenant_products')
    .select('enabled, custom_name, custom_tagline, products(id, key, name, tagline)')
    .eq('tenant_id', tenant.id)
    .eq('enabled', true)
    .order('sort_order');

  const products = (items as { custom_name: string | null; custom_tagline: string | null; products: { key: string; name: string; tagline: string } }[] ?? [])
    .map(i => ({ key: i.products.key, name: i.custom_name ?? i.products.name, tagline: i.custom_tagline ?? i.products.tagline }));

  return (
    <main className="mx-auto max-w-[1280px] px-5 lg:px-7 py-16">
      <div className="max-w-2xl">
        <div className="text-[10px] uppercase tracking-[0.22em] text-stone-500 mb-3">Browse · Configure · Quote</div>
        <h1 className="text-5xl lg:text-6xl leading-[1.05] tracking-tight" style={{ fontFamily: 'serif' }}>
          Design your outdoor room, <em>in real time.</em>
        </h1>
        <p className="text-sm text-stone-600 mt-4 leading-relaxed max-w-lg">
          Pick a structure below, then shape every detail and watch your quote build as you go.
        </p>
      </div>

      {products.length === 0 ? (
        <p className="mt-10 text-sm text-stone-500">No products are currently available.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-12">
          {products.map(p => (
            <Link
              key={p.key}
              href={`/configure/${p.key}`}
              className="group bg-white rounded-2xl border border-stone-200 overflow-hidden transition hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="aspect-[3/2] bg-gradient-to-br from-stone-200 to-stone-300 overflow-hidden relative">
                {/* Real 3D snapshot from /public/products/<key>.jpg. All 15 are
                    committed in the repo; if a new product is added without a
                    snapshot, the gradient shows through behind a broken-image
                    icon — easy to spot. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/products/${p.key}.jpg`}
                  alt={p.name}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 w-full h-full object-cover transition group-hover:scale-[1.03]"
                />
              </div>
              <div className="p-5">
                <h3 className="text-2xl tracking-tight" style={{ fontFamily: 'serif' }}>{p.name}</h3>
                <p className="text-[11px] text-stone-500 mt-1 leading-relaxed">{p.tagline}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-stone-500">Starting from</span>
                  <span className="text-xs px-3 py-1.5 rounded-md border border-stone-300 group-hover:bg-stone-900 group-hover:text-white transition">
                    Configure →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
