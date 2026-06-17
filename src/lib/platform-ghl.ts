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
