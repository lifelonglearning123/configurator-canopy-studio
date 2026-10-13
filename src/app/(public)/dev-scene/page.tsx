// TEMPORARY — dev-only route for visually verifying the 3D scene while the
// Supabase project is unreachable (DB-backed /demo/configure/* routes 404).
// Usage: /dev-scene            → veranda
//        /dev-scene?p=extension
//        /dev-scene?p=conservatory-leanto (or -victorian, -edwardian, -orangery)
//        /dev-scene?roof=fabric-retract  → override the roof system
//        /dev-scene?mode=simple          → preview simple pricing (band = whole guide price)
//        /dev-scene?drop=wall.sliding,addon.  → strip pricing rows by key prefix, to
//                                          preview how the panel hides switched-off options
//        /dev-scene?q=high|medium|low    → pin the rendering quality tier (default: auto)
// Safe to delete.
import { defaultPricingLineItems } from '@/lib/catalog';
import { defaultMatrixFor } from '@/lib/price-matrix';
import { productSchema } from '@/lib/product-schemas';
import { ConfiguratorClient } from '@/components/configurator/ConfiguratorClient';

export default async function DevScenePage({ searchParams }: { searchParams: Promise<{ p?: string; gate?: string; roof?: string; mode?: string; drop?: string; q?: string }> }) {
  const { p, gate, roof, mode, drop, q } = await searchParams;
  const quality = q === 'high' || q === 'medium' || q === 'low' ? q : 'auto';
  const key = p ?? 'veranda';
  const schema: Record<string, unknown> = productSchema(key);
  if (roof) schema.roof = roof;
  const dropPrefixes = (drop ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const pricing = defaultPricingLineItems()
    .filter(r => !dropPrefixes.some(pre => r.key.startsWith(pre)))
    .map(r => ({ key: r.key, label: r.label, amountMinor: r.amountMinor }));
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
      pricingMode={mode === 'simple' ? 'simple' : 'detailed'}
      demo={gate !== '1'} // ?gate=1 exercises the tenant-mode lead gate locally
      quality={quality}
    />
  );
}
