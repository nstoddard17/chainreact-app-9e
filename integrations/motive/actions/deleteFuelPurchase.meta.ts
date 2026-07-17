import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Motive `delete_fuel_purchase` ActionMeta — MOTIVE-1.
 *
 * Permanently deletes a fuel-purchase record. Destructive + irreversible →
 * isDestructive/requiresConfirmation with riskLevel high. The id is usually
 * mapped from a New Fuel Purchase trigger or a List step; a manual id is
 * allowed for power users.
 */
export const motiveDeleteFuelPurchaseMeta: ActionMeta = {
  key: "motive:delete_fuel_purchase",
  provider: "motive",
  type: "delete_fuel_purchase",
  displayName: "Delete Fuel Purchase",
  description:
    "Permanently delete a fuel purchase from Motive by id. This cannot be undone.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "fuelPurchaseId",
      label: "Fuel purchase",
      type: "text",
      required: true,
      placeholder: "Fuel purchase id",
      description:
        "The fuel-purchase id to delete. Usually mapped from a New Fuel Purchase trigger or a List Fuel Purchases step; a manual id is allowed.",
    },
  ],
  outputs: [
    {
      name: "deleted",
      type: "boolean",
      description: "True when the fuel purchase was deleted.",
    },
    {
      name: "fuelPurchaseId",
      type: "string",
      description: "The id of the deleted fuel purchase.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 50,
  isDestructive: true,
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription:
    "Permanently deletes a fuel-purchase record from the company's Motive account. This cannot be undone.",
};
