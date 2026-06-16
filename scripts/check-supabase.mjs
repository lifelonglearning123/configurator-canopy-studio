import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const tables = ['products', 'tenants', 'tenant_users', 'tenant_products', 'pricing_rules', 'leads', 'domains'];

console.log('Project:', env.NEXT_PUBLIC_SUPABASE_URL);
console.log();
for (const t of tables) {
  const { count, error } = await db.from(t).select('*', { count: 'exact', head: true });
  if (error) console.log(`  ${t.padEnd(18)} ERROR  ${error.message || error.code || JSON.stringify(error)}`);
  else      console.log(`  ${t.padEnd(18)} OK     ${count} rows`);
}
