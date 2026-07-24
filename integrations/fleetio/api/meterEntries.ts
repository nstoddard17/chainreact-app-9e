import { fleetioRequest, FleetioMalformedResponseError } from "./_request";

/**
 * Fleetio Meter Entries API wrapper (FLEETIO-4).
 *
 * ONE endpoint this slice needs: `POST /meter_entries` (MeterEntries::Create) —
 * record an odometer / mileage / kilometer / engine-hours reading for a vehicle.
 *
 * **Contract verified against the 2025-05-05 OpenAPI schema** (not inferred):
 *
 *   - The create endpoint is TOP-LEVEL `POST /meter_entries`, NOT vehicle-nested.
 *     (`/vehicles/{id}/meter_entries` exists but is GET-only — "List Vehicle Meter
 *     Entries".) So `vehicle_id` travels in the BODY, never in the path.
 *   - Required body fields: `vehicle_id` (`Id` = integer ≥ 1), `value`
 *     (`number`/`format: float`), and `date` (`string`/`format: date-time`).
 *     **`date` is REQUIRED — Fleetio does NOT default it server-side.**
 *   - Optional body fields: `void` (boolean, default false) and `meter_type`
 *     (nullable string whose ONLY enum member is `"secondary"`). There is NO
 *     unit / meter-id / source / note / reason field on the create request —
 *     the unit is configured at the Account level and optionally overridden on
 *     the Vehicle (`Vehicle.meter_unit` / `secondary_meter_unit`, enum km|hr|mi).
 *     ChainReact therefore ships NO meter-unit picker (see the meta).
 *   - Primary vs secondary meter is expressed ONLY by `meter_type`: omitted /
 *     null ⇒ the vehicle's PRIMARY meter; `"secondary"` ⇒ the secondary meter.
 *     We OMIT the key for primary rather than sending an explicit null (both are
 *     accepted by the schema; omission is the narrower wire shape).
 *   - Sequence validation: "Meter Entries must follow the correct sequence,
 *     incrementing in value by date. For each entry, Fleetio validates to ensure
 *     that the value falls between any entries logged before and/or after." A
 *     lower / out-of-sequence reading therefore surfaces as **422**, not 409.
 *   - Documented statuses: **201**, 401, 422, 500. The endpoint documents NO
 *     400, NO 403, NO 404 and NO 409. (403 and 429 remain possible platform-wide
 *     — role gaps and per-account-token throttling — and the shared wrapper maps
 *     them; we simply do not claim the endpoint documents them.)
 *   - **No idempotency key.** The 2025-05-05 schema exposes `idempotency_key`
 *     ONLY on the Fault objects — never on meter entries. None is invented here.
 *
 * Write-safety: this is a POST, so the shared wrapper's METHOD-AWARE 429 policy
 * (FLEETIO-3) applies — no inline replay on 429, and a timeout / network failure
 * after transmission is an UNKNOWN outcome that is never auto-retried. Creating
 * the same reading twice would create two Meter Entries, so a duplicate must
 * never be risked automatically.
 *
 * Bounded + no-leak: the request body is constructed EXPLICITLY (caller input is
 * never spread), and the response is projected into a narrow typed subset — the
 * raw Fleetio record is never returned, and no provider host / header /
 * credential ever reaches a caller.
 */

/** The Meter Entry fields the Create Meter Entry output reads (a bounded subset). */
export interface FleetioMeterEntry {
  id: number;
  /** Fleetio returns `value` as a STRING on create (request takes a number). */
  value: string | null;
  /** `null` ⇒ primary meter; `"secondary"` ⇒ secondary meter. */
  meter_type: string | null;
  vehicle_id: number | null;
  void: boolean;
  /** Response `date` is `format: date` (date-only), not the date-time we send. */
  date: string | null;
  created_at: string | null;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Project a raw Fleetio meter-entry record into the typed subset (bounded). */
function toMeterEntry(raw: unknown): FleetioMeterEntry {
  const m = (raw ?? {}) as Record<string, unknown>;
  return {
    id: typeof m.id === "number" ? m.id : Number(m.id),
    // Fleetio documents `value` as a string; tolerate a numeric body without
    // inventing a second field — the declared output type stays `string`.
    value: typeof m.value === "number" ? String(m.value) : str(m.value),
    meter_type: str(m.meter_type),
    vehicle_id: typeof m.vehicle_id === "number" ? m.vehicle_id : null,
    // A missing `void` is treated as Fleetio's documented default (false) —
    // never as "unknown"; `false` is an explicit, preserved value.
    void: m.void === true,
    date: str(m.date),
    created_at: str(m.created_at),
  };
}

export interface CreateMeterEntryInput {
  apiKey: string;
  accountToken: string;
  /** Numeric Fleetio vehicle id (validated + converted by the caller). */
  vehicleId: number;
  /** The meter reading. Finite, non-negative; decimals preserved. */
  value: number;
  /** ISO-8601 date-time for the reading (Fleetio REQUIRES this). */
  date: string;
  /** `true` writes the vehicle's SECONDARY meter; `false` writes the primary. */
  secondaryMeter: boolean;
}

/**
 * `POST /meter_entries` (MeterEntries::Create). Returns the created Meter Entry
 * (201) projected into the bounded subset. A 2xx that carries no usable meter-
 * entry id throws `FleetioMalformedResponseError` so the caller can never emit a
 * fabricated id or claim a create that was not confirmed.
 */
export async function fleetioCreateMeterEntry(
  input: CreateMeterEntryInput,
): Promise<FleetioMeterEntry> {
  // EXPLICIT body — exactly the approved fields, in Fleetio wire types. Caller
  // input is never spread, so no arbitrary provider field can be smuggled in.
  const body: Record<string, unknown> = {
    vehicle_id: input.vehicleId,
    value: input.value,
    date: input.date,
  };
  // Primary meter ⇒ omit `meter_type` entirely (the narrower wire shape).
  if (input.secondaryMeter) {
    body.meter_type = "secondary";
  }

  const raw = await fleetioRequest<unknown>({
    apiKey: input.apiKey,
    accountToken: input.accountToken,
    method: "POST",
    path: "/meter_entries",
    // The 2025-05-05 schema documents NO 404 for this endpoint (a bad vehicle
    // surfaces as 422). We still supply a stable label so that if Fleetio ever
    // does answer 404, it maps to the typed not-found error naming ONLY the
    // vehicle the caller asked for — never a fake success, never a raw body.
    resourceForNotFound: `vehicle ${input.vehicleId}`,
    body,
  });

  const entry = toMeterEntry(raw);
  if (!Number.isFinite(entry.id) || entry.id <= 0) {
    // Label names only the resource — never the request body or a credential.
    throw new FleetioMalformedResponseError("meter entry");
  }
  return entry;
}
