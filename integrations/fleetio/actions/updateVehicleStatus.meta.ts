import type { ActionMeta } from "@/contracts/actionMeta";
import { FLEETIO_UPDATE_VEHICLE_STATUS_OUTPUTS } from "./updateVehicleStatus.output";

/**
 * Builder metadata for `fleetio:update_vehicle_status` (FLEETIO-3).
 *
 * Setup-first, two required fields: the vehicle (account-aware `fleetio:vehicles`
 * picker, manual/mapped id allowed) and the new status (account-aware
 * `fleetio:vehicle_statuses` picker — a known Fleetio status, no hidden default).
 * No Advanced fields: Fleetio's `PATCH /vehicles/{id}` needs only
 * `vehicle_status_id` (no effective date / comment / reason / version). Output is
 * the bounded post-update projection.
 *
 * Risk: mutates external provider state that is fully RECOVERABLE (set the status
 * back) → `riskLevel: "medium"`, not destructive, no confirmation step.
 */
export const fleetioUpdateVehicleStatusMeta: ActionMeta = {
  key: "fleetio:update_vehicle_status",
  provider: "fleetio",
  type: "update_vehicle_status",
  displayName: "Update Vehicle Status",
  description:
    "Set a Fleetio vehicle's status — mark it in service, out of service, in the shop, or any status your account defines.",
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
    {
      name: "vehicleStatusId",
      label: "New status",
      type: "combobox",
      optionsSource: "fleetio:vehicle_statuses",
      allowManualEntry: true,
      required: true,
      placeholder: "Choose a status",
      description:
        "The status to set on the vehicle. Pick one of your account's Fleetio statuses, or map a status id from an earlier step.",
    },
  ],
  outputs: [...FLEETIO_UPDATE_VEHICLE_STATUS_OUTPUTS],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Changes a vehicle's status in the company's Fleetio account. Recoverable — the status can be changed back.",
};
