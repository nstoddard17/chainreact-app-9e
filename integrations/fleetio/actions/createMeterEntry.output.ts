import type { OutputMeta } from "@/contracts/actionMeta";
import type { FleetioMeterEntry } from "../api/meterEntries";

/**
 * Bounded `fleetio:create_meter_entry` output (FLEETIO-4).
 *
 * Fleetio's `POST /meter_entries` returns the CREATED Meter Entry on 201, so the
 * output is built from the authoritative provider record — no extra GET, and no
 * request value is echoed back as if it were provider confirmation. Built
 * EXPLICITLY from an approved key set; the raw record is never spread. No
 * credentials, headers, provider URLs, custom fields, account metadata, GPS
 * provider/device, sample flags or pagination.
 *
 * Field mapping (verified against the 2025-05-05 `MeterEntry_Created` schema):
 *   - `meterEntryId` ← id (as string)
 *   - `vehicleId`    ← vehicle_id (`NullableId`, as string)
 *   - `value`        ← value — Fleetio returns this as a STRING on create even
 *                      though the request takes a number. The honest provider
 *                      type is kept rather than silently re-casting it.
 *   - `meterType`    ← meter_type — `null` means the vehicle's PRIMARY meter;
 *                      `"secondary"` means the secondary meter. Left exactly as
 *                      Fleetio reports it (no invented `"primary"` literal).
 *   - `void`         ← void (boolean, always present; `false` preserved)
 *   - `readingDate`  ← date — note Fleetio's RESPONSE `date` is `format: date`
 *                      (date-only) while the REQUEST takes a full date-time.
 *   - `createdAt`    ← created_at
 *
 * Deliberately absent:
 *   - **No `meterUnit`.** The create response carries no unit — the unit lives on
 *     the Account and optionally the Vehicle (`meter_unit` /
 *     `secondary_meter_unit`). Returning one here would be an invented field.
 *   - **No updated vehicle object.** The response is a Meter Entry, not a
 *     Vehicle; the vehicle's recalculated current meter is not returned and is
 *     not fabricated.
 */
export interface CreateMeterEntryOutput {
  meterEntryId: string;
  vehicleId: string | null;
  value: string | null;
  meterType: string | null;
  void: boolean;
  readingDate: string | null;
  createdAt: string | null;
}

export function toCreateMeterEntryOutput(entry: FleetioMeterEntry): CreateMeterEntryOutput {
  return {
    meterEntryId: String(entry.id),
    vehicleId: entry.vehicle_id !== null ? String(entry.vehicle_id) : null,
    value: entry.value,
    meterType: entry.meter_type,
    void: entry.void,
    readingDate: entry.date,
    createdAt: entry.created_at,
  };
}

/** Variable-picker output shape — mirrors `CreateMeterEntryOutput` exactly. */
export const FLEETIO_CREATE_METER_ENTRY_OUTPUTS: readonly OutputMeta[] = [
  { name: "meterEntryId", type: "string", description: "The new Fleetio meter-entry id." },
  {
    name: "vehicleId",
    type: "string",
    description: "The Fleetio vehicle the reading was recorded against.",
    nullable: true,
  },
  {
    name: "value",
    type: "string",
    description: "The recorded meter reading, as Fleetio returns it.",
    nullable: true,
  },
  {
    name: "meterType",
    type: "string",
    description: "\"secondary\" for a secondary-meter reading; empty for the primary meter.",
    nullable: true,
  },
  {
    name: "void",
    type: "boolean",
    description: "True when the entry was recorded as void (does not count toward the meter).",
  },
  {
    name: "readingDate",
    type: "string",
    description: "The date Fleetio recorded the reading against.",
    nullable: true,
  },
  {
    name: "createdAt",
    type: "string",
    description: "When the meter entry was created in Fleetio (ISO 8601).",
    nullable: true,
  },
];
