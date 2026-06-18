import { NextRequest, NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { serverClient } from '@/lib/supabase-server';

// Magic-link and password-recovery emails land here. Unlike the PKCE `code`
// flow at /auth/callback, this uses verifyOtp({ token_hash, type }) — which
// works regardless of which browser opens the link, because there's no
// client-side code verifier to match against.
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const token_hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const next = url.searchParams.get('next') || '/admin';

  if (!token_hash || !type) {
    const back = new URL('/sign-in', url.origin);
    back.searchParams.set('error', 'This link is invalid or has expired. Request a new one.');
    return NextResponse.redirect(back);
  }

  const supa = await serverClient();
  const { error } = await supa.auth.verifyOtp({ token_hash, type });
  if (error) {
    const back = new URL('/sign-in', url.origin);
    back.searchParams.set('error', error.message);
    return NextResponse.redirect(back);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
