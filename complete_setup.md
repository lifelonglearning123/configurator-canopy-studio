# Canopy Studio — completing the setup

This document covers the five follow-up tasks that remain after the production sign-up flow was validated end-to-end on 2026-06-16. Each item is independent — do them in any order.

## Production status (baseline)

- **Live URL:** https://canopy-studio.artificialignorance.io
- **Repo:** https://github.com/lifelonglearning123/configurator-canopy-studio
- **Local path:** `C:\python\canopy-studio`
- **Stripe mode:** TEST
- **Supabase:** schema applied, 10 seed products, RLS on
- **Sign-up → Stripe Checkout → /admin** validated with a test tenant (manual sign-in required after payment; see item 3)

---

## 1. Switch Stripe from TEST to LIVE mode

**Why:** Test mode shows a yellow banner and refuses real cards. Live mode takes real payments.

**Prerequisites:** Stripe account verified, business info filled in, payout bank account set up under **Settings → Payouts**.

### Steps

1. **Stripe Dashboard** → top-right corner: toggle from **Test mode** to **Live mode**.
2. **Create the live recurring price:**
   - Sidebar: **Product catalog** → **Add product** (or duplicate the test product to live).
   - Name: `Canopy Studio Subscription`
   - Pricing: **Recurring**, **£49.00 GBP**, billing period **Monthly**.
   - Save. Copy the new `price_…` ID.
3. **Get the live secret key:**
   - **Developers → API keys** (Live mode).
   - Reveal and copy the **Secret key** (`sk_live_…`). Stripe shows it once — save it somewhere safe.
4. **Register the live webhook destination:**
   - **Developers → Webhooks** → **Add destination** (Live mode).
   - Endpoint URL: `https://canopy-studio.artificialignorance.io/api/stripe/webhook`
   - Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`.
   - Save → reveal the **signing secret** (`whsec_…`).
5. **Update Vercel env vars** (Settings → Environment Variables):
   - `STRIPE_SECRET_KEY` → new `sk_live_…`
   - `STRIPE_PRICE_ID` → new live price ID
   - `STRIPE_WEBHOOK_SECRET` → new live `whsec_…`
   - All three environments ticked, Save each.
6. **Redeploy** (Deployments → ⋯ → Redeploy — build cache can stay checked, env-only change).
7. **Test with a real card** in incognito at the sign-up URL. Yellow Test mode banner should be gone. Refund yourself afterwards via Stripe → Payments.

**Note:** Local dev stays in TEST mode via `.env.local` — never mix live keys into local.

---

## 2. Onboard a real tenant (construction company)

**Why:** Get an actual paying customer running on their own branded domain.

### Steps

1. **Send the sign-up link** to the customer: `https://canopy-studio.artificialignorance.io/sign-up`
2. They fill the form, pay, sign in (workaround until item 3 ships), and land on `/admin`.
3. **Walk them through the admin tabs** (or screen-share):

   ### Branding (`/admin/branding`)
   - Logo URL: paste their logo URL (host anywhere — Supabase storage, their site, free image host).
   - Accent colour: hex code like `#0d6b3b`.
   - Currency: confirm GBP or change.
   - Save.

   ### Catalog (`/admin/catalog`)
   - Untick any of the 10 products they don't sell. Save.

   ### Pricing (`/admin/pricing`)
   - Review default line items (frame colours, roof options, etc.).
   - Bulk markup: enter e.g. `25` for 25% across the board.
   - Or edit individual rows for bespoke pricing.
   - Save.

   ### GHL & integrations (`/admin/integrations`)
   - In their GHL: **Settings → Inbound webhooks** → create webhook → copy URL.
   - Paste into the GHL webhook URL field. Save.
   - Every lead now POSTs to that URL and becomes a GHL contact.

   ### Custom domain (`/admin/domains`)
   - Decide hostname e.g. `configurator.acmepergolas.co.uk`.
   - At their registrar: create a CNAME `configurator → cname.vercel-dns.com`.
   - Back in admin: add hostname → Add.
   - Wait ~60 seconds → Re-verify. Vercel auto-issues SSL.
   - Their customers visit `https://configurator.acmepergolas.co.uk` → see branded configurator.

4. **Test as their customer** in incognito on their custom domain → submit a quote → confirm lead lands in their GHL within seconds.

---

## 3. Fix the post-Checkout sign-in friction

**Why:** Right now after payment, the user is bounced to `/sign-in` because the Supabase auth cookie doesn't survive the Stripe Checkout round-trip cleanly. Annoying and confusing.

This is a code change. Roughly 30–50 lines.

### What changes

1. **Edit `src/app/onboarding/complete/page.tsx`** — convert from static success page to a server component that:
   - Reads the `session_id` query param Stripe appends to the success URL.
   - Calls `stripe.checkout.sessions.retrieve(sessionId, { expand: ['customer'] })` to get the customer email.
   - Calls `supabase.auth.admin.generateLink({ type: 'magiclink', email })` to mint a one-time magic-link URL.
   - Server-redirects to that magic link via `redirect()` from `next/navigation`.
   - Supabase consumes the magic link, sets the auth cookie, redirects on to `/admin`.

2. **No env-var changes** — uses existing `SUPABASE_SERVICE_ROLE_KEY` and `STRIPE_SECRET_KEY`.

3. **Commit + push** — Vercel auto-deploys.

4. **Test on production:** full sign-up flow lands directly on `/admin`, no sign-in stop.

### To trigger

Ask Claude: **"do #3"**.

---

## 4. Re-enable email confirmation

**Why:** Stops fake/throwaway sign-ups. With confirmation off (current state), anyone can sign up with any email — real or fake — and provision a tenant. Worth re-enabling before going wide.

**Trickier than item 3** because the current sign-up flow assumes a session exists immediately after `signUp()`. With confirmation on, there's no session until the user clicks the link. Sign-up needs restructuring.

### What changes

1. **Supabase Dashboard** → **Authentication → Providers → Email** → turn **Confirm email** back on. Save.

2. **Code changes** (Claude does):
   - Modify `src/app/sign-up/page.tsx`: after `signUp()` succeeds (no session), do NOT call `/api/onboarding/provision` yet. Show a "Check your email" message. Stash `company`/`slug` so they survive the email round-trip.
   - Add `src/app/auth/confirm/route.ts` that Supabase's confirmation link redirects to. It:
     - Calls `supa.auth.exchangeCodeForSession(token)` to establish the session.
     - Reads `company` / `slug` from the URL query (encoded into the magic link).
     - Calls `/api/onboarding/provision` to create the tenant.
     - Redirects to the Stripe Checkout URL.

3. **Update Supabase email template** (Authentication → Email templates → Confirm signup):
   - Redirect URL: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&company={{ .Data.company }}&slug={{ .Data.slug }}`
   - Save.

Roughly 100 lines of code total + the template tweak.

**Do #3 first** — the patterns from #3 are reused here.

### To trigger

Ask Claude: **"do #4"**.

---

## 5. Rename `middleware.ts` → `proxy.ts`

**Why:** Next.js 16.2 prints a deprecation warning on every dev start. Renaming silences it and aligns with future versions. Same API, zero behaviour change.

### What changes

1. Move `src/middleware.ts` → `src/proxy.ts` (content unchanged).
2. Run `npm run dev` locally → confirm no warning and routes still work.
3. Commit + push → Vercel auto-deploys.
4. Probe production routes (`/`, `/sign-up`, `/sign-in`, `/admin`) to confirm nothing broke.

### To trigger

Ask Claude: **"do #5"**.

---

## Suggested order

1. **#5** — 30-second rename, low risk, gets you on the new convention.
2. **#3** — biggest UX win, every future sign-up benefits.
3. **#1** — switch to LIVE once the flow is smooth.
4. **#2** — onboard real paying tenants.
5. **#4** — re-enable email confirmation whenever you start marketing publicly.

---

## How to ask Claude to do them

Reply with one or more, e.g.: `do #5 and #3`. Claude executes one at a time and confirms production health between each.

## Security reminder

- Never paste live Stripe / Supabase secrets into chat, screen-share recordings, or screenshots. If a key is ever exposed, **rotate immediately** in the source dashboard.
- Local `.env.local` should use TEST keys only. Production live keys live in Vercel env vars, nowhere else.
