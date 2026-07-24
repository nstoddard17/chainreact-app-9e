import { listVehicleLinks, unlinkedVehicles } from "./vehicleLinkService";
import { loadMotiveInventory } from "./vehicleInventory";

/**
 * Apps-page bridge summary (APPS-VL-DESIGN-1).
 *
 * The `/apps` "Bridge" panel needs a truthful, cheap read of how far the
 * Motive→Fleetio vehicle pairing has progressed, WITHOUT re-running the full
 * suggestion matcher (which would add a second Motive load + a Fleetio load to a
 * hot page). So this reads only:
 *   - `listVehicleLinks` (DB; any member may read) → the paired count, and
 *   - `loadMotiveInventory` (one account-scoped Motive call) → the fleet size,
 *     from which the unpaired remainder is a pure set difference.
 *
 * The caller (the Apps page) only invokes this when BOTH Motive and Fleetio are
 * connected and the Vehicle-Links surface flag is on — so the single provider
 * call is scoped to fleet users who are actually looking at a fleet page.
 *
 * NO provider host, token, id, or raw payload leaves here — only counts and a
 * coarse availability flag. The full suggestion set (and its "waiting on you"
 * count) lives on `/apps/vehicle-links`, not in this summary.
 */
export interface VehicleBridgeSummary {
  /** Confirmed Motive→Fleetio links for the account. */
  readonly pairedCount: number;
  /** Motive vehicles with no active link (only meaningful when `motiveOk`). */
  readonly unpairedCount: number;
  /** paired + unpaired — the fleet size ChainReact can currently see. */
  readonly totalCount: number;
  /**
   * True when the Motive list loaded cleanly. When false (disconnected/error)
   * the unpaired/total figures are not trustworthy, so the UI shows only the
   * paired count and a plain "review" affordance.
   */
  readonly motiveOk: boolean;
  /** The Motive list was truncated, so a truck further down may not be counted. */
  readonly partialInventory: boolean;
}

export async function loadVehicleBridgeSummary(input: {
  accountId: string;
  actingUserId: string;
}): Promise<VehicleBridgeSummary> {
  const [linksResult, motive] = await Promise.all([
    listVehicleLinks({ accountId: input.accountId, actingUserId: input.actingUserId }),
    loadMotiveInventory({ accountId: input.accountId }),
  ]);

  const links = linksResult.ok ? linksResult.links : [];
  const pairedCount = links.length;
  const motiveOk = motive.status === "ok";

  if (!motiveOk) {
    return {
      pairedCount,
      unpairedCount: 0,
      totalCount: pairedCount,
      motiveOk: false,
      partialInventory: false,
    };
  }

  const motiveOptions = motive.vehicles.map((v) => ({
    value: v.identity.vehicleId,
    label: v.label,
  }));
  const unpairedCount = unlinkedVehicles(motiveOptions, links).length;

  return {
    pairedCount,
    unpairedCount,
    totalCount: pairedCount + unpairedCount,
    motiveOk: true,
    partialInventory: motive.hasMore,
  };
}
