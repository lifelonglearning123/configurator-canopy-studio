'use client';
import { createBrowserClient } from '@supabase/ssr';
import { env } from './env';
import type { Database } from './database.types';

let _client: ReturnType<typeof createBrowserClient<Database>> | null = null;
export function browserClient() {
  if (_client) return _client;
  _client = createBrowserClient<Database>(env.supabaseUrl(), env.supabaseAnon());
  return _client;
}
