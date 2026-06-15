import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';
import type { Database } from './database.types';

// Auth-aware server client — respects RLS for the signed-in user.
export async function serverClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(env.supabaseUrl(), env.supabaseAnon(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component — no-op, the middleware refresh handles it.
        }
      },
    },
  });
}

// Service-role client — bypasses RLS. Use ONLY in route handlers for:
//   - public lead inserts (anon visitors)
//   - sign-up tenant provisioning
//   - Stripe webhook updates
let _admin: SupabaseClient<Database> | null = null;
export function adminClient(): SupabaseClient<Database> {
  if (_admin) return _admin;
  _admin = createClient<Database>(env.supabaseUrl(), env.supabaseService(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}
