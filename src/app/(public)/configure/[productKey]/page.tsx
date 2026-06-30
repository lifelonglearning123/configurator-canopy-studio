import { headers } from 'next/headers';
import { resolveTenantByHost } from '@/lib/tenant';
import { adminClient } from '@/lib/supabase-server';
import { loadTenantPricing } from '@/lib/pricing-server';
import { ConfiguratorClient } from '@/components/configurator/ConfiguratorClient';
import { notFound } from 'next/navigation';

export default async function ConfigurePage({ params }: { params: Promise<{ productKey: string }> }) {
  const { productKey } = await params;
  const h = await headers();
  const tenant = await resolveTenantByHost(h.get('host') ?? '');
  if (!tenant) notFound();

  const db = adminClient();
  // Verify this tenant offers this product.
  // The `!inner` on products() turns the join into INNER, so the products.key
  // filter actually narrows the parent rows (a plain left join would return
  // all tenant_products with products nulled-out on non-matching rows, which
  // makes .maybeSingle() throw because >1 row comes back).
  const { data: tp } = await db
    .from('tenant_products')
    .select('enabled, custom_name, custom_tagline, products!inner(key, name, tagline, default_schema_json)')
    .eq('tenant_id', tenant.id)
    .eq('products.key', productKey)
    .maybeSingle();

  if (!tp || !(tp as { enabled: boolean }).enabled) notFound();
  const link = tp as { custom_name: string | null; custom_tagline: string | null; products: { key: string; name: string; tagline: string; default_schema_json: Record<string, unknown> } };

  const pricingMap = await loadTenantPricing(tenant.id);
  // Serialize the Map to an array for client transfer
  const pricing = Array.from(pricingMap.entries()).map(([k, v]) => ({ key: k, label: v.label, amountMinor: v.amountMinor }));

  return (
    <ConfiguratorClient
      tenantName={tenant.name}
      tenantSlug={tenant.slug}
      currency={tenant.currency}
      productKey={productKey}
      productName={link.custom_name ?? link.products.name}
      productTagline={link.custom_tagline ?? link.products.tagline}
      defaultSchema={link.products.default_schema_json}
      pricing={pricing}
    />
  );
}
