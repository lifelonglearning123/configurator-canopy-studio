// Edge-runtime-safe helpers. NO imports from next/headers, supabase-js, etc.
import { env } from './env';

export function isPlatformHost(host: string): boolean {
  const root = env.rootDomain();
  const clean = host.split(':')[0].toLowerCase();
  return clean === root || clean === `www.${root}` || clean === 'localhost';
}
