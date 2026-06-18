'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { browserClient } from '@/lib/supabase-browser';

function SignInForm() {
  const router = useRouter();
  const search = useSearchParams();
  const initialError = search.get('error');
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [magicSent, setMagicSent] = useState(false);

  async function onPasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
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
    router.push('/post-sign-in');
  }

  async function onMagicSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get('email'));
    const r = await fetch('/api/auth/magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error || 'Could not send link. Try again.');
      setBusy(false);
      return;
    }
    setMagicSent(true);
    setBusy(false);
  }

  function switchMode(next: 'password' | 'magic') {
    setMode(next);
    setError(null);
    setMagicSent(false);
  }

  return (
    <main className="min-h-screen grid place-items-center bg-stone-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>

        {mode === 'password' ? (
          <>
            <form onSubmit={onPasswordSubmit} className="space-y-3 mt-5">
              <input required type="email" name="email" placeholder="Email" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-900" />
              <input required type="password" name="password" placeholder="Password" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-900" />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button disabled={busy} className="w-full px-4 py-2.5 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-black disabled:opacity-60">
                {busy ? 'Signing in…' : 'Sign in →'}
              </button>
            </form>
            <div className="flex items-center justify-between text-xs text-stone-500 mt-4">
              <button type="button" onClick={() => switchMode('magic')} className="underline">Email me a magic link instead</button>
              <a href="/forgot-password" className="underline">Forgot password?</a>
            </div>
          </>
        ) : magicSent ? (
          <>
            <p className="text-sm text-stone-600 mt-4">
              Check your inbox — we sent a one-time sign-in link. It expires in an hour.
            </p>
            <button type="button" onClick={() => switchMode('password')} className="mt-4 text-xs text-stone-500 underline">
              Use password instead
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-stone-600 mt-2">We'll email you a one-time sign-in link. No password needed.</p>
            <form onSubmit={onMagicSubmit} className="space-y-3 mt-5">
              <input required type="email" name="email" placeholder="Email" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-900" />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button disabled={busy} className="w-full px-4 py-2.5 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-black disabled:opacity-60">
                {busy ? 'Sending…' : 'Send magic link →'}
              </button>
            </form>
            <button type="button" onClick={() => switchMode('password')} className="mt-4 text-xs text-stone-500 underline">
              Use password instead
            </button>
          </>
        )}

        <p className="text-xs text-stone-500 mt-6">
          No account? <a className="underline" href="/sign-up">Sign up</a>
        </p>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
