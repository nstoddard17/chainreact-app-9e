/**
 * Vehicle-Links UI rollout flag (5.TRUCK-BRIDGE-1 CS-4).
 *
 * Read at CALL time (not module load) so tests + rollout can toggle without
 * re-importing — mirrors `services/apiKeys/flags.ts` and
 * `services/teamCredentials/flags.ts`.
 *
 * DEFAULT OFF. While off:
 *   - `/apps/vehicle-links` returns a 404 (`notFound()`), so the surface does
 *     not exist for anyone,
 *   - every vehicle-link route answers 404 with no membership/existence signal,
 *   - nothing else changes. CS-1's table stays inert and CS-3's
 *     `fleetio:find_linked_vehicle` keeps working for any link row that already
 *     exists — the flag gates the MANAGEMENT SURFACE, not the runtime lookup.
 *     That separation is deliberate: flipping the flag off must never break a
 *     workflow that is already running.
 *
 * The plan (§9) names this flag `RESOURCE_LINKS_UI`; the env var follows the
 * project-wide `ENABLE_<NAME>` convention from CLAUDE.md.
 */

/** Env var gating the Vehicle Links management surface. */
export const RESOURCE_LINKS_UI_FLAG = "ENABLE_RESOURCE_LINKS_UI";

/** DEFAULT OFF — only the exact string "true" enables the surface. */
export function isResourceLinksUiEnabled(): boolean {
  return process.env[RESOURCE_LINKS_UI_FLAG] === "true";
}
