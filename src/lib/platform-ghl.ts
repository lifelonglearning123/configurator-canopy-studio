// Push tenant signup + subscription events into the platform owner's GHL
// location via the v2 API. Configured by:
//   PLATFORM_GHL_LOCATION_ID  – your GHL location
//   PLATFORM_GHL_API_TOKEN    – Private Integration Token (scopes:
//                               contacts.write, contacts.readonly)
//
// If either is unset every call is a silent no-op.
//
// Contacts are upserted by email and always carry the 'canopy-studio' tag
// plus exactly one of:  signup-incomplete | signup-trialing | signup-active
//                       signup-past_due   | signup-canceled
// When status changes, the stale signup-* tags are removed so each contact
// shows the current state — segmenting in GHL stays clean.

import { env } from './env';

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

const ALL_STATUSES = ['incomplete', 'trialing', 'active', 'past_due', 'canceled'] as const;
type SubStatus = (typeof ALL_STATUSES)[number];

type UpsertResponse = { contact?: { id: string }; new?: boolean };

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Version: GHL_VERSION,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function upsertContact(input: {
  locationId: string;
  token: string;
  email: string;
  company: string;
  tags: string[];
}): Promise<string | null> {
  try {
    const r = await fetch(`${GHL_BASE}/contacts/upsert`, {
      method: 'POST',
      headers: headers(input.token),
      body: JSON.stringify({
        locationId: input.locationId,
        email: input.email,
        firstName: input.company,
        companyName: input.company,
        tags: input.tags,
      }),
    });
    if (!r.ok) {
      console.error('[platform-ghl] upsert non-2xx', r.status, await r.text().catch(() => ''));
      return null;
    }
    const json = (await r.json()) as UpsertResponse;
    return json.contact?.id ?? null;
  } catch (e) {
    console.error('[platform-ghl] upsert failed', e instanceof Error ? e.message : String(e));
    return null;
  }
}

async function removeTags(token: string, contactId: string, tags: string[]): Promise<void> {
  if (!tags.length) return;
  try {
    const r = await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
      method: 'DELETE',
      headers: headers(token),
      body: JSON.stringify({ tags }),
    });
    if (!r.ok) console.error('[platform-ghl] tag-remove non-2xx', r.status);
  } catch (e) {
    console.error('[platform-ghl] tag-remove failed', e instanceof Error ? e.message : String(e));
  }
}

function staleStatusTags(current: SubStatus): string[] {
  return ALL_STATUSES.filter(s => s !== current).map(s => `signup-${s}`);
}

async function syncContact(input: {
  email: string;
  company: string;
  status: SubStatus;
  cleanupStaleTags: boolean;
}): Promise<void> {
  const locationId = env.platformGhlLocation();
  const token = env.platformGhlToken();
  if (!locationId || !token || !input.email) return;

  const tags = ['canopy-studio', `signup-${input.status}`];
  const contactId = await upsertContact({
    locationId,
    token,
    email: input.email,
    company: input.company,
    tags,
  });

  if (input.cleanupStaleTags && contactId) {
    await removeTags(token, contactId, staleStatusTags(input.status));
  }
}

// Look up (or create) a contact by email alone, without overwriting any
// existing firstName/companyName. Used by transactional email senders that
// don't carry signup context — e.g. password resets, magic links.
async function findOrCreateContactByEmail(email: string): Promise<string | null> {
  const locationId = env.platformGhlLocation();
  const token = env.platformGhlToken();
  if (!locationId || !token) return null;
  try {
    const r = await fetch(`${GHL_BASE}/contacts/upsert`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({ locationId, email, tags: ['canopy-studio'] }),
    });
    if (!r.ok) {
      console.error('[platform-ghl] findOrCreateContact non-2xx', r.status, await r.text().catch(() => ''));
      return null;
    }
    const json = (await r.json()) as UpsertResponse;
    return json.contact?.id ?? null;
  } catch (e) {
    console.error('[platform-ghl] findOrCreateContact failed', e instanceof Error ? e.message : String(e));
    return null;
  }
}

// Send a transactional email through the platform-owner's GHL location.
// Requires the PIT to carry the `conversations/message.write` scope.
// Returns true on success — callers should not fail the user flow on false,
// but should log so silent breakage is detectable.
export async function sendPlatformEmail(input: {
  email: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const token = env.platformGhlToken();
  if (!token) {
    console.error('[platform-ghl] sendPlatformEmail: PLATFORM_GHL_API_TOKEN not configured');
    return false;
  }
  const contactId = await findOrCreateContactByEmail(input.email);
  if (!contactId) return false;
  try {
    const r = await fetch(`${GHL_BASE}/conversations/messages`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({
        type: 'Email',
        contactId,
        subject: input.subject,
        html: input.html,
      }),
    });
    if (!r.ok) {
      console.error('[platform-ghl] sendPlatformEmail non-2xx', r.status, await r.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[platform-ghl] sendPlatformEmail failed', e instanceof Error ? e.message : String(e));
    return false;
  }
}

// Fire on initial signup — contact is brand new so no stale tags to clean.
export function notifyPlatformSignup(input: {
  email: string;
  company: string;
  tenant_slug: string;
  tenant_id: string;
  subscription_status: SubStatus;
}): void {
  void syncContact({
    email: input.email,
    company: input.company,
    status: input.subscription_status,
    cleanupStaleTags: false,
  });
}

// Fire on Stripe webhook state changes — rotate the signup-<status> tag.
export function notifyPlatformStatusChange(input: {
  email: string | null;
  company: string;
  tenant_slug: string;
  tenant_id: string;
  subscription_status: SubStatus;
}): void {
  if (!input.email) return;
  void syncContact({
    email: input.email,
    company: input.company,
    status: input.subscription_status,
    cleanupStaleTags: true,
  });
}
