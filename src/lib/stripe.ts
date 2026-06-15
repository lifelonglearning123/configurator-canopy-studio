import Stripe from 'stripe';
import { env } from './env';

let _stripe: Stripe | null = null;
export function stripe(): Stripe {
  if (_stripe) return _stripe;
  _stripe = new Stripe(env.stripeSecret());
  return _stripe;
}
