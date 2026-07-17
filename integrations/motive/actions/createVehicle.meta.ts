import type { ActionMeta } from "@/contracts/actionMeta";
import { MOTIVE_VEHICLE_OUTPUTS } from "./_sharedOutputs";

/**
 * Motive `create_vehicle` ActionMeta — MOTIVE-1.
 *
 * Adds a vehicle to the company's Motive fleet. Only the vehicle number is
 * required; make/model/year/VIN/plate are optional descriptive detail.
 * External write (recoverable — the vehicle can be edited/deactivated) →
 * riskLevel medium.
 */
export const motiveCreateVehicleMeta: ActionMeta = {
  key: "motive:create_vehicle",
  provider: "motive",
  type: "create_vehicle",
  displayName: "Create Vehicle",
  description:
    "Add a vehicle to the company's Motive fleet — with its number, make, model, year, VIN, and plate.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "number",
      label: "Vehicle number",
      type: "text",
      required: true,
      description: "The vehicle number/label shown across Motive (e.g. a unit number).",
    },
    {
      name: "make",
      label: "Make",
      type: "text",
      required: false,
      description: "Optional. Vehicle manufacturer (e.g. Freightliner).",
    },
    {
      name: "model",
      label: "Model",
      type: "text",
      required: false,
      description: "Optional. Vehicle model.",
    },
    {
      name: "year",
      label: "Year",
      type: "text",
      required: false,
      description: "Optional. Model year.",
    },
    {
      name: "vin",
      label: "VIN",
      type: "text",
      required: false,
      description: "Optional. Vehicle identification number.",
    },
    {
      name: "licensePlateState",
      label: "License plate state",
      type: "text",
      required: false,
      description: "Optional. State/province of the license plate.",
    },
    {
      name: "licensePlateNumber",
      label: "License plate number",
      type: "text",
      required: false,
      description: "Optional. License plate number.",
    },
  ],
  outputs: [...MOTIVE_VEHICLE_OUTPUTS],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 70,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Creates a vehicle in the company's Motive account.",
};
