import { requireSessionTenant } from '@/lib/session';
import { adminClient } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';

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
    const db = adminClient();
    await db.from('tenant_products').upsert({ tenant_id: tenant.id, product_id: productId, enabled: next }, { onConflict: 'tenant_id,product_id' });
    revalidatePath('/admin/catalog');
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Catalog</h1>
        <p className="text-sm text-stone-600">Choose which structures you offer.</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        {(catalog as { id: string; key: string; name: string; tagline: string }[] ?? []).map(p => {
          const tp = enabledMap.get(p.id);
          const isOn = tp?.enabled ?? false;
          return (
            <form key={p.id} action={toggle} className="flex items-center justify-between bg-white border border-stone-200 rounded-xl p-4">
              <div>
                <div className="font-medium text-sm">{tp?.custom_name ?? p.name}</div>
                <div className="text-xs text-stone-500 mt-0.5">{tp?.custom_tagline ?? p.tagline}</div>
                <div className="text-[10px] uppercase tracking-wider text-stone-400 mt-1.5">{p.key}</div>
              </div>
              <input type="hidden" name="product_id" value={p.id} />
              <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" name="enabled" defaultChecked={isOn} className="w-4 h-4 accent-stone-900" />
                <button className="px-3 py-1.5 rounded-md border border-stone-300 text-xs hover:bg-stone-100">Save</button>
              </label>
            </form>
          );
        })}
      </div>
    </div>
  );
}
