import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { isPlatformHost } from '@/lib/host';
import { MarketingPage } from '@/components/marketing/MarketingPage';

export default async function Home() {
  const h = await headers();
  const host = h.get('host') ?? '';
  if (!isPlatformHost(host)) redirect('/showroom');
  return <MarketingPage />;
}
