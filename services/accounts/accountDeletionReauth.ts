import { verifyPasswordCredential } from "@/repositories/authReauth";

/**
 * Password re-auth (step-up) for high-risk actions that are only ever performed
 * by a user who HAS a ChainReact password.
 *
 * Current callers: password change (`services/accounts/passwordChange.ts` — the
 * caller is by definition changing a password they already have) and Team/Business
 * ownership transfer.
 *
 * NOT USED BY ACCOUNT DELETION ANY MORE (ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1).
 * The file name is historical: this check was originally written for the deletion
 * request. Requiring a password there made the only irreversible action in the
 * product unreachable for users who signed up with Google, with an email OTP, or
 * (later) with SSO — those identities may have no password at all. Deletion now
 * uses the universal, purpose-bound emailed verification code in
 * `services/accounts/deletionChallenge.ts`, which works identically for every auth
 * provider. Do not reintroduce a password requirement into the deletion path.
 *
 * The raw credential check lives in repositories/authReauth.ts (a throwaway,
 * session-less client). This service owns the business reasoning around it and
 * returns `no_email` / `misconfigured` for the environments where it cannot run.
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
