/**
 * MFA login-challenge guard (SEC-3).
 *
 * Pure decision function used by the auth middleware to decide whether a request
 * must be diverted to the TOTP challenge page. Kept I/O-free so it is fully
 * unit-testable; the middleware gathers the inputs (from the verified session) and
 * applies the redirect.
 *
 * The rule: a user who has a VERIFIED factor but whose current session is only
 * `aal1` (password satisfied, MFA not yet) must complete the challenge before
 * reaching any protected app surface. Users with NO verified factor are never
 * affected — so enabling this carries zero lockout risk for non-MFA accounts.
 */

/** Path prefixes that must remain reachable at aal1 so a challenged user isn't trapped. */
const AAL1_ALLOWED_PREFIXES = [
  "/auth", // sign-in/up, the /auth/mfa challenge page itself, callback, sign-out target
  "/api/auth/mfa", // the login-challenge verify route
  "/_next", // framework assets
  "/favicon",
] as const;

/** The challenge destination. */
export const MFA_CHALLENGE_PATH = "/auth/mfa";

export interface MfaGuardInput {
  /** True when the caller has at least one verified TOTP factor. */
  hasVerifiedFactor: boolean;
  /** The session's current assurance level (from the access-token `aal` claim). */
  currentAal: "aal1" | "aal2" | null;
  /** The request pathname. */
  pathname: string;
}

export type MfaGuardDecision =
  | { action: "allow" }
  | { action: "challenge"; redirectTo: string };

function isAal1Allowed(pathname: string): boolean {
  return AAL1_ALLOWED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(p),
  );
}

/**
 * Decide whether to allow the request or divert it to the MFA challenge.
 *
 * Challenge only when ALL hold: the user has a verified factor, the session is not
 * already aal2, and the path is a protected surface (not in the aal1 allow-list).
 */
export function decideMfaChallenge(input: MfaGuardInput): MfaGuardDecision {
  const { hasVerifiedFactor, currentAal, pathname } = input;

  // No enrolled factor → MFA is not required for this user. Never challenge.
  if (!hasVerifiedFactor) return { action: "allow" };

  // Already stepped up.
  if (currentAal === "aal2") return { action: "allow" };

  // Keep auth + challenge surfaces reachable so the user can complete (or abandon) MFA.
  if (isAal1Allowed(pathname)) return { action: "allow" };

  return { action: "challenge", redirectTo: MFA_CHALLENGE_PATH };
}
