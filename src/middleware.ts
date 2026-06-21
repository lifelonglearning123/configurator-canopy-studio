import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { env } from './lib/env';
import { isPlatformHost } from './lib/host';
import type { Database } from './lib/database.types';

export async function middleware(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  const platform = isPlatformHost(host);

  const res = NextResponse.next();
  res.headers.set('x-canopy-host', host);
  res.headers.set('x-canopy-platform', platform ? '1' : '0');

  // Refresh the Supabase auth session for any signed-in user (no-op for anon).
  const supabase = createServerClient<Database>(env.supabaseUrl(), env.supabaseAnon(), {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)'],
};
