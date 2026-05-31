import { createClient } from "@supabase/supabase-js";

/**
 * Re-auth credential check (4.ACCOUNT-MODEL-10e).
 *
 * Owns the only Supabase access for the password step-up used by the self-serve
 * account-deletion request. Lives in repositories/ per the module-boundary rule
 * (direct `@supabase/supabase-js` imports are repositories/core-auth/tests only).
 *
 * Verifies a password by signing in on a THROWAWAY client that persists no
 * session and shares no cookie storage with the caller's request — so the check
 * never mutates or refreshes the live session. The minted tokens are discarded
 * immediately (best-effort signOut). Returns a boolean; the caller
 * (services/accounts/accountDeletionReauth.ts) owns the higher-level reasoning
 * (missing email, misconfiguration).
 *
 * Assumes the env is present — the service guards that before calling, mirroring
 * the rest of repositories/ which use non-null env access.
 */
export async function verifyPasswordCredential(
  email: string,
  password: string,
): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) return false;

  try {
    await client.auth.signOut();
  } catch {
    // no-op — the throwaway client persists nothing.
  }
  return true;
}
