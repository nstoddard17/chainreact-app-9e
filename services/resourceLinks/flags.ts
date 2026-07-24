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
 * ── DEFAULT ON as of VEHICLE-LINKS-BULK-1 ──────────────────────────────────
 * Launched by default, mirroring `ENABLE_RESOURCE_LINKS_UI`: only the exact
 * string `"false"` disables it, so a typo or an unrelated value cannot silently
 * take the shortcut away. `ENABLE_VEHICLE_VIN_BULK_CONFIRM=false` is the explicit
 * kill switch.
 *
 * The flag was OFF-by-default historically because bulk confirm writes N mappings
 * from one click and that premise had not been observed against a real Fleetio
 * account. It is safe to enable by default because the multi-write's safety does
 * NOT rest on the flag — it rests on the server, which:
 *   - recomputes the eligible set itself (the browser cannot supply pairs),
 *   - restricts eligibility to the matcher's `bulkConfirmable` — an UNAMBIGUOUS
 *     tier-1 exact-VIN match only (plate / number / name / ambiguous VIN are
 *     never eligible), with both sides free of any active link and the pair not
 *     dismissed,
 *   - re-checks every write against the sources/targets already claimed earlier
 *     in the same batch, so two proposals can never both claim one Fleetio
 *     vehicle, and
 *   - counts any write that still loses a concurrency race as `skipped` rather
 *     than linking the wrong vehicle or failing the batch,
 * and the action is owner/admin only, triggered by an explicit click — loading
 * the page never writes anything. When VIN is sparsely populated the eligible set
 * is simply small; nothing unsafe is written.
 *
 * This flag governs ONLY the multi-write shortcut. Individual confirmation of a
 * VIN-tier suggestion is unaffected either way — a human reading one row's
 * evidence and clicking is safe regardless of the field's population.
 */
export const VEHICLE_VIN_BULK_CONFIRM_FLAG = "ENABLE_VEHICLE_VIN_BULK_CONFIRM";

/**
 * DEFAULT ON (VEHICLE-LINKS-BULK-1). Only the exact string `"false"` disables it.
 * Still requires the Vehicle Links surface to be on as well — a bulk action
 * cannot be reachable when the screen that offers it does not exist — so the
 * surface's own `="false"` kill switch also disables this.
 */
export function isVinBulkConfirmEnabled(): boolean {
  return (
    isResourceLinksUiEnabled() &&
    process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG] !== "false"
  );
}
