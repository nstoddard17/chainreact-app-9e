/**
 * Vehicle-Links UI rollout flag (5.TRUCK-BRIDGE-1 CS-4, launched in CS-6).
 *
 * Read at CALL time (not module load) so tests + rollout can toggle without
 * re-importing — mirrors `services/apiKeys/flags.ts` and
 * `services/teamCredentials/flags.ts`.
 *
 * ── DEFAULT ON as of CS-6 ──────────────────────────────────────────────────
 * The arc shipped: the table (CS-1), the matcher (CS-2), the runtime action
 * (CS-3), the management screen (CS-4), suggestions + health (CS-5), and the
 * end-to-end engine walkthrough (CS-6) are all landed and covered. The feature
 * is inert for anyone who has not connected Motive AND Fleetio — with no
 * connection the screen renders its "connect both apps" state, no suggestion is
 * computed, and no workflow behavior changes — so enabling it by default cannot
 * disturb an existing user.
 *
 * `ENABLE_RESOURCE_LINKS_UI=false` is the explicit kill switch. While off:
 *   - `/apps/vehicle-links` returns 404 (`notFound()`),
 *   - every vehicle-link route answers 404 with no membership/existence signal,
 *   - the Apps entry link is not rendered,
 *   - the `link_vehicles` run-failure CTA is stripped by the serving layer
 *     (`filterVehicleLinksCta`) so nothing points at a 404,
 *   - and CS-3's `fleetio:find_linked_vehicle` KEEPS WORKING for any link that
 *     already exists. The flag gates the MANAGEMENT SURFACE, never the runtime
 *     lookup — turning it off must not break a workflow that is already running.
 *
 * The plan (§9) names this flag `RESOURCE_LINKS_UI`; the env var follows the
 * project-wide `ENABLE_<NAME>` convention from CLAUDE.md.
 */

/** Env var gating the Vehicle Links management surface. */
export const RESOURCE_LINKS_UI_FLAG = "ENABLE_RESOURCE_LINKS_UI";

/**
 * DEFAULT ON (CS-6 launch). Only the exact string `"false"` disables it, so a
 * typo or an unrelated value cannot silently take the feature away — the same
 * fail-visible posture the OFF-by-default flags use in reverse.
 */
export function isResourceLinksUiEnabled(): boolean {
  return process.env[RESOURCE_LINKS_UI_FLAG] !== "false";
}

/**
 * Strip a `link_vehicles` CTA when the Vehicle Links surface is disabled.
 *
 * The classification itself is PURE and persisted as history — a run that
 * failed while the feature was on keeps `action: "link_vehicles"` on its row
 * forever, which is correct. What must not happen is a UI rendering that action
 * as a button pointing at a 404. This is the single serving-layer chokepoint
 * that both run-DTO mappers call, so every surface (runs list, run detail,
 * builder run panel) is covered without threading a server flag into three
 * client components.
 *
 * Any other action passes through untouched.
 */
export function filterVehicleLinksCta<T extends string>(
  action: T | undefined,
): T | undefined {
  if (action === "link_vehicles" && !isResourceLinksUiEnabled()) return undefined;
  return action;
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
