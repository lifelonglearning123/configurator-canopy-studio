import { redirect } from 'next/navigation';
import { serverClient, adminClient } from './supabase-server';

export type SessionTenant = {
  id: string;
  slug: string;
  name: string;
  currency: string;
  primary_color: string | null;
  ghl_webhook_url: string | null;
  subscription_status: string;
};

// Resolve the signed-in user and their tenant in one shot. Redirects to
// /sign-in if not authenticated, or to /sign-up if the user has no tenant.
export async function requireSessionTenant(): Promise<{ userId: string; tenant: SessionTenant }> {
  const supa = await serverClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) redirect('/sign-in');

  const db = adminClient();
  const { data } = await db
    .from('tenant_users')
    .select('tenant_id, tenants(id, slug, name, currency, primary_color, ghl_webhook_url, subscription_status)')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data) redirect('/sign-up');
  return { userId: user.id, tenant: (data as { tenants: SessionTenant }).tenants };
}
