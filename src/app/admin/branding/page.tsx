import { requireSessionTenant } from '@/lib/session';
import { adminClient } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';

const CURRENCIES = ['GBP', 'EUR', 'USD', 'AUD', 'CAD', 'NZD', 'SEK', 'NOK', 'DKK', 'CHF', 'PLN', 'CZK', 'HUF'];

export default async function BrandingPage() {
  const { tenant } = await requireSessionTenant();
  const db = adminClient();
  const { data } = await db.from('tenants').select('name, logo_url, primary_color, currency').eq('id', tenant.id).maybeSingle();
  const t = (data as { name: string; logo_url: string | null; primary_color: string | null; currency: string } | null) ?? { name: '', logo_url: null, primary_color: '#1c1917', currency: 'GBP' };

  async function save(formData: FormData) {
    'use server';
    const { tenant } = await requireSessionTenant();
    const db = adminClient();
    await db.from('tenants').update({
      name: String(formData.get('name')),
      logo_url: String(formData.get('logo_url') ?? '') || null,
      primary_color: String(formData.get('primary_color')) || '#1c1917',
      currency: String(formData.get('currency')),
    }).eq('id', tenant.id);
    revalidatePath('/admin/branding');
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Branding</h1>
        <p className="text-sm text-stone-600">Customer-facing identity for your configurator.</p>
      </header>

      <form action={save} className="bg-white border border-stone-200 rounded-xl p-6 space-y-4 max-w-xl">
        <Field name="name" label="Company name" defaultValue={t.name} />
        <Field name="logo_url" label="Logo URL (PNG/SVG, transparent background)" defaultValue={t.logo_url ?? ''} placeholder="https://…" />
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-stone-600">Primary color</span>
            <input name="primary_color" type="color" defaultValue={t.primary_color ?? '#1c1917'} className="mt-1 w-full h-10 rounded-lg border border-stone-300 cursor-pointer" />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-stone-600">Currency</span>
            <select name="currency" defaultValue={t.currency} className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-900">
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <button className="px-4 py-2.5 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-black">Save changes</button>
      </form>
    </div>
  );
}

function Field({ name, label, defaultValue, placeholder }: { name: string; label: string; defaultValue?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-stone-600">{label}</span>
      <input name={name} defaultValue={defaultValue} placeholder={placeholder} className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-900" />
    </label>
  );
}
