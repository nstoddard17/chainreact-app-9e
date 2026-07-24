import type { OutputMeta } from "@/contracts/actionMeta";
import type { FleetioVehicle } from "../api/vehicles";

/**
 * Bounded `fleetio:get_vehicle` output (FLEETIO-2).
 *
 * Built EXPLICITLY from an approved key set — the raw Fleetio record is never
 * spread. No credentials, headers, pagination data, provider URLs, or
 * custom-field blobs. Missing optional provider values become `null` (the V2
 * bounded-output convention; the meta marks them `nullable`), and Q5 explicit
 * values (`0`, `false`, `""`) are preserved because the projection uses typed
 * presence checks, never truthiness.
 *
 * Field mapping (verified against the 2025-05-05 OpenAPI `Vehicle` schema):
 *   - `vehicleId`         ← id (as string)
 *   - `name`              ← name
 *   - `vin`               ← vin
 *   - `licensePlate`      ← license_plate
 *   - `make` / `model`    ← make / model
 *   - `year`              ← year (number)
 *   - `statusId`          ← vehicle_status_id (number)
 *   - `statusName`        ← vehicle_status_name
 *   - `primaryMeterValue` ← current_meter_value (number)
 *   - `primaryMeterUnit`  ← meter_unit
 *   - `archived`          ← derived: archived_at != null (boolean, always present)
 *   - `createdAt`/`updatedAt` ← created_at / updated_at
 *
 * Fleetio has NO vehicle "number" field (the human identifier IS `name`, e.g.
 * "Truck 104"), so the plan's `number` output is intentionally OMITTED rather
 * than invented — see docs/providers/fleetio/configuration-design.md.
 */
export interface GetVehicleOutput {
  vehicleId: string;
  name: string | null;
  vin: string | null;
  licensePlate: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  statusId: number | null;
  statusName: string | null;
  primaryMeterValue: number | null;
  primaryMeterUnit: string | null;
  archived: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export function toGetVehicleOutput(vehicle: FleetioVehicle): GetVehicleOutput {
  return {
    vehicleId: String(vehicle.id),
    name: vehicle.name,
    vin: vehicle.vin,
    licensePlate: vehicle.license_plate,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    statusId: vehicle.vehicle_status_id,
    statusName: vehicle.vehicle_status_name,
    primaryMeterValue: vehicle.current_meter_value,
    primaryMeterUnit: vehicle.meter_unit,
    archived: vehicle.archived_at !== null,
    createdAt: vehicle.created_at,
    updatedAt: vehicle.updated_at,
  };
}

/** Variable-picker output shape — mirrors `GetVehicleOutput` exactly. */
export const FLEETIO_VEHICLE_OUTPUTS: readonly OutputMeta[] = [
  { name: "vehicleId", type: "string", description: "The Fleetio vehicle id." },
  { name: "name", type: "string", description: "Vehicle name (e.g. \"Truck 104\").", nullable: true },
  { name: "vin", type: "string", description: "Vehicle Identification Number.", nullable: true },
  { name: "licensePlate", type: "string", description: "License plate.", nullable: true },
  { name: "make", type: "string", description: "Manufacturer (e.g. \"Freightliner\").", nullable: true },
  { name: "model", type: "string", description: "Model.", nullable: true },
  { name: "year", type: "number", description: "Model year.", nullable: true },
  { name: "statusId", type: "number", description: "Vehicle-status id.", nullable: true },
  { name: "statusName", type: "string", description: "Vehicle-status name (e.g. \"Active\").", nullable: true },
  { name: "primaryMeterValue", type: "number", description: "Primary meter (odometer/hours) reading.", nullable: true },
  { name: "primaryMeterUnit", type: "string", description: "Primary meter unit (e.g. \"mi\", \"km\", \"hr\").", nullable: true },
  { name: "archived", type: "boolean", description: "True when the vehicle is archived in Fleetio." },
  { name: "createdAt", type: "string", description: "When the vehicle was created (ISO 8601).", nullable: true },
  { name: "updatedAt", type: "string", description: "When the vehicle was last updated (ISO 8601).", nullable: true },
];
