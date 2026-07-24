import type { OutputMeta } from "@/contracts/actionMeta";
import type { FleetioVehicle } from "../api/vehicles";

/**
 * Bounded `fleetio:update_vehicle_status` output (FLEETIO-3).
 *
 * Fleetio's `PATCH /vehicles/{id}` returns the UPDATED `Vehicle` on 200, so the
 * output is built from the authoritative post-update record — no extra GET
 * needed. Built EXPLICITLY from an approved key set; the raw record is never
 * spread. No credentials, headers, provider URLs, custom-fields, pagination, or
 * account metadata.
 *
 * Field mapping (verified against the 2025-05-05 `Vehicle` schema):
 *   - `vehicleId`       ← id (as string)
 *   - `vehicleName`     ← name (nullable)
 *   - `vehicleStatusId` ← vehicle_status_id (as string — the authoritative NEW
 *                         status from the response; matches the input shape)
 *   - `statusName`      ← vehicle_status_name (nullable)
 *   - `archived`        ← derived: archived_at != null (boolean, always present)
 *   - `updatedAt`       ← updated_at (nullable)
 *
 * Deliberately NO `changedAt`: Fleetio provides `updated_at`, not a status-change
 * timestamp, so the real field name/meaning is used (no invented field). No
 * before/after status pair — only the post-update value is authoritatively known.
 */
export interface UpdateVehicleStatusOutput {
  vehicleId: string;
  vehicleName: string | null;
  vehicleStatusId: string | null;
  statusName: string | null;
  archived: boolean;
  updatedAt: string | null;
}

export function toUpdateVehicleStatusOutput(vehicle: FleetioVehicle): UpdateVehicleStatusOutput {
  return {
    vehicleId: String(vehicle.id),
    vehicleName: vehicle.name,
    vehicleStatusId:
      vehicle.vehicle_status_id !== null ? String(vehicle.vehicle_status_id) : null,
    statusName: vehicle.vehicle_status_name,
    archived: vehicle.archived_at !== null,
    updatedAt: vehicle.updated_at,
  };
}

/** Variable-picker output shape — mirrors `UpdateVehicleStatusOutput` exactly. */
export const FLEETIO_UPDATE_VEHICLE_STATUS_OUTPUTS: readonly OutputMeta[] = [
  { name: "vehicleId", type: "string", description: "The Fleetio vehicle id." },
  { name: "vehicleName", type: "string", description: "Vehicle name (e.g. \"Truck 104\").", nullable: true },
  { name: "vehicleStatusId", type: "string", description: "The vehicle's new status id.", nullable: true },
  { name: "statusName", type: "string", description: "The new status name (e.g. \"Out of Service\").", nullable: true },
  { name: "archived", type: "boolean", description: "True when the vehicle is archived in Fleetio." },
  { name: "updatedAt", type: "string", description: "When the vehicle was last updated (ISO 8601).", nullable: true },
];
