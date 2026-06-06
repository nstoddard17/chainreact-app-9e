/**
 * Public-API-keys rollout flag (Slice 4.API-KEYS-FOUNDATION-2 / FK-1).
 *
 * Read at call time (not module load) so tests + rollout can toggle without
 * re-importing — mirrors services/teamCredentials/flags.ts.
 *
 * FK-1 ONLY exposes the helper; it wires NO behavior to it. The flag gates the
 * PUBLIC trigger endpoint (`POST /api/v1/workflows/[id]/trigger`) in FK-4, which
 * stays dark until a rate limiter lands. Key creation / management / verification
 * libraries are unaffected by it. Default OFF.
 */

/** Env var gating the public API-key trigger endpoint. */
export const PUBLIC_API_KEYS_FLAG = "ENABLE_PUBLIC_API_KEYS";

/**
 * DEFAULT OFF. When false, FK-4's public trigger route must not be reachable. FK-1
 * never calls this — it exists for the slice that ships the public endpoint.
 */
export function isPublicApiKeysEnabled(): boolean {
  return process.env[PUBLIC_API_KEYS_FLAG] === "true";
}
