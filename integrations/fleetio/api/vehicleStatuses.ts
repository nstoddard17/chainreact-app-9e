import { fleetioRequest } from "./_request";

/**
 * Fleetio Vehicle Statuses API wrapper (FLEETIO-2).
 *
 * `GET /vehicle_statuses` (VehicleStatuses::Index) — the account's vehicle
 * statuses (a small, inherently-bounded catalog: "Active", "In Shop", "Out of
 * Service", …). One keyset page is fetched; `position` gives Fleetio's own
 * meaningful ordering, so the resolver sorts by it (then id) for determinism.
 *
 * Sends both auth headers + pinned `X-Api-Version`. Only the fields the
 * resolver consumes are typed; the raw record is never surfaced.
 */

export interface FleetioVehicleStatus {
  id: number;
  name: string | null;
  /** Provider-defined display order; lower = earlier. May be absent. */
  position: number | null;
}

interface VehicleStatusesEnvelope {
  records?: unknown;
}

function toVehicleStatus(raw: unknown): FleetioVehicleStatus | null {
  const v = (raw ?? {}) as Record<string, unknown>;
  if (typeof v.id !== "number") return null;
  return {
    id: v.id,
    name: typeof v.name === "string" ? v.name : null,
    position: typeof v.position === "number" ? v.position : null,
  };
}

/**
 * `GET /vehicle_statuses` — one bounded page of the account's statuses. 401/403/
 * 429/5xx/timeout per the `_request` mapping.
 */
export async function fleetioListVehicleStatuses(input: {
  apiKey: string;
  accountToken: string;
  perPage: number;
}): Promise<FleetioVehicleStatus[]> {
  const query = new URLSearchParams();
  query.set("per_page", String(input.perPage));

  const raw = await fleetioRequest<VehicleStatusesEnvelope>({
    apiKey: input.apiKey,
    accountToken: input.accountToken,
    method: "GET",
    path: "/vehicle_statuses",
    query,
  });

  const records = Array.isArray(raw?.records) ? raw.records : [];
  return records
    .map(toVehicleStatus)
    .filter((s): s is FleetioVehicleStatus => s !== null);
}
