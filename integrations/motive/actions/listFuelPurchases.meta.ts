import type { ActionMeta } from "@/contracts/actionMeta";
import { FUEL_TYPE_OPTIONS } from "./_staticOptions";

/**
 * Motive `list_fuel_purchases` ActionMeta — MOTIVE-1.
 *
 * Reads a single page of fuel purchases with optional date-window, fuel-type,
 * and vehicle filters. Vehicle is an account-aware picker; fuel type is the
 * fixed enum. Paging knobs (`perPage`/`pageNo`) are advanced. Output is a
 * bounded list — not the shared single-record projection.
 */
export const motiveListFuelPurchasesMeta: ActionMeta = {
  key: "motive:list_fuel_purchases",
  provider: "motive",
  type: "list_fuel_purchases",
  displayName: "List Fuel Purchases",
  description:
    "Read one page of fuel purchases from Motive, optionally filtered by date range, fuel type, and vehicle. Loop on the page number for more.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "startDate",
      label: "Start date",
      type: "date",
      required: false,
      description: "Optional. Only include purchases on or after this date.",
    },
    {
      name: "endDate",
      label: "End date",
      type: "date",
      required: false,
      description: "Optional. Only include purchases on or before this date.",
    },
    {
      name: "fuelType",
      label: "Fuel type",
      type: "select",
      required: false,
      options: [...FUEL_TYPE_OPTIONS],
      description: "Optional. Only include purchases of this fuel type.",
    },
    {
      name: "vehicleId",
      label: "Vehicle",
      type: "combobox",
      optionsSource: "motive:vehicles",
      allowManualEntry: true,
      required: false,
      placeholder: "Search vehicles…",
      description: "Optional. Only include purchases for this vehicle. Pick one, or map it from an earlier step.",
    },
    {
      name: "perPage",
      label: "Results per page",
      type: "number",
      required: false,
      advanced: true,
      defaultValue: 25,
      numeric: { min: 1, max: 100, integer: true },
      description: "How many purchases to return per page (1–100).",
    },
    {
      name: "pageNo",
      label: "Page number",
      type: "number",
      required: false,
      advanced: true,
      defaultValue: 1,
      numeric: { min: 1, integer: true },
      description: "Which page to fetch. Increment to page through results.",
    },
  ],
  outputs: [
    {
      name: "fuelPurchases",
      type: "array",
      description: "The fuel-purchase records on this page (bounded projections).",
    },
    {
      name: "count",
      type: "number",
      description: "Number of purchases returned on this page.",
    },
    {
      name: "total",
      type: "number",
      description: "Total matching purchases across all pages, when Motive reports it.",
      nullable: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription: "Reads fuel-purchase records from the company's Motive account.",
};
