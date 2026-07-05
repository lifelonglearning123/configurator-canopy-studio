// TEMPORARY — dev-only route for visually verifying the 3D scene while the
// Supabase project is unreachable (DB-backed /demo/configure/* routes 404).
// Usage: /dev-scene            → veranda
//        /dev-scene?p=extension
//        /dev-scene?p=conservatory-leanto (or -victorian, -edwardian, -orangery)
// Safe to delete.
import { defaultPricingLineItems } from '@/lib/catalog';
import { defaultMatrixFor } from '@/lib/price-matrix';
import { ConfiguratorClient } from '@/components/configurator/ConfiguratorClient';

export default async function DevScenePage({ searchParams }: { searchParams: Promise<{ p?: string; gate?: string }> }) {
  const { p, gate } = await searchParams;
  const key = p ?? 'veranda';
  const schema: Record<string, unknown> =
    key === 'extension' ? { scene: 'extension' } :
    key.startsWith('conservatory-') ? { scene: key, structure: 'wallmounted' } :
    key === 'carport-premium' ? { structure: 'freestanding', roof: 'solid-alu', scene: 'car' } :
    key === 'pergola' ? { structure: 'freestanding', roof: 'louvred-retract' } :
    key === 'carport' ? { structure: 'freestanding', roof: 'poly-sloped', scene: 'car' } :
    key === 'studio' ? { structure: 'freestanding', roof: 'glass-flat' } :
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
      priceMatrix={defaultMatrixFor(key)}
      demo={gate !== '1'} // ?gate=1 exercises the tenant-mode lead gate locally
    />
  );
}
