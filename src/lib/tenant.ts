import { adminClient } from './supabase-server';
import { env } from './env';
import { isPlatformHost } from './host';

export { isPlatformHost };

export type Tenant = {
  id: string;
  slug: string;
  name: string;
  currency: string;
  logo_url: string | null;
  primary_color: string | null;
  subscription_status: string;
  status: string;
};

// Resolve a tenant by Host header. Two resolution strategies:
//   1. Custom domain match (tenant_domains.hostname)
//   2. Subdomain of root (slug.canopystudio.io)
export async function resolveTenantByHost(host: string): Promise<Tenant | null> {
  if (!host || isPlatformHost(host)) return null;
  const clean = host.split(':')[0].toLowerCase();
  const root = env.rootDomain();
  const db = adminClient();

  // (1) custom domain
  const { data: dom } = await db
    .from('tenant_domains')
    .select('tenant_id, verified_at')
    .eq('hostname', clean)
    .maybeSingle();

  let tenantId: string | undefined;
  if (dom?.verified_at) tenantId = (dom as { tenant_id: string }).tenant_id;

  // (2) subdomain of root
  if (!tenantId && clean.endsWith(`.${root}`)) {
    const slug = clean.slice(0, -1 * (root.length + 1));
    const { data } = await db.from('tenants').select('id').eq('slug', slug).maybeSingle();
    if (data) tenantId = (data as { id: string }).id;
  }

  if (!tenantId) return null;

  const { data: t } = await db
    .from('tenants')
    .select('id, slug, name, currency, logo_url, primary_color, subscription_status, status')
    .eq('id', tenantId)
    .maybeSingle();
  return (t as Tenant | null) ?? null;
}
