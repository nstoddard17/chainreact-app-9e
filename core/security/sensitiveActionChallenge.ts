import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Pure crypto/policy helpers for purpose-bound sensitive-action challenges
 * (ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1).
 *
 * A "sensitive action challenge" is a one-time numeric code emailed to the
 * VERIFIED account email of an already-authenticated user, which authorizes ONE
 * specific destructive action (today: `delete_account`). It replaces the old
 * password re-auth on account deletion, which was unusable for Google / email-OTP
 * / future SSO users who may have no ChainReact password at all.
 *
 * No DB, no I/O, no env reads beyond the keyed pepper accessor. Everything here
 * is deterministic and unit-testable.
 *
 * ── Why a keyed HMAC and not a bare SHA-256 ────────────────────────────────────
 * `core/apiKeys/keys.ts` stores a plain unsalted SHA-256 of an API key — correct
 * there, because the key carries ≥256 bits of entropy and is not brute-forceable
 * from its digest. A SIX-DIGIT code has ~20 bits: a leaked table of SHA-256
 * digests would be exhausted in microseconds. So the verifier is
 * `HMAC-SHA256(pepper, purpose:userId:challengeId:code)`:
 *   - the server-only pepper makes an offline digest attack impossible without
 *     also stealing an env secret that never touches the database;
 *   - binding purpose + userId + challengeId into the message makes every stored
 *     verifier unique even when two users hold the same six digits, so the digest
 *     column can never be used as a cross-user oracle.
 * The plaintext code is NEVER stored, logged, or returned.
 *
 * Bcrypt/argon2 are deliberately NOT used: they would add a dependency, and a
 * server-held pepper already defeats the offline attack that a slow KDF targets.
 * The online attack is capped by {@link CHALLENGE_MAX_ATTEMPTS} instead.
 */

/** Every purpose a challenge may authorize. One entry today — deliberately closed. */
export const SENSITIVE_ACTION_PURPOSES = ["delete_account"] as const;
export type SensitiveActionPurpose = (typeof SENSITIVE_ACTION_PURPOSES)[number];

/** Six digits — the length users expect from an emailed code. */
export const CHALLENGE_CODE_LENGTH = 6;
/** How long an issued code stays usable. */
export const CHALLENGE_TTL_MS = 10 * 60 * 1000;
/** Wrong-code submissions allowed before the challenge is locked for good. */
export const CHALLENGE_MAX_ATTEMPTS = 5;
/** Minimum wait between sends of a code for the same purpose. */
export const CHALLENGE_RESEND_INTERVAL_MS = 60 * 1000;
/**
 * How long a SUCCESSFUL verification authorizes the destructive action. Short:
 * the user has already proved possession, and all that remains is typing the
 * final confirmation. Anything longer turns a verified challenge into a standing
 * deletion permit sitting in the database.
 */
export const CHALLENGE_VERIFICATION_WINDOW_MS = 5 * 60 * 1000;
/**
 * Durable per-user, per-purpose send cap over a rolling window. Defends the
 * user's inbox (and our sending reputation) against an attacker who holds a
 * session and hammers the send route from many browsers.
 */
export const CHALLENGE_MAX_SENDS_PER_WINDOW = 10;
export const CHALLENGE_SEND_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Server-only pepper for challenge verifiers and binding digests.
 *
 * FAIL CLOSED: a missing/short key throws, so the challenge routes 503 rather
 * than fall back to an unkeyed digest that a database leak could brute-force.
 * The value is never logged, never returned, and never reaches a client bundle
 * (this module is server-only — it imports `node:crypto`).
 */
export function getChallengeHmacKey(): Buffer {
  const raw = process.env.SENSITIVE_ACTION_CHALLENGE_KEY;
  if (!raw) {
    throw new Error("SENSITIVE_ACTION_CHALLENGE_KEY env var is not set.");
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length < 16) {
    throw new Error(
      "SENSITIVE_ACTION_CHALLENGE_KEY must decode to at least 16 bytes.",
    );
  }
  return buf;
}

/** True when the pepper is present and usable — for a typed 503 instead of a throw. */
export function isChallengeKeyConfigured(): boolean {
  try {
    getChallengeHmacKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * A cryptographically secure, UNIFORMLY distributed six-digit code.
 *
 * `randomInt(min, max)` is rejection-sampled by Node itself, so this has none of
 * the modulo bias a `randomBytes(…) % 1e6` would introduce. Leading zeros are
 * preserved by padding — "004217" is a legal code and must stay six characters.
 */
export function generateChallengeCode(): string {
  return String(randomInt(0, 10 ** CHALLENGE_CODE_LENGTH)).padStart(
    CHALLENGE_CODE_LENGTH,
    "0",
  );
}

/** Structural check for user-submitted code input (cheap pre-check before hashing). */
export function isWellFormedChallengeCode(value: string): boolean {
  return new RegExp(`^\\d{${CHALLENGE_CODE_LENGTH}}$`).test(value);
}

/**
 * Normalize a pasted code: users paste "123 456" / "123-456" from an email or a
 * password manager. Whitespace and dashes are stripped before validation so a
 * legitimate paste is not rejected as a wrong code (which would burn an attempt).
 */
export function normalizeChallengeCodeInput(value: string): string {
  return value.replace(/[\s-]/g, "");
}

export interface ChallengeVerifierInput {
  purpose: SensitiveActionPurpose;
  userId: string;
  /** The challenge row's opaque id — makes the verifier unique per issuance. */
  challengeId: string;
  code: string;
}

/**
 * The only representation of a code that is ever persisted:
 * `HMAC-SHA256(pepper, "<purpose>:<userId>:<challengeId>:<code>")`, hex.
 *
 * Because purpose/user/challenge are inside the MAC, a verifier row is worthless
 * outside the exact (purpose, user, challenge) it was minted for — a stolen row
 * cannot be replayed against another purpose even if the pepper leaked.
 */
export function deriveChallengeVerifier(input: ChallengeVerifierInput): string {
  return createHmac("sha256", getChallengeHmacKey())
    .update(`${input.purpose}:${input.userId}:${input.challengeId}:${input.code}`)
    .digest("hex");
}

/**
 * Keyed digest of an opaque binding value (the auth session id, the verified
 * email). Stored instead of the value itself so a database dump reveals neither
 * a live session identifier nor a user's address, while equality checks still
 * work exactly.
 */
export function deriveBindingDigest(kind: string, value: string): string {
  return createHmac("sha256", getChallengeHmacKey())
    .update(`${kind}:${value}`)
    .digest("hex");
}

/** Session-binding digest — a code minted in one session can't be used in another. */
export function deriveSessionBinding(sessionId: string): string {
  return deriveBindingDigest("session", sessionId);
}

/**
 * Email-binding digest over the NORMALIZED address. If the account's primary
 * email changes after a code is issued, the recomputed digest no longer matches
 * and the challenge is refused — the code went to an address that is no longer
 * the account's.
 */
export function deriveEmailBinding(email: string): string {
  return deriveBindingDigest("email", normalizeEmail(email));
}

/** Lowercase + trim. The same normalization the invitation flow applies. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Constant-time comparison of two hex digests. Mirrors
 * `core/apiKeys/keys.ts:timingSafeEqualHex` — duplicated rather than imported so
 * the security-sensitive comparison of THIS module has no cross-feature coupling
 * (an API-key refactor must not be able to silently weaken challenge checks).
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Mask an address for display: `chainreactapp@gmail.com` → `c••••••••@gmail.com`.
 *
 * The user is already authenticated, so this is defence against shoulder-surfing
 * and screenshots rather than against the user themselves. The bullet run is
 * capped so a very long local part doesn't disclose its exact length, and a
 * single-character local part is masked entirely rather than rendered in full.
 */
const MAX_MASK_BULLETS = 8;
export function maskEmail(email: string): string {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at <= 0) return "•••";
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (!domain) return "•••";
  const bullets = "•".repeat(Math.min(Math.max(local.length - 1, 3), MAX_MASK_BULLETS));
  const head = local.length > 1 ? local[0] : "";
  return `${head}${bullets}@${domain}`;
}

// ── Pure state evaluation ─────────────────────────────────────────────────────
// The service layer loads a row and asks THESE functions what it means. Keeping
// the decision pure is what makes "expired", "locked", "already consumed", and
// "verification window elapsed" exhaustively testable without a database.

/** The subset of a persisted challenge the pure evaluator needs. */
export interface ChallengeStateView {
  purpose: string;
  userId: string;
  sessionBinding: string;
  emailBinding: string;
  expiresAt: string;
  attemptCount: number;
  maxAttempts: number;
  verifiedAt: string | null;
  verificationExpiresAt: string | null;
  consumedAt: string | null;
  invalidatedAt: string | null;
}

/**
 * Why a challenge cannot be used. These are INTERNAL reasons: routes map them to
 * a small typed set of client codes and never echo the binding mismatches, which
 * would tell an attacker which of user / session / purpose / email was wrong.
 */
export type ChallengeRejection =
  | "not_found"
  | "invalidated"
  | "consumed"
  | "expired"
  | "locked"
  | "user_mismatch"
  | "session_mismatch"
  | "purpose_mismatch"
  | "email_changed"
  | "not_verified"
  | "verification_expired";

export interface ChallengeBindings {
  purpose: SensitiveActionPurpose;
  userId: string;
  sessionBinding: string;
  emailBinding: string;
}

/**
 * Is this row usable for a VERIFICATION attempt right now? Checks bindings,
 * lifecycle, expiry, and the attempt cap — everything except the code itself.
 */
export function evaluateChallengeForVerification(
  row: ChallengeStateView | null,
  bindings: ChallengeBindings,
  now: Date,
): ChallengeRejection | null {
  const base = evaluateBaseUsability(row, bindings, now);
  if (base) return base;
  const r = row as ChallengeStateView;
  if (r.attemptCount >= r.maxAttempts) return "locked";
  return null;
}

/**
 * Is this row a live AUTHORIZATION for the destructive action? Everything
 * `evaluateChallengeForVerification` checks (minus the attempt cap, which is
 * about guessing the code, not about using a verification that already
 * succeeded), plus: it must be verified and still inside the short
 * post-verification window.
 */
export function evaluateChallengeForConsumption(
  row: ChallengeStateView | null,
  bindings: ChallengeBindings,
  now: Date,
): ChallengeRejection | null {
  const base = evaluateBaseUsability(row, bindings, now);
  if (base) return base;
  const r = row as ChallengeStateView;
  if (!r.verifiedAt) return "not_verified";
  if (
    !r.verificationExpiresAt ||
    new Date(r.verificationExpiresAt).getTime() <= now.getTime()
  ) {
    return "verification_expired";
  }
  return null;
}

function evaluateBaseUsability(
  row: ChallengeStateView | null,
  bindings: ChallengeBindings,
  now: Date,
): ChallengeRejection | null {
  if (!row) return "not_found";
  if (row.consumedAt) return "consumed";
  if (row.invalidatedAt) return "invalidated";
  if (row.purpose !== bindings.purpose) return "purpose_mismatch";
  if (row.userId !== bindings.userId) return "user_mismatch";
  if (!timingSafeEqualHex(row.sessionBinding, bindings.sessionBinding)) {
    return "session_mismatch";
  }
  if (!timingSafeEqualHex(row.emailBinding, bindings.emailBinding)) {
    return "email_changed";
  }
  if (new Date(row.expiresAt).getTime() <= now.getTime()) return "expired";
  return null;
}

/** When may this challenge be re-sent? (Throttle floor from the last send.) */
export function resendAvailableAt(lastSentAt: string): Date {
  return new Date(new Date(lastSentAt).getTime() + CHALLENGE_RESEND_INTERVAL_MS);
}
