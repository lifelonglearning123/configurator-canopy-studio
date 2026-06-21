// Public demo configurator. No tenant gate — anyone can land here from the
// marketing site's product range cards. Uses the in-code default pricing
// from `defaultPricingLineItems()` so prospects see a representative quote
// without needing a real tenant.
//
// The `demo` prop on ConfiguratorClient swaps the "Request quote" CTA for
// a sign-up call-to-action and shows a banner across the top.

import { adminClient } from '@/lib/supabase-server';
import { defaultPricingLineItems } from '@/lib/catalog';
import { ConfiguratorClient } from '@/components/configurator/ConfiguratorClient';
import { notFound } from 'next/navigation';

export default async function DemoConfigurePage({ params }: { params: Promise<{ productKey: string }> }) {
  const { productKey } = await params;

  const db = adminClient();
  const { data: product } = await db
    .from('products')
    .select('key, name, tagline, default_schema_json')
    .eq('key', productKey)
    .maybeSingle();

  if (!product) notFound();
  const p = product as { key: string; name: string; tagline: string; default_schema_json: Record<string, unknown> };

  const pricing = defaultPricingLineItems().map(r => ({ key: r.key, label: r.label, amountMinor: r.amountMinor }));

  return (
    <ConfiguratorClient
      tenantName="Demo"
      tenantSlug="demo"
      currency="GBP"
      productKey={p.key}
      productName={p.name}
      productTagline={p.tagline}
      defaultSchema={p.default_schema_json}
      pricing={pricing}
      demo
    />
  );
}
