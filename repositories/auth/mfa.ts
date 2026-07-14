import { createClient } from "@/utils/supabase/server";

/**
 * MFA (TOTP) repository — the ONLY module that touches Supabase Auth's MFA API
 * (ACCOUNT-SETTINGS-MFA-1 / SEC-3).
 *
 * Uses the SSR **session** client (cookie-bound) so every operation acts on the
 * caller's own logged-in identity — never a service-role admin path. Enrollment /
 * verification / disable / login-challenge are all session-scoped, and a
 * successful `verify` re-writes the session cookie so the assurance level (AAL)
 * is elevated to `aal2` for the caller only.
 *
 * SECRET DISCIPLINE: the enroll response carries the TOTP shared secret, the
 * otpauth URI, and the QR image. Those are returned UP to the service/route for a
 * one-time render to the enrolling user — they are NEVER logged here, and no
 * function in this module writes them to a logger. Callers must uphold the same.
 *
 * Per the module-boundary rule, direct Supabase-auth access lives in
 * repositories/ (mirrors repositories/authPassword.ts, repositories/authReauth.ts).
 */

/** A TOTP factor's non-secret metadata (safe to surface to the owner). */
export interface TotpFactorMeta {
  id: string;
  friendlyName: string | null;
  /** "verified" once the user has confirmed a code; "unverified" mid-enrollment. */
  status: "verified" | "unverified";
  createdAt: string;
  updatedAt: string;
}

/** Enrollment material — shown ONCE to the enrolling user, never persisted/logged. */
export interface TotpEnrollment {
  factorId: string;
  /** SVG QR image as a `data:` URI (safe to render in an <img>). */
  qrCode: string;
  /** The base32 shared secret, for manual authenticator entry. Sensitive. */
  secret: string;
  /** The otpauth:// URI. Sensitive (embeds the secret). */
  uri: string;
}

/** Assurance level of the caller's current session vs. what their factors require. */
export interface AssuranceLevel {
  /** The session's current level — "aal1" (password only) or "aal2" (MFA satisfied). */
  currentLevel: "aal1" | "aal2" | null;
  /** The level the user's factors REQUIRE — "aal2" when a verified factor exists. */
  nextLevel: "aal1" | "aal2" | null;
}

function mapFactorStatus(status: string): "verified" | "unverified" {
  return status === "verified" ? "verified" : "unverified";
}

/** List the caller's TOTP factors (metadata only — never a secret). */
export async function listTotpFactors(): Promise<TotpFactorMeta[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return [];
  return data.totp.map((f) => ({
    id: f.id,
    friendlyName: f.friendly_name ?? null,
    status: mapFactorStatus(f.status),
    createdAt: f.created_at,
    updatedAt: f.updated_at,
  }));
}

/**
 * Start a TOTP enrollment. Returns the factor id + one-time enrollment material.
 * On any Supabase error returns null (the service maps that to a generic failure).
 */
export async function enrollTotp(friendlyName: string): Promise<TotpEnrollment | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName,
  });
  if (error || !data || data.type !== "totp") return null;
  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

/**
 * Verify a code against a factor (used both to CONFIRM an enrollment and to
 * satisfy a LOGIN challenge). Runs challenge+verify; a successful verify saves
 * the elevated (aal2) session to the cookie. Returns true on success, false on a
 * wrong/expired code or any error — the failing reason is never surfaced.
 */
export async function challengeAndVerifyTotp(
  factorId: string,
  code: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  return !error;
}

/** Remove a factor by id. Returns true on success. */
export async function unenrollFactor(factorId: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  return !error;
}

/** The caller session's current vs required assurance level. */
export async function getAssuranceLevel(): Promise<AssuranceLevel> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return { currentLevel: null, nextLevel: null };
  return {
    currentLevel: (data.currentLevel as AssuranceLevel["currentLevel"]) ?? null,
    nextLevel: (data.nextLevel as AssuranceLevel["nextLevel"]) ?? null,
  };
}
