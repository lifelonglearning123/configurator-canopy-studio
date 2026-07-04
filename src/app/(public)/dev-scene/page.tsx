// TEMPORARY — dev-only route for visually verifying the 3D scene while the
// Supabase project is unreachable (DB-backed /demo/configure/* routes 404).
// Usage: /dev-scene            → veranda
//        /dev-scene?p=extension
//        /dev-scene?p=conservatory-leanto (or -victorian, -edwardian, -orangery)
// Safe to delete.
import { defaultPricingLineItems } from '@/lib/catalog';
import { defaultVerandaMatrix } from '@/lib/price-matrix';
import { ConfiguratorClient } from '@/components/configurator/ConfiguratorClient';

export default async function DevScenePage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const key = p ?? 'veranda';
  const schema: Record<string, unknown> =
    key === 'extension' ? { scene: 'extension' } :
    key.startsWith('conservatory-') ? { scene: key, structure: 'wallmounted' } :
    key === 'carport-premium' ? { structure: 'freestanding', roof: 'solid-alu', scene: 'car' } :
    { structure: 'wallmounted', roof: 'glass-sloped' };
  const pricing = defaultPricingLineItems().map(r => ({ key: r.key, label: r.label, amountMinor: r.amountMinor }));
  return (
    <ConfiguratorClient
      tenantName="Dev"
      tenantSlug="dev"
      currency="GBP"
      productKey={key}
      productName={`Dev: ${key}`}
      productTagline="Dev preview"
      defaultSchema={schema}
      pricing={pricing}
      priceMatrix={key === 'veranda' ? defaultVerandaMatrix() : null}
      demo
    />
  );
}
