import { redirect } from 'next/navigation';
import { serverClient } from './supabase-server';
import { env } from './env';

export type SuperAdminUser = { id: string; email: string };

// Gate /super-admin routes. Allowed users are listed in SUPER_ADMIN_EMAILS
// (comma-separated). If the env var is empty, NO ONE is admin — fail closed.
export async function requireSuperAdmin(): Promise<SuperAdminUser> {
  const supa = await serverClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) redirect('/sign-in?next=/super-admin');

  const allowed = env.superAdminEmails();
  const email = (user.email ?? '').toLowerCase();
  if (allowed.length === 0 || !allowed.includes(email)) {
    redirect('/admin');
  }
  return { id: user.id, email };
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return env.superAdminEmails().includes(email.toLowerCase());
}

// Resolves the post-sign-in landing path for the current session.
// Super-admins → /super-admin, everyone else → /admin.
export async function landingPathForCurrentUser(): Promise<string> {
  const supa = await serverClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return '/sign-in';
  return isSuperAdminEmail(user.email) ? '/super-admin' : '/admin';
}
