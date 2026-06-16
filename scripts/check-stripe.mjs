import Stripe from 'stripe';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const stripe = new Stripe(env.STRIPE_SECRET_KEY);
const mode = env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'LIVE' : env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'TEST' : 'UNKNOWN';
console.log('Stripe mode:', mode);

try {
  const price = await stripe.prices.retrieve(env.STRIPE_PRICE_ID);
  console.log('Price:        ', price.id);
  console.log('  active:     ', price.active);
  console.log('  type:       ', price.type);
  console.log('  recurring:  ', price.recurring ? `${price.recurring.interval_count} ${price.recurring.interval}` : 'none');
  console.log('  amount:     ', price.unit_amount, price.currency);
  console.log('  product:    ', price.product);
} catch (e) {
  console.log('Price ERROR:', e.message);
}
