import { createHash, randomBytes } from "node:crypto";
import { timingSafeEqualHex } from "@/core/apiKeys/keys";

/**
 * Pure MCP-token crypto/format helpers (Slice 4.PUBLIC-MCP-1).
 *
 * No DB, no I/O, no OAuth/integration tokens. An MCP token is HIGH-ENTROPY (≥256
 * bits of `randomBytes`), so a plain unsalted SHA-256 is the correct one-way
 * primitive — bcrypt/argon2 are for low-entropy passwords and are deliberately NOT
 * used (no new dependency). The raw token is shown ONCE at creation and never
 * stored; only `tokenHash` (sha256 hex) + a non-secret display `prefix` persist.
 *
 * Format: `crmcp_<base64url tail>` — a recognizable, secret-scanner-friendly
 * `crmcp_` prefix that is DISTINCT from the workflow-trigger API key prefix
 * (`crk_…`). The distinct prefix is a hard guard: an MCP token can never be parsed
 * as an API key (and vice versa), so the two credential surfaces never cross.
 *
 * `timingSafeEqualHex` is the same generic constant-time hex comparator the API-key
 * verify path uses — reused here, not re-implemented.
 */

/** Random bytes in the secret tail → 48 base64url chars (≈288 bits). */
const TOKEN_TAIL_BYTES = 36;
/** Length of the stored/displayed non-secret prefix: `crmcp_` (6) + 8 tail chars. */
export const MCP_TOKEN_PREFIX_LENGTH = 14;

/** Accepts a well-formed raw token: `crmcp_…` with a long base64url tail. */
const MCP_TOKEN_FORMAT = /^crmcp_[A-Za-z0-9_-]{40,}$/;

export interface GeneratedMcpToken {
  /** The raw token — returned to the caller exactly ONCE. NEVER stored. */
  raw: string;
  /** Non-secret display identifier, stored + shown in the UI. */
  prefix: string;
  /** sha256(raw) hex — the only token material persisted. */
  tokenHash: string;
}

/** Mint a fresh high-entropy MCP token with its derived prefix + hash. */
export function generateMcpToken(): GeneratedMcpToken {
  const tail = randomBytes(TOKEN_TAIL_BYTES).toString("base64url");
  const raw = `crmcp_${tail}`;
  return { raw, prefix: deriveMcpTokenPrefix(raw), tokenHash: hashMcpToken(raw) };
}

/** One-way SHA-256 (hex) of a raw token. Deterministic; the verification primitive. */
export function hashMcpToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** The non-secret leading segment stored as `prefix` (e.g. `crmcp_AbCd1234`). */
export function deriveMcpTokenPrefix(raw: string): string {
  return raw.slice(0, MCP_TOKEN_PREFIX_LENGTH);
}

/** Structural validation of a raw token string (cheap pre-check before hashing). */
export function isValidMcpTokenFormat(raw: string): boolean {
  return MCP_TOKEN_FORMAT.test(raw);
}

/**
 * Extract a well-formed raw token from an `Authorization: Bearer crmcp_…` header,
 * or null. Pure string handling, no lookup. Rejects `crk_…` API keys — they don't
 * match the `crmcp_` shape, so the wrong credential type never reaches the lookup.
 */
export function parseBearerMcpToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(crmcp_[A-Za-z0-9_-]+)$/.exec(header.trim());
  if (!match) return null;
  return isValidMcpTokenFormat(match[1]!) ? match[1]! : null;
}

export { timingSafeEqualHex };
