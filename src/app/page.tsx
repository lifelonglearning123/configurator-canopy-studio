import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { isPlatformHost } from '@/lib/host';
import { MarketingPage } from '@/components/marketing/MarketingPage';
import { adminClient } from '@/lib/supabase-server';

export default async function Home() {
  const h = await headers();
  const host = h.get('host') ?? '';
  if (!isPlatformHost(host)) redirect('/showroom');

  const db = adminClient();
  const { data } = await db.from('products').select('key, name, tagline').order('name');
  const products = (data as { key: string; name: string; tagline: string }[] | null) ?? [];

  return <MarketingPage products={products} />;
}
