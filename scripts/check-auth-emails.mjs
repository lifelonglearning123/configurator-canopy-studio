// Verifies the magic-link and password-reset flows end-to-end without sending
// a real email. Usage: node scripts/check-auth-emails.mjs <email>
//
// What it does for both flows:
//   1. Calls supabase admin generateLink to get a hashed_token.
//   2. Builds the same /auth/confirm URL the app would email.
//   3. Calls supabase.auth.verifyOtp({ token_hash, type }) to prove the token
//      actually validates — which is the exact thing /auth/confirm does on
//      click. A real click would also set session cookies and redirect.

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

// Load .env.local manually (next loads it automatically, scripts don't).
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

if (!url || !service) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/check-auth-emails.mjs <email>');
  process.exit(1);
}

const supa = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

async function check(type, nextPath) {
  console.log(`\n--- ${type} ---`);
  const { data, error } = await supa.auth.admin.generateLink({ type, email });
  if (error) {
    console.error(`generateLink failed: ${error.message}`);
    return;
  }
  const hashed = data?.properties?.hashed_token;
  if (!hashed) {
    console.error('No hashed_token in response');
    return;
  }
  const u = new URL('/auth/confirm', appUrl);
  u.searchParams.set('token_hash', hashed);
  u.searchParams.set('type', type);
  u.searchParams.set('next', nextPath);
  console.log(`✓ generateLink ok`);
  console.log(`  email_otp:     ${data.properties.email_otp}`);
  console.log(`  link the user would receive:`);
  console.log(`  ${u.toString()}`);

  // Verify the token actually works. This consumes it, so each run needs to
  // generate fresh tokens — that's why we do generate+verify together.
  const { data: vData, error: vErr } = await supa.auth.verifyOtp({ token_hash: hashed, type });
  if (vErr) {
    console.error(`✗ verifyOtp failed: ${vErr.message}`);
    return;
  }
  console.log(`✓ verifyOtp ok — session would be set for ${vData.user?.email}`);
}

console.log(`Email: ${email}`);
console.log(`App URL: ${appUrl}`);

// userExists check (same as auth-email.ts).
const r = await fetch(`${url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
  headers: { apikey: service, Authorization: `Bearer ${service}` },
});
const j = await r.json();
const exists = (j.users ?? []).some(u => (u.email ?? '').toLowerCase() === email.toLowerCase());
console.log(`User exists: ${exists}`);
if (!exists) {
  console.error('Auth user not found — sendMagicLinkEmail/sendResetPasswordEmail would silently no-op.');
  process.exit(1);
}

await check('magiclink', '/post-sign-in');
await check('recovery', '/auth/reset-password');
