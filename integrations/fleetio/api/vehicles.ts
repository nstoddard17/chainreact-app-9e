import { fleetioRequest, FleetioMalformedResponseError } from "./_request";

/**
 * Fleetio Vehicles API wrappers (FLEETIO-2).
 *
 * Only the two endpoints this slice needs:
 *   - `GET /vehicles/{id}` (Vehicles::Show) — one vehicle by id (Get Vehicle action).
 *   - `GET /vehicles`      (Vehicles::Index) — one keyset page for the resolver;
 *     the endpoint EXCLUDES archived vehicles by default, and `filter[name][like]`
 *     powers search.
 *
 * Both send the two Fleetio auth headers + pinned `X-Api-Version` via
 * `fleetioRequest`. Only the fields the callers consume are typed; the raw
 * Fleetio record is NEVER spread into an output or option (bounded-output /
 * no-leak discipline). Provider host / pagination links are never surfaced —
 * pagination rides the opaque `next_cursor` only.
 */

/** The vehicle fields Get Vehicle reads (a subset of Fleetio's Vehicle-2). */
export interface FleetioVehicle {
  id: number;
  name: string | null;
  vin: string | null;
  license_plate: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  vehicle_status_id: number | null;
  vehicle_status_name: string | null;
  current_meter_value: number | null;
  meter_unit: string | null;
  archived_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** The vehicle-summary fields the resolver reads (a subset of Fleetio's VehicleSummary). */
export interface FleetioVehicleSummary {
  id: number;
  name: string | null;
  vehicle_status_name: string | null;
  vehicle_type_name: string | null;
  archived_at: string | null;
}

interface VehiclesListEnvelope {
  records?: unknown;
  next_cursor?: unknown;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
function num(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/** Project a raw Fleetio vehicle record into the typed subset (bounded). */
function toVehicle(raw: unknown): FleetioVehicle {
  const v = (raw ?? {}) as Record<string, unknown>;
  return {
    id: typeof v.id === "number" ? v.id : Number(v.id),
    name: str(v.name),
    vin: str(v.vin),
    license_plate: str(v.license_plate),
    make: str(v.make),
    model: str(v.model),
    year: num(v.year),
    vehicle_status_id: num(v.vehicle_status_id),
    vehicle_status_name: str(v.vehicle_status_name),
    current_meter_value: num(v.current_meter_value),
    meter_unit: str(v.meter_unit),
    archived_at: str(v.archived_at),
    created_at: str(v.created_at),
    updated_at: str(v.updated_at),
  };
}

function toVehicleSummary(raw: unknown): FleetioVehicleSummary | null {
  const v = (raw ?? {}) as Record<string, unknown>;
  if (typeof v.id !== "number") return null;
  return {
    id: v.id,
    name: str(v.name),
    vehicle_status_name: str(v.vehicle_status_name),
    vehicle_type_name: str(v.vehicle_type_name),
    archived_at: str(v.archived_at),
  };
}

/**
 * `GET /vehicles/{id}`. Throws `FleetioNotFoundError("vehicle <id>")` on 404;
 * 401/403/429/5xx/timeout per the `_request` mapping. The id is path-encoded.
 */
export async function fleetioGetVehicle(input: {
  apiKey: string;
  accountToken: string;
  vehicleId: string;
}): Promise<FleetioVehicle> {
  const raw = await fleetioRequest<unknown>({
    apiKey: input.apiKey,
    accountToken: input.accountToken,
    method: "GET",
    path: `/vehicles/${encodeURIComponent(input.vehicleId)}`,
    resourceForNotFound: `vehicle ${input.vehicleId}`,
  });
  return toVehicle(raw);
}

/**
 * `PATCH /vehicles/{id}` (Vehicles::Update) — set ONE vehicle's status
 * (FLEETIO-3). The request body is an EXPLICITLY constructed object containing
 * ONLY `vehicle_status_id` (the numeric wire type per the `Id` schema) — caller
 * input is never spread, and no other vehicle field is exposed. Fleetio returns
 * the updated `Vehicle-2` on 200, which we project into the SAME bounded subset.
 *
 * Status codes (per the 2025-05-05 schema): 200 (updated Vehicle), 401, 403,
 * 404, **422** (validation — `{errors:{field:string[]}}`), 500. There is NO
 * documented 409 for vehicle updates. The write is NOT auto-retried on 429
 * (method-aware wrapper policy).
 */
export async function fleetioUpdateVehicleStatus(input: {
  apiKey: string;
  accountToken: string;
  vehicleId: string;
  /** Numeric Fleetio status id (validated + converted by the caller). */
  vehicleStatusId: number;
}): Promise<FleetioVehicle> {
  const raw = await fleetioRequest<unknown>({
    apiKey: input.apiKey,
    accountToken: input.accountToken,
    method: "PATCH",
    path: `/vehicles/${encodeURIComponent(input.vehicleId)}`,
    resourceForNotFound: `vehicle ${input.vehicleId}`,
    // Explicit body — ONLY the status field; never spread caller input.
    body: { vehicle_status_id: input.vehicleStatusId },
  });
  const vehicle = toVehicle(raw);
  // Reject a malformed 2xx (e.g. no vehicle id) — the caller must not emit
  // fabricated output. The label names only the resource, never the body.
  if (!Number.isFinite(vehicle.id)) {
    throw new FleetioMalformedResponseError(`vehicle ${input.vehicleId}`);
  }
  return vehicle;
}

/**
 * `GET /vehicles` — ONE keyset page. Archived vehicles are excluded by the
 * endpoint default. `q` (when non-empty) is passed server-side as
 * `filter[name][like]`. Returns the bounded records + the opaque `next_cursor`
 * (ChainReact never exposes provider hosts / pagination links — only this
 * opaque token).
 */
export async function fleetioListVehicles(input: {
  apiKey: string;
  accountToken: string;
  perPage: number;
  q?: string;
  startCursor?: string;
}): Promise<{ vehicles: FleetioVehicleSummary[]; nextCursor: string | null }> {
  const query = new URLSearchParams();
  query.set("per_page", String(input.perPage));
  const trimmed = input.q?.trim();
  if (trimmed) {
    // deepObject filter: filter[name][like]=<q> — Fleetio's documented
    // server-side name search.
    query.set("filter[name][like]", trimmed);
  }
  if (input.startCursor) {
    query.set("start_cursor", input.startCursor);
  }

  const raw = await fleetioRequest<VehiclesListEnvelope>({
    apiKey: input.apiKey,
    accountToken: input.accountToken,
    method: "GET",
    path: "/vehicles",
    query,
  });

  const records = Array.isArray(raw?.records) ? raw.records : [];
  const vehicles = records
    .map(toVehicleSummary)
    .filter((v): v is FleetioVehicleSummary => v !== null);
  const nextCursor = typeof raw?.next_cursor === "string" ? raw.next_cursor : null;
  return { vehicles, nextCursor };
}
