import { verifyPasswordCredential } from "@/repositories/authReauth";

/**
 * Re-auth confirmation for the self-serve account-deletion request
 * (4.ACCOUNT-MODEL-10e).
 *
 * Deleting an account is destructive (after the grace window the purge cron
 * tears down the entire account graph + auth.users). Per the deletion-flow plan
 * ("Self-serve request route: authenticated user + re-auth confirm") the request
 * route requires the caller to re-prove their credential — a freshly-typed
 * password — on top of the existing session cookie. This is the standard
 * step-up guard for a high-risk irreversible action and defends against a
 * hijacked-but-idle session or an unattended machine.
 *
 * Mechanism appropriate for the CURRENT auth setup: V2 auth is email + password
 * (app/auth/actions.ts; SSO is a later slice). The raw credential check lives in
 * repositories/authReauth.ts (a throwaway, session-less client). This service
 * owns the business reasoning around it.
 *
 * When SSO providers land, extend this with a provider re-auth / OTP branch and
 * key the choice off the user's identities. Until then a passwordless (OAuth-
 * only) user cannot self-serve delete and must use the (service-role) admin
 * path — documented in the route + the slice report.
 */

export interface ReauthResult {
  ok: boolean;
  /** Why a non-ok result failed — for structured logging, never returned to the client verbatim. */
  reason?: "invalid_credentials" | "misconfigured" | "no_email";
}

/**
 * Verify `password` belongs to `email` without touching the caller's session.
 * Returns `{ ok: true }` on a correct password, `{ ok: false, reason }` otherwise.
 * Never throws for a wrong password — only a hard misconfiguration surfaces as
 * `reason: "misconfigured"`.
 */
export async function verifyPasswordReauth(
  email: string | null,
  password: string,
): Promise<ReauthResult> {
  if (!email) return { ok: false, reason: "no_email" };

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { ok: false, reason: "misconfigured" };
  }

  const ok = await verifyPasswordCredential(email, password);
  return ok ? { ok: true } : { ok: false, reason: "invalid_credentials" };
}
