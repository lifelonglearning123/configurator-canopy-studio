import { NextRequest, NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase-server';
import { landingPathForCurrentUser } from '@/lib/super-admin';

// Email links (magic link, password reset) land here with a `code` query param.
// We exchange the code for a session cookie, then send the user onward.
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get('code');
  const explicitNext = url.searchParams.get('next');
  const error = url.searchParams.get('error_description') || url.searchParams.get('error');

  if (error) {
    const back = new URL('/sign-in', url.origin);
    back.searchParams.set('error', error);
    return NextResponse.redirect(back);
  }

  if (!code) {
    return NextResponse.redirect(new URL('/sign-in', url.origin));
  }

  const supa = await serverClient();
  const { error: exErr } = await supa.auth.exchangeCodeForSession(code);
  if (exErr) {
    const back = new URL('/sign-in', url.origin);
    back.searchParams.set('error', exErr.message);
    return NextResponse.redirect(back);
  }

  const next = explicitNext || await landingPathForCurrentUser();
  return NextResponse.redirect(new URL(next, url.origin));
}
