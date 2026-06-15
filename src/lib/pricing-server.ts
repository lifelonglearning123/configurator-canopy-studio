import 'server-only';
import { adminClient } from './supabase-server';

export async function loadTenantPricing(tenantId: string): Promise<Map<string, { label: string; amountMinor: number }>> {
  const db = adminClient();
  const { data, error } = await db
    .from('pricing_rules')
    .select('line_item_key, label, amount_minor, enabled')
    .eq('tenant_id', tenantId)
    .eq('enabled', true);
  if (error) throw error;
  const map = new Map<string, { label: string; amountMinor: number }>();
  for (const r of data ?? []) {
    map.set(r.line_item_key, { label: r.label, amountMinor: r.amount_minor });
  }
  return map;
}
