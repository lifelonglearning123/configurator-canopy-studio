import 'server-only';
import { adminClient } from './supabase-server';
import { priceMatrixSchema, type PriceMatrix } from './price-matrix';

// Seller's size-band grid for one product, or null (→ formula pricing only).
// Invalid/legacy grid JSON is treated as absent rather than breaking quotes.
export async function loadTenantPriceMatrix(tenantId: string, productKey: string): Promise<PriceMatrix | null> {
  const db = adminClient();
  const { data, error } = await db
    .from('price_matrices')
    .select('grid, enabled')
    .eq('tenant_id', tenantId)
    .eq('product_key', productKey)
    .maybeSingle();
  if (error || !data || !(data as { enabled: boolean }).enabled) return null;
  const parsed = priceMatrixSchema.safeParse((data as { grid: unknown }).grid);
  return parsed.success ? parsed.data : null;
}

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
