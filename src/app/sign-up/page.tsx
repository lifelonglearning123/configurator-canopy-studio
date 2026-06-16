'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserClient } from '@/lib/supabase-browser';

export default function SignUpPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get('email'));
    const password = String(fd.get('password'));
    const company = String(fd.get('company'));
    const slug = String(fd.get('slug')).toLowerCase().replace(/[^a-z0-9-]/g, '-');

    const supa = browserClient();
    const { data, error: signErr } = await supa.auth.signUp({ email, password });
    if (signErr || !data.user) {
      setError(signErr?.message ?? 'Sign-up failed');
      setBusy(false);
      return;
    }

    // Provision the tenant + Stripe Checkout in one server call.
    const r = await fetch('/api/onboarding/provision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ company, slug, email }),
    });
    const body = await r.json();
    if (!r.ok || !body.checkout_url) {
      setError(body.error ?? 'Provisioning failed');
      setBusy(false);
      return;
    }
    router.push(body.checkout_url);
  }

  return (
    <main className="min-h-screen grid place-items-center bg-stone-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-stone-600 mt-1">£49/month. Cancel anytime.</p>

        <form onSubmit={onSubmit} className="space-y-3 mt-5">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-stone-600">Company name</span>
            <input required name="company" className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-900" placeholder="ACME Pergolas Ltd" />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-stone-600">Workspace URL</span>
            <div className="mt-1 flex items-center rounded-lg border border-stone-300 overflow-hidden focus-within:border-stone-900">
              <input required name="slug" className="flex-1 px-3 py-2 text-sm focus:outline-none" placeholder="acme" />
              <span className="px-3 py-2 text-xs text-stone-500 bg-stone-50 border-l border-stone-200">.canopystudio.io</span>
            </div>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-stone-600">Email</span>
            <input required type="email" name="email" className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-900" />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-stone-600">Password</span>
            <input required type="password" name="password" minLength={8} className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-900" />
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button disabled={busy} className="w-full px-4 py-2.5 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-black disabled:opacity-60">
            {busy ? 'Creating workspace…' : 'Continue to payment →'}
          </button>
        </form>
        <p className="text-xs text-stone-500 mt-4">
          Already have an account? <a className="underline" href="/sign-in">Sign in</a>
        </p>
      </div>
    </main>
  );
}
