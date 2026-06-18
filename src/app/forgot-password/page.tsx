'use client';

import { useState } from 'react';

export default function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get('email'));
    const r = await fetch('/api/auth/reset-password', {
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
    setSent(true);
    setBusy(false);
  }

  return (
    <main className="min-h-screen grid place-items-center bg-stone-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        {sent ? (
          <p className="text-sm text-stone-600 mt-4">
            If an account exists for that email, a reset link is on its way. Check your inbox (and spam).
          </p>
        ) : (
          <>
            <p className="text-sm text-stone-600 mt-2">We'll email you a link to set a new password.</p>
            <form onSubmit={onSubmit} className="space-y-3 mt-5">
              <input required type="email" name="email" placeholder="Email" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-900" />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button disabled={busy} className="w-full px-4 py-2.5 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-black disabled:opacity-60">
                {busy ? 'Sending…' : 'Send reset link →'}
              </button>
            </form>
          </>
        )}
        <p className="text-xs text-stone-500 mt-4">
          Remembered it? <a className="underline" href="/sign-in">Back to sign in</a>
        </p>
      </div>
    </main>
  );
}
