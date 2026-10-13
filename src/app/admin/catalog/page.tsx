import { requireSessionTenant } from '@/lib/session';
import { adminClient } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import { presetFor } from '@/lib/presets';

export default async function CatalogPage() {
  const { tenant } = await requireSessionTenant();
  const db = adminClient();

  const { data: catalog } = await db
    .from('products')
    .select('id, key, name, tagline')
    .order('name');

  const { data: enabled } = await db
    .from('tenant_products')
    .select('product_id, enabled, custom_name, custom_tagline')
    .eq('tenant_id', tenant.id);

  const enabledMap = new Map(
    (enabled as { product_id: string; enabled: boolean; custom_name: string | null; custom_tagline: string | null }[] ?? []).map(e => [e.product_id, e])
  );

  async function toggle(formData: FormData) {
    'use server';
    const { tenant } = await requireSessionTenant();
    const productId = String(formData.get('product_id'));
    const next = formData.get('enabled') === 'on';
    // Blank fields fall back to the catalog's own name and description.
    const text = (k: string, max: number) => {
      const v = String(formData.get(k) ?? '').trim().slice(0, max);
      return v || null;
    };
    const db = adminClient();
    await db.from('tenant_products').upsert({
      tenant_id: tenant.id, product_id: productId, enabled: next,
      custom_name: text('custom_name', 80), custom_tagline: text('custom_tagline', 200),
    }, { onConflict: 'tenant_id,product_id' });
    revalidatePath('/showroom');
    revalidatePath('/admin/catalog');
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Catalog</h1>
        <p className="text-sm text-stone-600">Choose which structures you offer, and name them the way you sell them. Leave a name blank to use the standard one.</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        {(catalog as { id: string; key: string; name: string; tagline: string }[] ?? []).map(p => {
          const tp = enabledMap.get(p.id);
          const isOn = tp?.enabled ?? false;
          return (
            <form key={p.id} action={toggle} className="flex items-start justify-between gap-4 bg-white border border-stone-200 rounded-xl p-4">
              <div className="flex-1 min-w-0 space-y-1.5">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wider text-stone-500">Name shown to customers</span>
                  <input name="custom_name" defaultValue={tp?.custom_name ?? ''} placeholder={p.name} maxLength={80}
                    className="mt-0.5 w-full px-2.5 py-1.5 rounded-md border border-stone-300 text-sm font-medium focus:outline-none focus:border-stone-900" />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wider text-stone-500">Description</span>
                  <input name="custom_tagline" defaultValue={tp?.custom_tagline ?? ''} placeholder={p.tagline} maxLength={200}
                    className="mt-0.5 w-full px-2.5 py-1.5 rounded-md border border-stone-300 text-xs focus:outline-none focus:border-stone-900" />
                </label>
                <div className="text-[10px] uppercase tracking-wider text-stone-400">{p.key}</div>
                {presetFor(p.key) && (
                  <div className="text-[11px] text-stone-500 mt-1">Size-only version · priced from <span className="font-mono">{presetFor(p.key)!.baseProduct}</span> in Pricing</div>
                )}
              </div>
              <input type="hidden" name="product_id" value={p.id} />
              <div className="flex flex-col items-end gap-2 shrink-0">
                <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" name="enabled" defaultChecked={isOn} className="w-4 h-4 accent-stone-900" />
                  Offered
                </label>
                <button className="px-3 py-1.5 rounded-md border border-stone-300 text-xs hover:bg-stone-100">Save</button>
              </div>
            </form>
          );
        })}
      </div>
    </div>
  );
}
