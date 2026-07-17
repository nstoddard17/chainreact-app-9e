import type { ActionMeta } from "@/contracts/actionMeta";
import { MOTIVE_VEHICLE_OUTPUTS } from "./_sharedOutputs";

/**
 * Motive `update_vehicle` ActionMeta — MOTIVE-1.
 *
 * Updates an existing vehicle. The vehicle is an account-aware picker; any
 * subset of descriptive fields (or status) can be changed. External write
 * (recoverable) → riskLevel medium.
 */
export const motiveUpdateVehicleMeta: ActionMeta = {
  key: "motive:update_vehicle",
  provider: "motive",
  type: "update_vehicle",
  displayName: "Update Vehicle",
  description:
    "Update an existing vehicle in the company's Motive fleet — its number, make, model, year, VIN, plate, or status.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "vehicleId",
      label: "Vehicle",
      type: "combobox",
      optionsSource: "motive:vehicles",
      allowManualEntry: true,
      required: true,
      placeholder: "Search vehicles…",
      description: "The vehicle to update. Pick one, or map it from an earlier step.",
    },
    {
      name: "number",
      label: "Vehicle number",
      type: "text",
      required: false,
      description: "Optional. New vehicle number/label.",
    },
    {
      name: "make",
      label: "Make",
      type: "text",
      required: false,
      description: "Optional. New make.",
    },
    {
      name: "model",
      label: "Model",
      type: "text",
      required: false,
      description: "Optional. New model.",
    },
    {
      name: "year",
      label: "Year",
      type: "text",
      required: false,
      description: "Optional. New model year.",
    },
    {
      name: "vin",
      label: "VIN",
      type: "text",
      required: false,
      description: "Optional. New VIN.",
    },
    {
      name: "licensePlateState",
      label: "License plate state",
      type: "text",
      required: false,
      description: "Optional. New license plate state/province.",
    },
    {
      name: "licensePlateNumber",
      label: "License plate number",
      type: "text",
      required: false,
      description: "Optional. New license plate number.",
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      required: false,
      options: [
        { value: "active", label: "Active" },
        { value: "deactivated", label: "Deactivated" },
      ],
      description: "Optional. Whether the vehicle is active or deactivated.",
    },
  ],
  outputs: [...MOTIVE_VEHICLE_OUTPUTS],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 80,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Updates a vehicle record in the company's Motive account.",
};
