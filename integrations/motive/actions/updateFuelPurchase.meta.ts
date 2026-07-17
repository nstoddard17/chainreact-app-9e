import type { ActionMeta } from "@/contracts/actionMeta";
import { MOTIVE_FUEL_PURCHASE_OUTPUTS } from "./_sharedOutputs";
import {
  CURRENCY_OPTIONS,
  FUEL_TYPE_OPTIONS,
  FUEL_UNIT_OPTIONS,
  JURISDICTION_OPTIONS,
  ODOMETER_UNIT_OPTIONS,
} from "./_staticOptions";

/**
 * Motive `update_fuel_purchase` ActionMeta — MOTIVE-1.
 *
 * Amends an existing fuel-purchase record. Only the id is required; every
 * other field is optional and only sent when set. Vehicle and driver are
 * account-aware pickers; jurisdiction/fuel-type/unit/currency are fixed enums.
 * External write (recoverable — the purchase can be edited again) → riskLevel
 * medium.
 */
export const motiveUpdateFuelPurchaseMeta: ActionMeta = {
  key: "motive:update_fuel_purchase",
  provider: "motive",
  type: "update_fuel_purchase",
  displayName: "Update Fuel Purchase",
  description:
    "Update fields on an existing Motive fuel purchase. Only the fields you set are changed.",
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
        "The fuel-purchase id to update. Usually mapped from a New Fuel Purchase trigger or a List Fuel Purchases step; a manual id is allowed.",
    },
    {
      name: "vehicleId",
      label: "Vehicle",
      type: "combobox",
      optionsSource: "motive:vehicles",
      allowManualEntry: true,
      required: false,
      placeholder: "Search vehicles…",
      description: "Optional. New vehicle for the purchase. Pick one, or map it from an earlier step.",
    },
    {
      name: "driverId",
      label: "Driver",
      type: "combobox",
      optionsSource: "motive:drivers",
      allowManualEntry: true,
      required: false,
      placeholder: "Search drivers…",
      description: "Optional. New driver for the purchase. Pick one, or map it from an earlier step.",
    },
    {
      name: "purchasedAt",
      label: "Purchased at",
      type: "datetime-utc",
      required: false,
      description: "Optional. New purchase time.",
    },
    {
      name: "jurisdiction",
      label: "Jurisdiction",
      type: "select",
      required: false,
      options: [...JURISDICTION_OPTIONS],
      description: "Optional. State or province where the fuel was bought (drives IFTA reporting).",
    },
    {
      name: "fuelType",
      label: "Fuel type",
      type: "select",
      required: false,
      options: [...FUEL_TYPE_OPTIONS],
      description: "Optional. Type of fuel purchased.",
    },
    {
      name: "fuel",
      label: "Amount",
      type: "number",
      required: false,
      description: "Optional. Volume of fuel purchased, in the selected unit.",
    },
    {
      name: "fuelUnit",
      label: "Unit",
      type: "select",
      required: false,
      options: [...FUEL_UNIT_OPTIONS],
      description: "Optional. Whether the amount is in gallons or liters.",
    },
    {
      name: "totalCost",
      label: "Total cost",
      type: "number",
      required: false,
      description: "Optional. Total amount paid.",
    },
    {
      name: "currency",
      label: "Currency",
      type: "select",
      required: false,
      options: [...CURRENCY_OPTIONS],
      description: "Optional. Currency of the total cost.",
    },
    {
      name: "vendor",
      label: "Vendor",
      type: "text",
      required: false,
      description: "Optional. Merchant/station name.",
    },
    {
      name: "refNo",
      label: "Reference number",
      type: "text",
      required: false,
      description: "Optional. Receipt or transaction reference number.",
    },
    {
      name: "location",
      label: "Location",
      type: "text",
      required: false,
      description: "Optional. Free-text purchase location.",
    },
    {
      name: "odometer",
      label: "Odometer",
      type: "number",
      required: false,
      advanced: true,
      description: "Optional. Odometer reading at the time of purchase.",
    },
    {
      name: "odometerUnit",
      label: "Odometer unit",
      type: "select",
      required: false,
      advanced: true,
      visibleWhen: { field: "odometer", valueTruthy: true },
      options: [...ODOMETER_UNIT_OPTIONS],
      description: "Optional. Unit for the odometer reading.",
    },
  ],
  outputs: [...MOTIVE_FUEL_PURCHASE_OUTPUTS],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Updates an existing fuel-purchase record in the company's Motive account.",
};
