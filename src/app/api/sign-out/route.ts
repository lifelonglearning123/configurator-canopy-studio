import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase-server';

export async function POST() {
  const supa = await serverClient();
  await supa.auth.signOut();
  return NextResponse.redirect(new URL('/sign-in', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'));
}
