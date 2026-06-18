'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserClient } from '@/lib/supabase-browser';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Reached via /auth/callback, which exchanges the code and sets the session cookie.
    // Confirm we actually have a session before showing the form.
    browserClient().auth.getUser().then(({ data }) => {
      if (!data.user) {
        setError('This reset link is invalid or has expired. Request a new one.');
      }
      setReady(true);
    });
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get('password'));
    const confirm = String(fd.get('confirm'));
    if (password.length < 8) { setError('Password must be at least 8 characters.'); setBusy(false); return; }
    if (password !== confirm) { setError('Passwords do not match.'); setBusy(false); return; }
    const { error: err } = await browserClient().auth.updateUser({ password });
    if (err) { setError(err.message); setBusy(false); return; }
    router.push('/admin');
  }

  return (
    <main className="min-h-screen grid place-items-center bg-stone-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
        {!ready ? (
          <p className="text-sm text-stone-500 mt-4">Checking link…</p>
        ) : error && !busy ? (
          <>
            <p className="text-sm text-red-600 mt-3">{error}</p>
            <a href="/forgot-password" className="inline-block mt-4 text-sm underline">Request a new link</a>
          </>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3 mt-5">
            <input required type="password" name="password" placeholder="New password" minLength={8} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-900" />
            <input required type="password" name="confirm" placeholder="Confirm new password" minLength={8} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-900" />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button disabled={busy} className="w-full px-4 py-2.5 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-black disabled:opacity-60">
              {busy ? 'Updating…' : 'Update password →'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
