import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Pure API-key crypto/format helpers (Slice 4.API-KEYS-FOUNDATION-2 / FK-1).
 *
 * No DB, no I/O, no OAuth/integration tokens. A key is HIGH-ENTROPY (≥256 bits of
 * `randomBytes`), so a plain unsalted SHA-256 is the correct one-way primitive —
 * bcrypt/argon2 are for low-entropy passwords and are deliberately NOT used (no new
 * dependency). The raw key is shown ONCE at creation (FK-2) and never stored; only
 * `key_hash` (sha256 hex) + a non-secret display `prefix` are persisted.
 *
 * Format: `crk_<env>_<base64url tail>` — a recognizable, secret-scanner-friendly
 * `crk_` prefix, env-segmented (`live` | `test`) so a test key can never be mistaken
 * for a live credential.
 */

export type ApiKeyEnv = "live" | "test";

/** Random bytes in the secret tail → 48 base64url chars (≈288 bits). */
const KEY_TAIL_BYTES = 36;
/** Length of the stored/displayed non-secret prefix: `crk_live_` (9) + 8 tail chars. */
export const API_KEY_PREFIX_LENGTH = 17;

/** Accepts a well-formed raw key: `crk_live_…` / `crk_test_…` with a long tail. */
const API_KEY_FORMAT = /^crk_(live|test)_[A-Za-z0-9_-]{40,}$/;

export interface GeneratedApiKey {
  /** The raw key — returned to the caller exactly ONCE (FK-2). NEVER stored. */
  raw: string;
  /** Non-secret display identifier, stored + shown in the UI. */
  prefix: string;
  /** sha256(raw) hex — the only key material persisted. */
  keyHash: string;
}

/** Mint a fresh high-entropy key with its derived prefix + hash. */
export function generateApiKey(env: ApiKeyEnv): GeneratedApiKey {
  const tail = randomBytes(KEY_TAIL_BYTES).toString("base64url");
  const raw = `crk_${env}_${tail}`;
  return { raw, prefix: deriveApiKeyPrefix(raw), keyHash: hashApiKey(raw) };
}

/** One-way SHA-256 (hex) of a raw key. Deterministic; the verification primitive. */
export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** The non-secret leading segment stored as `prefix` (e.g. `crk_live_AbCd1234`). */
export function deriveApiKeyPrefix(raw: string): string {
  return raw.slice(0, API_KEY_PREFIX_LENGTH);
}

/** Structural validation of a raw key string (cheap pre-check before hashing). */
export function isValidApiKeyFormat(raw: string): boolean {
  return API_KEY_FORMAT.test(raw);
}

/**
 * Extract a well-formed raw key from an `Authorization: Bearer crk_…` header, or
 * null. Used by the FK-4 verify guard; pure string handling, no lookup.
 */
export function parseBearerApiKey(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(crk_[A-Za-z0-9_-]+)$/.exec(header.trim());
  if (!match) return null;
  return isValidApiKeyFormat(match[1]!) ? match[1]! : null;
}

/**
 * Constant-time equality of two hex-encoded SHA-256 digests (mirrors the
 * `requireCronAuth` `timingSafeEqual` discipline). Length-guards before comparing
 * so unequal-length inputs never throw.
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
