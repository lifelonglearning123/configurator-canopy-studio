import { NextRequest, NextResponse } from 'next/server';
import { sendResetPasswordEmail } from '@/lib/auth-email';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let email = '';
  try {
    const body = await req.json().catch(() => ({}));
    email = String(body.email ?? '').trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 });
  }
  await sendResetPasswordEmail(email);
  return NextResponse.json({ ok: true });
}
