import Link from 'next/link';

export default function CompletePage() {
  return (
    <main className="min-h-screen grid place-items-center bg-stone-50 px-4">
      <div className="max-w-md text-center bg-white border border-stone-200 rounded-2xl p-8 shadow-sm">
        <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 grid place-items-center mb-4">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M20 6 9 17l-5-5" stroke="#16a34a" strokeWidth="2.5" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">You're in.</h1>
        <p className="text-sm text-stone-600 mt-2">Your workspace is provisioned. Set up your catalog, branding, and GHL webhook next.</p>
        <Link href="/admin" className="inline-block mt-5 px-4 py-2.5 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-black">Open admin →</Link>
      </div>
    </main>
  );
}
