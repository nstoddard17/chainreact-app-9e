import {
  listTotpFactors,
  enrollTotp,
  challengeAndVerifyTotp,
  unenrollFactor,
  getAssuranceLevel,
  type TotpEnrollment,
  type TotpFactorMeta,
} from "@/repositories/auth/mfa";

/**
 * MFA (TOTP) service (ACCOUNT-SETTINGS-MFA-1 / SEC-3).
 *
 * Owns the ORDER and rules of the multi-factor lifecycle on top of the raw
 * repository (repositories/authMfa.ts). Every operation is scoped to the caller's
 * OWN session — there is no admin/service-role path and no target id is ever taken
 * from request input beyond the caller's own factor id.
 *
 * User-scoping guarantee: `listFactors` (and every enroll/verify/unenroll) runs on
 * the caller's cookie-bound session, so a caller can only ever see and mutate their
 * own factors — MFA state never leaks across accounts or workspaces (MFA is a
 * per-USER credential, identical across the user's personal/team/business
 * accounts).
 *
 * SECRET DISCIPLINE: enrollment material (secret / otpauth URI / QR) flows through
 * `beginEnrollment` to the route for a ONE-TIME render to the enrolling user. It is
 * never logged, cached, or returned by any other method.
 *
 * Recovery posture (documented, not faked): Supabase TOTP has no built-in
 * self-serve recovery codes, so this slice ships none. A user who loses their
 * authenticator recovers via support-assisted factor removal (a service-role admin
 * unenroll), documented in the readiness doc. We do NOT pretend recovery codes
 * exist in the UI.
 */

/** The friendly name stamped on the single TOTP factor we enroll. */
export const TOTP_FRIENDLY_NAME = "Authenticator app";

export interface MfaStatus {
  /** True when the user has at least one VERIFIED TOTP factor (MFA is live). */
  enabled: boolean;
  /** Non-secret metadata for the verified factor, if any. */
  factor: { id: string; friendlyName: string | null; createdAt: string } | null;
}

export type BeginEnrollmentResult =
  | { ok: true; enrollment: TotpEnrollment }
  | { ok: false; reason: "already_enrolled" | "failed" };

export type ConfirmEnrollmentResult =
  | { ok: true }
  | { ok: false; reason: "invalid_code" };

export type DisableResult =
  | { ok: true }
  | { ok: false; reason: "not_enrolled" | "mfa_required" | "invalid_code" | "failed" };

export type LoginChallengeResult =
  | { ok: true }
  | { ok: false; reason: "invalid_code" | "not_enrolled" };

function verifiedFactor(factors: TotpFactorMeta[]): TotpFactorMeta | undefined {
  return factors.find((f) => f.status === "verified");
}

/** The caller's MFA status — only a VERIFIED factor counts as enabled. */
export async function getMfaStatus(): Promise<MfaStatus> {
  const factors = await listTotpFactors();
  const verified = verifiedFactor(factors);
  return {
    enabled: Boolean(verified),
    factor: verified
      ? { id: verified.id, friendlyName: verified.friendlyName, createdAt: verified.createdAt }
      : null,
  };
}

/**
 * Begin TOTP enrollment. Refuses if a verified factor already exists (idempotent
 * "already enabled"). Clears any stale UNVERIFIED factors first so a re-attempt
 * doesn't accumulate orphans, then enrolls a fresh factor.
 */
export async function beginTotpEnrollment(): Promise<BeginEnrollmentResult> {
  const existing = await listTotpFactors();
  if (verifiedFactor(existing)) {
    return { ok: false, reason: "already_enrolled" };
  }
  // Drop abandoned mid-enrollment factors before starting a clean one.
  for (const f of existing.filter((x) => x.status === "unverified")) {
    await unenrollFactor(f.id);
  }
  const enrollment = await enrollTotp(TOTP_FRIENDLY_NAME);
  if (!enrollment) return { ok: false, reason: "failed" };
  return { ok: true, enrollment };
}

/**
 * Confirm an enrollment with the first authenticator code. A correct code marks
 * the factor verified AND elevates the caller's session to aal2. A wrong/expired
 * code changes nothing (fail-safe) — the factor stays unverified.
 */
export async function confirmTotpEnrollment(
  factorId: string,
  code: string,
): Promise<ConfirmEnrollmentResult> {
  const ok = await challengeAndVerifyTotp(factorId, code);
  return ok ? { ok: true } : { ok: false, reason: "invalid_code" };
}

/**
 * Disable MFA following Supabase's security model: `mfa.unenroll` on a verified
 * factor requires an **AAL2** session. We do NOT require the account password —
 * that breaks OAuth/SSO users (who have none) and is not Supabase's gate.
 *
 * Flow:
 *   - No verified factor → `not_enrolled`.
 *   - Session already AAL2 (the common path — the middleware forces AAL2 to reach
 *     the account page once MFA is on) → remove every factor directly.
 *   - Session still AAL1 → require the current authenticator code and step up to
 *     AAL2 via `challengeAndVerify` (same client, so the elevated cookie is read by
 *     the subsequent unenroll). A missing code → `mfa_required` (the caller
 *     prompts); a wrong code → `invalid_code`. The AAL2 requirement is enforced,
 *     never bypassed.
 *
 * Provider-agnostic: works for email/password, Google OAuth, and future SSO — the
 * only credential involved is the TOTP code (or an already-AAL2 session). The code
 * is never logged.
 */
export async function disableTotp(input?: { code?: string | null }): Promise<DisableResult> {
  const factors = await listTotpFactors();
  const verified = verifiedFactor(factors);
  if (!verified) {
    return { ok: false, reason: "not_enrolled" };
  }

  const aal = await getAssuranceLevel();
  if (aal.currentLevel !== "aal2") {
    const code = input?.code ?? null;
    if (!code) {
      return { ok: false, reason: "mfa_required" };
    }
    const elevated = await challengeAndVerifyTotp(verified.id, code);
    if (!elevated) {
      return { ok: false, reason: "invalid_code" };
    }
  }

  let allRemoved = true;
  for (const f of factors) {
    const removed = await unenrollFactor(f.id);
    if (!removed) allRemoved = false;
  }
  return allRemoved ? { ok: true } : { ok: false, reason: "failed" };
}

/**
 * Satisfy a login-time MFA challenge: verify a code against the user's verified
 * factor, elevating the session to aal2. Wrong/expired codes fail safe.
 */
export async function verifyLoginChallenge(code: string): Promise<LoginChallengeResult> {
  const factors = await listTotpFactors();
  const verified = verifiedFactor(factors);
  if (!verified) return { ok: false, reason: "not_enrolled" };
  const ok = await challengeAndVerifyTotp(verified.id, code);
  return ok ? { ok: true } : { ok: false, reason: "invalid_code" };
}
