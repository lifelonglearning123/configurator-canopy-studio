// Wrapper around Vercel's Domains API.
// Docs: https://vercel.com/docs/rest-api/endpoints/projects#add-a-domain-to-a-project
//
// Required env vars (set in Vercel project settings AND local .env.local):
//   VERCEL_TOKEN        — Personal/team token with project write access
//   VERCEL_PROJECT_ID   — Target project ID
//   VERCEL_TEAM_ID      — Optional, if the project lives in a team
import 'server-only';

const API = 'https://api.vercel.com';

function readConfig() {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID || undefined;
  return { token, projectId, teamId };
}

export function isVercelConfigured(): boolean {
  const { token, projectId } = readConfig();
  return Boolean(token && projectId);
}

function qs(teamId?: string) {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
}

async function call<T = unknown>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
  const { token, teamId } = readConfig();
  if (!token) return { ok: false, status: 0, data: null, error: 'VERCEL_TOKEN not configured' };
  const sep = path.includes('?') ? '&' : (qs(teamId) ? '?' : '');
  const teamPart = teamId ? `${sep}teamId=${encodeURIComponent(teamId)}` : '';
  const url = `${API}${path}${teamPart}`;
  try {
    const r = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...init.headers,
      },
    });
    const text = await r.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    if (!r.ok) {
      const errMsg = (json && typeof json === 'object' && 'error' in json && typeof (json as { error: { message?: string } }).error?.message === 'string')
        ? (json as { error: { message: string } }).error.message
        : `HTTP ${r.status}`;
      return { ok: false, status: r.status, data: null, error: errMsg };
    }
    return { ok: true, status: r.status, data: json as T, error: null };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export type VercelDomain = {
  name: string;
  apexName?: string;
  projectId?: string;
  verified?: boolean;
  verification?: Array<{ type: string; domain: string; value: string; reason?: string }>;
};

export type VercelDomainConfig = {
  configuredBy?: 'CNAME' | 'A' | 'http' | null;
  acceptedChallenges?: string[];
  misconfigured?: boolean;
  recommendedCNAME?: string[];
  recommendedIPv4?: string[];
};

/** Add a domain to the project. Returns the Vercel-side record. */
export async function addDomain(hostname: string): Promise<{ ok: boolean; data: VercelDomain | null; error: string | null }> {
  const { projectId } = readConfig();
  if (!projectId) return { ok: false, data: null, error: 'VERCEL_PROJECT_ID not configured' };
  const r = await call<VercelDomain>(`/v10/projects/${encodeURIComponent(projectId)}/domains`, {
    method: 'POST',
    body: JSON.stringify({ name: hostname }),
  });
  return { ok: r.ok, data: r.data, error: r.error };
}

/** Remove a domain from the project. */
export async function removeDomain(hostname: string): Promise<{ ok: boolean; error: string | null }> {
  const { projectId } = readConfig();
  if (!projectId) return { ok: false, error: 'VERCEL_PROJECT_ID not configured' };
  const r = await call(`/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(hostname)}`, { method: 'DELETE' });
  // 404 is benign — the domain may already have been removed manually
  if (r.status === 404) return { ok: true, error: null };
  return { ok: r.ok, error: r.error };
}

/** Get current verification + SSL status for a domain. */
export async function getDomain(hostname: string): Promise<{ ok: boolean; data: VercelDomain | null; error: string | null }> {
  const { projectId } = readConfig();
  if (!projectId) return { ok: false, data: null, error: 'VERCEL_PROJECT_ID not configured' };
  return call<VercelDomain>(`/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(hostname)}`);
}

/** Get DNS configuration recommendations for a hostname. */
export async function getDomainConfig(hostname: string): Promise<{ ok: boolean; data: VercelDomainConfig | null; error: string | null }> {
  return call<VercelDomainConfig>(`/v6/domains/${encodeURIComponent(hostname)}/config`);
}

/** Re-trigger verification for a pending domain. */
export async function verifyDomain(hostname: string): Promise<{ ok: boolean; data: VercelDomain | null; error: string | null }> {
  const { projectId } = readConfig();
  if (!projectId) return { ok: false, data: null, error: 'VERCEL_PROJECT_ID not configured' };
  return call<VercelDomain>(`/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(hostname)}/verify`, { method: 'POST' });
}
