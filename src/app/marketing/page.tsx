import { MarketingPage } from '@/components/marketing/MarketingPage';
import { adminClient } from '@/lib/supabase-server';
import { MARKETING_PRODUCTS } from '@/lib/marketing-products';

export default async function Marketing() {
  let products: { key: string; name: string; tagline: string }[] = MARKETING_PRODUCTS;
  try {
    const db = adminClient();
    const { data } = await db.from('products').select('key, name, tagline').order('name');
    const fromDb = (data as { key: string; name: string; tagline: string }[] | null) ?? [];
    if (fromDb.length > 0) products = fromDb;
  } catch {
    // Keep the static fallback.
  }
  return <MarketingPage products={products} />;
}
