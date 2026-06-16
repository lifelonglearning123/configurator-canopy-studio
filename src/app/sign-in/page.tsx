'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserClient } from '@/lib/supabase-browser';

export default function SignInPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const supa = browserClient();
    const { error: err } = await supa.auth.signInWithPassword({
      email: String(fd.get('email')),
      password: String(fd.get('password')),
    });
    if (err) { setError(err.message); setBusy(false); return; }
    router.push('/admin');
  }

  return (
    <main className="min-h-screen grid place-items-center bg-stone-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <form onSubmit={onSubmit} className="space-y-3 mt-5">
          <input required type="email" name="email" placeholder="Email" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-900" />
          <input required type="password" name="password" placeholder="Password" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-900" />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button disabled={busy} className="w-full px-4 py-2.5 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-black disabled:opacity-60">
            {busy ? 'Signing in…' : 'Sign in →'}
          </button>
        </form>
        <p className="text-xs text-stone-500 mt-4">
          No account? <a className="underline" href="/sign-up">Sign up</a>
        </p>
      </div>
    </main>
  );
}
