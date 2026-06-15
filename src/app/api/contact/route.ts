import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const Body = z.object({
  name:    z.string().min(1).max(200),
  email:   z.string().email().max(200),
  phone:   z.string().max(50).optional(),
  company: z.string().max(200).optional(),
  product: z.string().max(100).optional(),
  message: z.string().max(5000).optional(),
});

export async function POST(req: NextRequest) {
  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: 'invalid_payload', detail: String(e) }, { status: 400 }); }

  // If a webhook URL is configured (e.g. a GHL inbound webhook for the
  // marketing site), forward the lead there. Otherwise we just log it.
  const webhook = process.env.MARKETING_CONTACT_WEBHOOK_URL;
  if (webhook) {
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: 'canopy-studio-marketing',
          received_at: new Date().toISOString(),
          ...parsed,
          user_agent: req.headers.get('user-agent') ?? null,
          referer: req.headers.get('referer') ?? null,
        }),
      });
    } catch (e) {
      // We still return ok to the user — the message landed in our logs even if
      // forwarding failed. Surface failures via your monitoring rather than the user.
      console.error('contact webhook failed', e);
    }
  } else {
    console.log('[contact] new message (no webhook configured):', parsed);
  }

  return NextResponse.json({ ok: true });
}
