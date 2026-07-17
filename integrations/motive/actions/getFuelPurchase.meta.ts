import type { ActionMeta } from "@/contracts/actionMeta";
import { MOTIVE_FUEL_PURCHASE_OUTPUTS } from "./_sharedOutputs";

/**
 * Motive `get_fuel_purchase` ActionMeta — MOTIVE-1. Read-only.
 *
 * Reads one fuel purchase by id. Returns `found: false` (does NOT fail the
 * run) when the id doesn't exist, so workflows can branch. The id is usually
 * mapped from a New Fuel Purchase trigger or a List step; a manual id is
 * allowed for power users.
 */
export const motiveGetFuelPurchaseMeta: ActionMeta = {
  key: "motive:get_fuel_purchase",
  provider: "motive",
  type: "get_fuel_purchase",
  displayName: "Get Fuel Purchase",
  description:
    "Read one Motive fuel purchase by id. Returns `found: false` when the id doesn't exist (does NOT fail the run).",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "fuelPurchaseId",
      label: "Fuel purchase",
      type: "text",
      required: true,
      placeholder: "Fuel purchase id",
      description:
        "The fuel-purchase id to read. Usually mapped from a New Fuel Purchase trigger or a List Fuel Purchases step; a manual id is allowed.",
    },
  ],
  outputs: [
    {
      name: "found",
      type: "boolean",
      description: "True when the fuel purchase exists. Branch on this before using the other outputs.",
    },
    ...MOTIVE_FUEL_PURCHASE_OUTPUTS,
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription: "Reads a single fuel-purchase record from the company's Motive account.",
};
