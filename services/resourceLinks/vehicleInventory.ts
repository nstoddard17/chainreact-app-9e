import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { vehicleList } from "@/integrations/_shared/motive/api/vehicles";
import { fleetioListVehicles } from "@/integrations/fleetio/api/vehicles";
import { runFleetioApiCall } from "@/integrations/fleetio/execute";
import type {
  SourceVehicleIdentity,
  TargetVehicleIdentity,
} from "@/core/resourceLinks/matchSignals";

/**
 * Account-scoped vehicle INVENTORY for the Vehicle Links screen
 * (5.TRUCK-BRIDGE-1 CS-5).
 *
 * ── Why this exists alongside `vehicleOptions.ts` ──────────────────────────
 * The CS-4 module returns PICKER options — `{ value, label }` — because that is
 * all a dropdown needs. Matching needs the vehicle's IDENTITY: VIN, plate, unit
 * number, name. Those fields are already on the same single page both providers
 * return (`ProjectedMotiveVehicle`, and the CS-2-widened `FleetioVehicleSummary`),
 * so this module reads the SAME endpoints through the SAME account seams and
 * keeps the extra fields the option projection deliberately discards.
 *
 * **No new API traffic per vehicle, no new endpoint, no new resolver.** Motive
 * goes through `refreshAndRetry` (its canonical OAuth seam); Fleetio goes
 * through `runFleetioApiCall` (its canonical two-credential seam). Both resolve
 * the integration from the ACCOUNT — never a personal fallback, never
 * `connected_by_user_id`.
 *
 * ── Labels are computed here, and pinned to the resolvers ──────────────────
 * The screen also needs a display label per vehicle, and it must be the SAME
 * label the pickers show or the Unlinked list and the Fleetio picker would
 * disagree about what a truck is called. The two `labelFor*` functions below
 * reproduce the resolvers' rules exactly, and a test asserts they agree with
 * `motive:vehicles` / `fleetio:vehicles` for the same input — so drift fails in
 * unit tests rather than as a confusing screen.
 *
 * ── No-leak posture ────────────────────────────────────────────────────────
 * Callers get `{ status, vehicles }`. A missing connection is `disconnected`;
 * ANY thrown failure collapses to `error` with NO message, so no provider host,
 * status code, body, or credential can reach a caller. Identity fields (VIN,
 * plate) stay SERVER-SIDE — the service layer feeds them to the pure matcher and
 * ships only rendered evidence strings to the browser.
 */

/** One bounded page, matching the resolvers' existing page size. */
const PAGE_SIZE = 100;

export type VehicleInventoryStatus = "ok" | "disconnected" | "error";

export interface MotiveInventoryEntry {
  readonly identity: SourceVehicleIdentity;
  readonly label: string;
}

export interface FleetioInventoryEntry {
  readonly identity: TargetVehicleIdentity;
  readonly label: string;
  /** Non-null when Fleetio reported the vehicle as archived. */
  readonly archivedAt: string | null;
}

export interface MotiveInventory {
  readonly status: VehicleInventoryStatus;
  readonly vehicles: readonly MotiveInventoryEntry[];
  readonly hasMore: boolean;
}

export interface FleetioInventory {
  readonly status: VehicleInventoryStatus;
  readonly vehicles: readonly FleetioInventoryEntry[];
  readonly hasMore: boolean;
}

/**
 * Mirrors `integrations/motive/options/vehicles.ts`: unit number, plus
 * make/model context to disambiguate duplicates, falling back to the id. Never
 * emits an "undefined"-bearing string.
 */
export function labelForMotiveVehicle(v: {
  vehicleId: string;
  number: string | null;
  make: string | null;
  model: string | null;
}): string {
  const primary = v.number?.trim();
  const context = [v.make?.trim(), v.model?.trim()]
    .filter((part): part is string => !!part && part.length > 0)
    .join(" ");
  if (primary && primary.length > 0) return context ? `${primary} — ${context}` : primary;
  return context || v.vehicleId;
}

/** Mirrors `integrations/fleetio/options/vehicles.ts`. */
export function labelForFleetioVehicle(v: { vehicleId: string; name: string | null }): string {
  const name = v.name?.trim();
  if (name && name.length > 0) return name;
  return `Vehicle ${v.vehicleId}`;
}

const EMPTY_MOTIVE: MotiveInventory = { status: "error", vehicles: [], hasMore: false };
const EMPTY_FLEETIO: FleetioInventory = { status: "error", vehicles: [], hasMore: false };

/**
 * One bounded page of the account's Motive vehicles, with identity intact.
 * Never throws: every failure mode is a typed `status`, because the screen
 * renders a distinct state for each and must distinguish "no connection" from
 * "list unavailable" (the latter must NOT make every mapping look deleted).
 */
export async function loadMotiveInventory(input: {
  accountId: string;
}): Promise<MotiveInventory> {
  // This pre-lookup exists to tell "no connection" (a setup step the user can
  // take) apart from "the call failed" (retry) — a distinction the screen
  // renders differently and the health check depends on, since an outage must
  // never make every mapping look deleted. `refreshAndRetry` performs its own
  // account-scoped lookup afterwards; the duplicate is one indexed query and is
  // the honest price of that distinction.
  let integration;
  try {
    integration = await getActiveForExecution(input.accountId, "motive", null);
  } catch {
    return EMPTY_MOTIVE;
  }
  if (integration === null) {
    return { status: "disconnected", vehicles: [], hasMore: false };
  }

  try {
    const vehicles = await refreshAndRetry({
      accountId: integration.accountId,
      provider: "motive",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) => vehicleList({ accessToken, perPage: PAGE_SIZE }),
    });
    const entries: MotiveInventoryEntry[] = [];
    for (const v of vehicles) {
      // A vehicle with no id cannot be linked to anything — skip rather than
      // fabricate a key the confirm path could not use.
      if (!v.vehicleId) continue;
      entries.push({
        identity: {
          vehicleId: v.vehicleId,
          number: v.number,
          vin: v.vin,
          licensePlateNumber: v.licensePlateNumber,
        },
        label: labelForMotiveVehicle({
          vehicleId: v.vehicleId,
          number: v.number,
          make: v.make,
          model: v.model,
        }),
      });
    }
    return { status: "ok", vehicles: entries, hasMore: vehicles.length === PAGE_SIZE };
  } catch {
    // Deliberately message-free — see the module header.
    return EMPTY_MOTIVE;
  }
}

/** One bounded page of the account's Fleetio vehicles, with identity intact. */
export async function loadFleetioInventory(input: {
  accountId: string;
}): Promise<FleetioInventory> {
  try {
    const page = await runFleetioApiCall({
      accountId: input.accountId,
      apiCall: (credentials) =>
        fleetioListVehicles({
          apiKey: credentials.apiKey,
          accountToken: credentials.accountToken,
          perPage: PAGE_SIZE,
        }),
    });
    const entries: FleetioInventoryEntry[] = page.vehicles.map((v) => {
      const vehicleId = String(v.id);
      return {
        identity: {
          vehicleId,
          name: v.name,
          vin: v.vin,
          licensePlate: v.license_plate,
        },
        label: labelForFleetioVehicle({ vehicleId, name: v.name }),
        archivedAt: v.archived_at,
      };
    });
    return { status: "ok", vehicles: entries, hasMore: page.nextCursor !== null };
  } catch (err) {
    // `runFleetioApiCall` throws a plain Error when the account has no active
    // Fleetio row — the honest reading is "not connected", which the screen
    // renders as a setup step rather than a failure.
    const message = err instanceof Error ? err.message : "";
    if (/no active Fleetio integration/i.test(message)) {
      return { status: "disconnected", vehicles: [], hasMore: false };
    }
    return EMPTY_FLEETIO;
  }
}
