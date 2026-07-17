import type { ActionMeta } from "@/contracts/actionMeta";
import {
  CURRENCY_OPTIONS,
  FUEL_TYPE_OPTIONS,
  FUEL_UNIT_OPTIONS,
  JURISDICTION_OPTIONS,
} from "./_staticOptions";

/**
 * Motive `import_fuel_purchases_csv` ActionMeta — MOTIVE-1.
 *
 * Bulk fuel import. The user provides EITHER a CSV file from an earlier step
 * (already in Motive's template format) OR structured rows via the row editor —
 * never raw JSON. Vehicle/driver row cells are pickers (RESOLVERS-3), so an
 * ordinary user never types a raw id. External bulk write (recoverable) →
 * riskLevel medium.
 */
export const motiveImportFuelPurchasesCsvMeta: ActionMeta = {
  key: "motive:import_fuel_purchases_csv",
  provider: "motive",
  type: "import_fuel_purchases_csv",
  displayName: "Import Fuel Purchases (bulk)",
  description:
    "Bulk-import fuel purchases into Motive from a CSV file (e.g. a fuel-card export in Motive's template) or from structured rows.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "csvFile",
      label: "CSV file",
      type: "file",
      required: false,
      description:
        "A CSV in Motive's fuel-import template, usually from an earlier step. Provide this OR fill the rows below — not both.",
    },
    {
      name: "rows",
      label: "Fuel rows",
      type: "object-list",
      required: false,
      description:
        "One row per fuel purchase. Provide these OR a CSV file above — not both.",
      itemFields: [
        {
          name: "vehicleId",
          label: "Vehicle",
          type: "text",
          required: true,
          placeholder: "Search vehicles…",
          optionsSource: "motive:vehicles",
          allowManualEntry: true,
        },
        {
          name: "driverId",
          label: "Driver",
          type: "text",
          required: true,
          placeholder: "Search drivers…",
          optionsSource: "motive:drivers",
          allowManualEntry: true,
        },
        {
          name: "purchasedAt",
          label: "Purchased at",
          type: "text",
          required: true,
          placeholder: "2026-07-17T14:30:00Z",
        },
        {
          name: "jurisdiction",
          label: "Jurisdiction",
          type: "select",
          required: true,
          options: [...JURISDICTION_OPTIONS],
        },
        {
          name: "fuelType",
          label: "Fuel type",
          type: "select",
          required: true,
          options: [...FUEL_TYPE_OPTIONS],
        },
        {
          name: "fuel",
          label: "Amount",
          type: "number",
          required: true,
        },
        {
          name: "fuelUnit",
          label: "Unit",
          type: "select",
          required: true,
          options: [...FUEL_UNIT_OPTIONS],
        },
        {
          name: "totalCost",
          label: "Total cost",
          type: "number",
          required: false,
        },
        {
          name: "currency",
          label: "Currency",
          type: "select",
          required: false,
          options: [...CURRENCY_OPTIONS],
        },
      ],
    },
    {
      name: "dryRun",
      label: "Validate only (dry run)",
      type: "boolean",
      required: false,
      advanced: true,
      defaultValue: false,
      description:
        "When on, Motive validates the import without creating fuel purchases.",
    },
  ],
  outputs: [
    { name: "accepted", type: "boolean", description: "Whether Motive accepted the import." },
    { name: "jobId", type: "string", description: "Async import job id, when Motive returns one.", nullable: true },
    { name: "acceptedCount", type: "number", description: "Rows accepted/queued, when reported.", nullable: true },
    { name: "message", type: "string", description: "Sanitized status message, when returned.", nullable: true },
    { name: "source", type: "string", description: "Whether the import came from a 'file' or 'rows'." },
    { name: "rowCount", type: "number", description: "Row count when rows were provided.", nullable: true },
    { name: "dryRun", type: "boolean", description: "Whether this was a validate-only run." },
  ],
  producesFileRef: false,
  consumesFileRef: true,
  displayOrder: 15,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Bulk-creates fuel-purchase records in the company's Motive account.",
};
