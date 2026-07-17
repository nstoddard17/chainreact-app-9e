import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder metadata for `motive:new_fuel_purchase` — MOTIVE-1.
 *
 * Polling-activated (Motive exposes no fuel-purchase webhook). Optional vehicle
 * filter; otherwise watches all new fuel purchases in the connected company.
 * Baseline-first: only purchases created AFTER activation fire.
 */
export const motiveNewFuelPurchaseTriggerMeta: TriggerMeta = {
  key: "motive:new_fuel_purchase",
  provider: "motive",
  type: "new_fuel_purchase",
  displayName: "New Fuel Purchase",
  description:
    "Fires when a new fuel purchase is added to your Motive company. Optionally filter to one vehicle. Only purchases created after the workflow is activated fire.",
  category: "data",
  activation: "polling",
  requiresIntegration: true,
  fields: [
    {
      name: "vehicleId",
      label: "Vehicle (optional)",
      type: "combobox",
      optionsSource: "motive:vehicles",
      allowManualEntry: true,
      required: false,
      placeholder: "All vehicles",
      description: "Limit the trigger to one vehicle's fuel purchases. Leave empty to watch all.",
    },
  ],
  payloadShape: [
    { name: "changeKind", type: "string", description: "Always 'new_fuel_purchase'." },
    { name: "companyId", type: "string", description: "The Motive company." },
    { name: "fuelPurchaseId", type: "string", description: "New fuel-purchase id.", nullable: true },
    { name: "purchasedAt", type: "string", description: "When the fuel was purchased.", nullable: true },
    { name: "jurisdiction", type: "string", description: "Jurisdiction code.", nullable: true },
    { name: "fuelType", type: "string", description: "Fuel type.", nullable: true },
    { name: "fuel", type: "number", description: "Fuel amount.", nullable: true },
    { name: "fuelUnit", type: "string", description: "Fuel unit.", nullable: true },
    { name: "totalCost", type: "number", description: "Total cost.", nullable: true },
    { name: "currency", type: "string", description: "Currency.", nullable: true },
    { name: "vendor", type: "string", description: "Vendor.", nullable: true },
    { name: "refNo", type: "string", description: "Reference number.", nullable: true },
    { name: "vehicleId", type: "string", description: "Vehicle id.", nullable: true },
    { name: "vehicleNumber", type: "string", description: "Vehicle number.", nullable: true },
    { name: "driverId", type: "string", description: "Driver id.", nullable: true },
    { name: "driverEmail", type: "string", description: "Driver email.", nullable: true, sensitive: true },
  ],
  displayOrder: 80,
};
