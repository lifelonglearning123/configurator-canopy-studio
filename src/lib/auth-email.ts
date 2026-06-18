// Generates Supabase auth links (magic-link, password recovery) via the admin
// API — which does NOT trigger Supabase's own email — and ships them through
// the platform GHL instance. Pre-checks user existence so unknown emails are a
// silent no-op (avoids account enumeration).

import { adminClient } from './supabase-server';
import { env } from './env';
import { sendPlatformEmail } from './platform-ghl';

async function userExists(email: string): Promise<boolean> {
  try {
    const r = await fetch(
      `${env.supabaseUrl()}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
      {
        headers: {
          apikey: env.supabaseService(),
          Authorization: `Bearer ${env.supabaseService()}`,
        },
      },
    );
    if (!r.ok) return false;
    const data = (await r.json()) as { users?: Array<{ email?: string | null }> };
    return (data.users ?? []).some(u => (u.email ?? '').toLowerCase() === email.toLowerCase());
  } catch {
    return false;
  }
}

async function generateLink(type: 'magiclink' | 'recovery', email: string, next: string): Promise<string | null> {
  const supa = adminClient();
  // We don't use `redirectTo` for navigation: Supabase's action_link routes through
  // `/auth/v1/verify` and bounces back with a PKCE `code` we can't exchange (the
  // verifier was never stored in the user's browser). Instead we take the
  // `hashed_token` and build our own confirm URL that uses `verifyOtp` directly.
  const { data, error } = await supa.auth.admin.generateLink({ type, email });
  if (error || !data?.properties?.hashed_token) {
    console.error(`[auth-email] generateLink(${type}) failed`, error?.message);
    return null;
  }
  const u = new URL('/auth/confirm', env.appUrl());
  u.searchParams.set('token_hash', data.properties.hashed_token);
  u.searchParams.set('type', type);
  u.searchParams.set('next', next);
  return u.toString();
}

export async function sendMagicLinkEmail(email: string, next = '/admin'): Promise<void> {
  if (!(await userExists(email))) return;
  const link = await generateLink('magiclink', email, next);
  if (!link) return;
  await sendPlatformEmail({
    email,
    subject: 'Your Canopy Studio sign-in link',
    html: magicLinkHtml(link),
  });
}

export async function sendResetPasswordEmail(email: string): Promise<void> {
  if (!(await userExists(email))) return;
  const link = await generateLink('recovery', email, '/auth/reset-password');
  if (!link) return;
  await sendPlatformEmail({
    email,
    subject: 'Reset your Canopy Studio password',
    html: resetPasswordHtml(link),
  });
}

function magicLinkHtml(link: string): string {
  return baseEmail({
    heading: 'Sign in to Canopy Studio',
    body: "Click the button to sign in. The link expires in 1 hour and can only be used once.",
    cta: 'Sign in',
    link,
  });
}

function resetPasswordHtml(link: string): string {
  return baseEmail({
    heading: 'Reset your password',
    body: "Click the button to set a new password. The link expires in 1 hour and can only be used once.",
    cta: 'Reset password',
    link,
  });
}

function baseEmail(input: { heading: string; body: string; cta: string; link: string }): string {
  return `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1c1917;background:#fafaf9;margin:0;padding:32px 16px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e7e5e4;border-radius:16px;padding:32px">
    <h1 style="font-size:20px;margin:0 0 12px;font-weight:600;letter-spacing:-0.01em">${input.heading}</h1>
    <p style="font-size:14px;line-height:1.55;color:#44403c;margin:0 0 24px">${input.body}</p>
    <p style="margin:0 0 24px"><a href="${input.link}" style="display:inline-block;background:#1c1917;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:500">${input.cta} &rarr;</a></p>
    <p style="font-size:12px;color:#78716c;margin:0 0 8px">If the button doesn't work, paste this link into your browser:</p>
    <p style="font-size:12px;margin:0 0 24px"><a href="${input.link}" style="color:#78716c;word-break:break-all">${input.link}</a></p>
    <p style="font-size:12px;color:#a8a29e;margin:0;border-top:1px solid #f5f5f4;padding-top:16px">If you didn't request this, you can ignore this email.</p>
  </div>
</body></html>`;
}
