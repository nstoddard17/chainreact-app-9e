import type { ActionMeta } from "@/contracts/actionMeta";
import { FLEETIO_VEHICLE_OUTPUTS } from "./getVehicle.output";

/**
 * Builder metadata for `fleetio:get_vehicle` (FLEETIO-2). Read-only.
 *
 * Reads one Fleetio vehicle's details. The vehicle is chosen from an
 * account-aware `fleetio:vehicles` picker (searchable) OR mapped from an earlier
 * Fleetio / Motive step — `allowManualEntry` keeps the mapped-id / power-user
 * path open even if the picker can't load. A single required field; no raw JSON,
 * no unrelated options. Output is the bounded vehicle projection.
 */
export const fleetioGetVehicleMeta: ActionMeta = {
  key: "fleetio:get_vehicle",
  provider: "fleetio",
  type: "get_vehicle",
  displayName: "Get Vehicle",
  description:
    "Read one Fleetio vehicle's details (name, VIN, plate, status, primary meter, and more) by id. Pick a vehicle or map an id from an earlier step.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "vehicleId",
      label: "Vehicle",
      type: "combobox",
      optionsSource: "fleetio:vehicles",
      allowManualEntry: true,
      required: true,
      placeholder: "Search your Fleetio vehicles",
      description:
        "Choose a vehicle from your Fleetio account, or map a vehicle id from an earlier Fleetio or Motive step (e.g. {{trigger.vehicleId}}).",
    },
  ],
  outputs: [...FLEETIO_VEHICLE_OUTPUTS],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription: "Reads a single vehicle record from the company's Fleetio account.",
};
