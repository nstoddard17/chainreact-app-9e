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
 * Motive `create_fuel_purchase` ActionMeta — MOTIVE-1.
 *
 * Records one fuel purchase (IFTA / expense tracking). Vehicle and driver are
 * account-aware pickers; jurisdiction/fuel-type/unit/currency are fixed enums;
 * fuel unit and currency carry visible defaults. External write (recoverable —
 * the purchase can be edited/deleted) → riskLevel medium.
 */
export const motiveCreateFuelPurchaseMeta: ActionMeta = {
  key: "motive:create_fuel_purchase",
  provider: "motive",
  type: "create_fuel_purchase",
  displayName: "Create Fuel Purchase",
  description:
    "Log a single fuel purchase in Motive against a vehicle and driver — for IFTA and fuel-expense tracking.",
  category: "commerce",
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
      description: "The vehicle this fuel was purchased for. Pick one, or map it from an earlier step.",
    },
    {
      name: "driverId",
      label: "Driver",
      type: "combobox",
      optionsSource: "motive:drivers",
      allowManualEntry: true,
      required: true,
      placeholder: "Search drivers…",
      description: "The driver who bought the fuel. Pick one, or map it from an earlier step.",
    },
    {
      name: "purchasedAt",
      label: "Purchased at",
      type: "datetime-utc",
      required: true,
      description: "When the fuel was purchased.",
    },
    {
      name: "jurisdiction",
      label: "Jurisdiction",
      type: "select",
      required: true,
      options: [...JURISDICTION_OPTIONS],
      description: "State or province where the fuel was bought (drives IFTA reporting).",
    },
    {
      name: "fuelType",
      label: "Fuel type",
      type: "select",
      required: true,
      options: [...FUEL_TYPE_OPTIONS],
      description: "Type of fuel purchased.",
    },
    {
      name: "fuel",
      label: "Amount",
      type: "number",
      required: true,
      description: "Volume of fuel purchased, in the selected unit.",
    },
    {
      name: "fuelUnit",
      label: "Unit",
      type: "select",
      required: true,
      defaultValue: "gal",
      options: [...FUEL_UNIT_OPTIONS],
      description: "Whether the amount is in gallons or liters.",
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
      defaultValue: "USD",
      options: [...CURRENCY_OPTIONS],
      description: "Currency of the total cost.",
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
      defaultValue: "MI",
      visibleWhen: { field: "odometer", valueTruthy: true },
      options: [...ODOMETER_UNIT_OPTIONS],
      description: "Unit for the odometer reading.",
    },
  ],
  outputs: [...MOTIVE_FUEL_PURCHASE_OUTPUTS],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Creates a fuel-purchase record in the company's Motive account.",
};
