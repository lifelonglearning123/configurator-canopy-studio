# Canopy Studio

White-label 3D configurator SaaS for construction companies. Multi-tenant central deployment: one Next.js app, every customer is a tenant with their own custom domain, branding, pricing, and GHL.

- **Stack:** Next.js (App Router) + Supabase (auth + Postgres + RLS) + Stripe + Vercel
- **Pricing model:** £49/month per tenant, 14-day free trial, self-serve sign-up
- **Tenant resolution:** subdomain `{slug}.canopystudio.io` OR CNAMEd custom domain
- **Prototype:** the standalone HTML/Three.js configurator lives at `../configurator/index.html`

## First-time setup

### 1. Supabase

1. Create a new Supabase project at https://supabase.com.
2. In the SQL editor, run each migration in order:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_rls.sql`
   - `supabase/migrations/0003_seed_products.sql`
3. Copy `Project URL`, `anon public` key, and `service_role` key into `.env.local`.

### 2. Stripe

1. Create a product + recurring price of **£49 / month**. Copy the `price_…` ID.
2. Add to `.env.local` as `STRIPE_PRICE_ID`.
3. Add `STRIPE_SECRET_KEY` (from Developers → API keys).
4. For local webhook testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook` — copy the displayed `whsec_…` into `STRIPE_WEBHOOK_SECRET`.

### 3. Local env

```powershell
Copy-Item .env.example .env.local
# then fill in the values
```

### 4. Run

```powershell
$env:NODE_OPTIONS="--use-system-ca"; npm run dev
```

Visit:
- http://localhost:3000 — marketing / sign-up
- http://localhost:3000/sign-up — create a tenant
- After Checkout, you'll land on `/admin`

To test the *tenant* configurator locally you need to hit a non-platform host. Set `APP_ROOT_DOMAIN=localtest.me` in `.env.local` and visit `demo.localtest.me:3000` — `localtest.me` resolves to 127.0.0.1 for any subdomain.

## Routes

| Route | Purpose |
|---|---|
| `/` | Marketing page (platform host) → redirects to `/showroom` on tenant hosts |
| `/sign-up` | Create user + tenant + Stripe Checkout |
| `/sign-in` | Returning tenant admin login |
| `/admin/*` | Tenant admin (catalog, pricing, branding, integrations, domains, billing) |
| `/showroom` | Public showroom (tenant-scoped) |
| `/configure/[productKey]` | Public configurator |
| `/api/leads` | POST a lead → Supabase + tenant's GHL webhook |
| `/api/stripe/webhook` | Stripe subscription state → tenant.subscription_status |
| `/api/onboarding/provision` | Sign-up flow: tenant row + default pricing + Stripe Checkout |
| `/api/sign-out` | Clear auth session |

## What's done in Phase 1

- Project scaffold, Tailwind, TypeScript
- Supabase schema (tenants, domains, users, products, tenant_products, pricing_rules, leads) + RLS
- Seed catalog with the 10 products from the prototype
- Tenant resolver middleware (custom domain + subdomain)
- Sign-up to Stripe Checkout to tenant provisioning
- Stripe webhook to subscription state
- Admin: overview, catalog toggle, pricing line-item editor with bulk markup, branding (logo/color/currency), GHL integration form, custom-domain management, billing portal link
- Public showroom with branded header
- Public configurator: full option panel + **live 3D Three.js scene** (10 product builders ported from prototype: pergola, veranda, carport, garden room, awning, container, fence, garage door, glass room, pool enclosure) + Orbit/Front/Side/Top + time-of-day + auto-orbit + open-roof + snapshot
- Live tenant-scoped pricing + lead modal posting to `/api/leads`
- Lead pipeline: Supabase insert + tenant GHL webhook delivery with retry on 5xx
- **Vercel Domains API integration**: tenant adds a hostname → app calls Vercel API to attach to the project → "Re-verify" button checks status → SSL auto-provisioned. Falls back to manual mode if `VERCEL_TOKEN` / `VERCEL_PROJECT_ID` aren't set.

## Vercel Domains setup

For custom-domain auto-provisioning to work, set these in Vercel **Project Settings → Environment Variables** (and in `.env.local`):

```
VERCEL_TOKEN=        # https://vercel.com/account/tokens
VERCEL_PROJECT_ID=   # Project Settings → General → Project ID
VERCEL_TEAM_ID=      # Optional, only if project is in a team
```

Then tenants add their hostname in `/admin/domains`; the app calls Vercel's `/v10/projects/{id}/domains` endpoint to attach it. Vercel issues the certificate once the CNAME is detected.

## What's NOT done yet (Phase 2+)

- **Email verification + magic-link sign-in.** Currently password-only.
- **Multi-user invites per tenant.**
- **Per-tenant analytics dashboard.**
- **Periodic domain-status sync.** Re-verification is currently manual (button); add a cron / on-load refresh.
- **Stripe webhook idempotency keys.** Production hardening.
