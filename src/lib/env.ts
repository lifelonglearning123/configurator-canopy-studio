function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const env = {
  supabaseUrl: () => req('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnon: () => req('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  supabaseService: () => req('SUPABASE_SERVICE_ROLE_KEY'),
  stripeSecret: () => req('STRIPE_SECRET_KEY'),
  stripeWebhook: () => req('STRIPE_WEBHOOK_SECRET'),
  stripePrice: () => req('STRIPE_PRICE_ID'),
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  rootDomain: () => process.env.APP_ROOT_DOMAIN ?? 'canopystudio.io',
  cnameTarget: () => process.env.CNAME_TARGET ?? 'cname.canopystudio.io',
  platformGhlLocation: () => process.env.PLATFORM_GHL_LOCATION_ID || null,
  platformGhlToken: () => process.env.PLATFORM_GHL_API_TOKEN || null,
  superAdminEmails: (): string[] =>
    (process.env.SUPER_ADMIN_EMAILS ?? '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean),
};
