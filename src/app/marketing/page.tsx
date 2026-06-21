import { MarketingPage } from '@/components/marketing/MarketingPage';
import { adminClient } from '@/lib/supabase-server';

export default async function Marketing() {
  const db = adminClient();
  const { data } = await db.from('products').select('key, name, tagline').order('name');
  const products = (data as { key: string; name: string; tagline: string }[] | null) ?? [];
  return <MarketingPage products={products} />;
}
