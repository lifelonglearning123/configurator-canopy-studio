import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { isPlatformHost } from '@/lib/host';
import { MarketingPage } from '@/components/marketing/MarketingPage';
import { adminClient } from '@/lib/supabase-server';
import { MARKETING_PRODUCTS } from '@/lib/marketing-products';

export default async function Home() {
  const h = await headers();
  const host = h.get('host') ?? '';
  if (!isPlatformHost(host)) redirect('/showroom');

  // Try the DB first, but fall back to the hard-coded list so the marketing
  // page always shows the full range — even if the deployed Supabase isn't
  // reachable or hasn't been seeded yet.
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
