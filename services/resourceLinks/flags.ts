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

/**
 * Second, INDEPENDENT gate for "Confirm all exact VIN matches" (CS-5).
 *
 * DEFAULT OFF, and off for a specific, evidence-based reason rather than
 * caution-in-general:
 *
 * Bulk confirm writes N mappings from one click. Its safety rests entirely on
 * the premise that VIN is present and correct on BOTH sides — and the CS-5 brief
 * required verifying that against a real Fleetio account before enabling it. The
 * development database contains **zero** connected Fleetio integrations
 * (verified read-only during CS-5), so `GET /vehicles` could not be observed and
 * the premise is UNTESTED against live data. Fleetio's 2025-05-05 schema
 * *declares* `vin`, but schema presence is not population — plenty of fleets
 * leave VIN blank, and a projection that silently returns null for every vehicle
 * would make bulk confirm a no-op at best.
 *
 * Nothing else is gated by this. Individual confirmation of a VIN-tier
 * suggestion stays available with the flag off: a human is reading the evidence
 * and clicking one row, which is safe regardless of how well-populated the field
 * is across the fleet. This flag governs ONLY the multi-write shortcut.
 *
 * To lift it: connect a real Fleetio account, confirm `vin` is populated on
 * `GET /vehicles`, record the finding in the plan doc, then set the env var.
 */
export const VEHICLE_VIN_BULK_CONFIRM_FLAG = "ENABLE_VEHICLE_VIN_BULK_CONFIRM";

/**
 * DEFAULT OFF. Requires the Vehicle Links surface to be on as well — a bulk
 * action cannot be reachable when the screen that offers it does not exist.
 */
export function isVinBulkConfirmEnabled(): boolean {
  return (
    isResourceLinksUiEnabled() &&
    process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG] === "true"
  );
}
