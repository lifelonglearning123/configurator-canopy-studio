'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let _client: ReturnType<typeof createBrowserClient<Database>> | null = null;
export function browserClient() {
  if (_client) return _client;
  if (!url || !anon) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in client bundle. Restart the dev server after editing .env.local.');
  }
  _client = createBrowserClient<Database>(url, anon);
  return _client;
}
