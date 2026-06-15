// Deliver a lead to the tenant's GHL inbound webhook.
// Same shape as the FB CAPI Bridge / Retargeting Callback pattern:
// fire-and-forget POST with retry-on-5xx.

export type GhlPayload = {
  tenant_slug: string;
  product_key: string | null;
  customer: { first_name: string; last_name: string; email: string; phone?: string; postcode?: string; notes?: string };
  configuration: Record<string, unknown>;
  price_quoted_minor: number;
  currency: string;
  source_url?: string;
};

export type GhlResult = { ok: boolean; status: number; body: string };

export async function deliverGhl(webhookUrl: string, payload: GhlPayload, attempts = 3): Promise<GhlResult> {
  let lastErr: GhlResult = { ok: false, status: 0, body: '' };
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await r.text().catch(() => '');
      if (r.ok) return { ok: true, status: r.status, body };
      lastErr = { ok: false, status: r.status, body };
      // Retry only on 5xx; client errors break out immediately.
      if (r.status < 500) return lastErr;
    } catch (e) {
      lastErr = { ok: false, status: 0, body: e instanceof Error ? e.message : String(e) };
    }
    // Exponential backoff between attempts (300ms, 900ms)
    if (i < attempts - 1) await new Promise(res => setTimeout(res, 300 * Math.pow(3, i)));
  }
  return lastErr;
}
