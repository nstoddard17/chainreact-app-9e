/**
 * Mobile API rollout flag (MOBILE-COMPANION-M1-MOBILE-READ-API-1).
 *
 * Read at call time (not module load) so tests + rollout can toggle without
 * re-importing — mirrors services/apiKeys/flags.ts. DEFAULT OFF: only the
 * literal string "true" enables; missing, empty, "TRUE", "1", or any other
 * value stays OFF. While OFF, every `/api/mobile/v1/*` route (app-config
 * included — no safer exception exists in the current architecture) returns
 * a bare no-leak 404.
 *
 * Server-only. Never exposed to clients; the raw env value never leaves this
 * module. Development enablement happens via the branch-scoped `v2-dev`
 * Vercel Preview variable — never a code default.
 */

export const MOBILE_API_FLAG = "ENABLE_MOBILE_API";

export function isMobileApiEnabled(): boolean {
  return process.env[MOBILE_API_FLAG] === "true";
}
