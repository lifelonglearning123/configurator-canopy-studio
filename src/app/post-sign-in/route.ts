import { NextResponse } from 'next/server';
import { landingPathForCurrentUser } from '@/lib/super-admin';

// Decides where to send a freshly signed-in user. Client pages don't know the
// user's role until they hit the server, so they redirect here and we route
// super-admins to /super-admin and tenants to /admin.
export async function GET(req: Request) {
  const path = await landingPathForCurrentUser();
  return NextResponse.redirect(new URL(path, req.url));
}
