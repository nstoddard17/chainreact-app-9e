import type { OutputMeta } from "@/contracts/actionMeta";

/**
 * Shared bounded output shapes for the Motive actions — MOTIVE-1.
 *
 * One projection per entity, reused across the fuel/vehicle/driver actions so a
 * record looks identical from any node. Mirrors the projected shapes in
 * `integrations/_shared/motive/projections.ts`. Money fields are numeric
 * dollars exactly as Motive returns them; nothing here is `sensitive` beyond the
 * driver email (a recipient/PII value) which is flagged.
 */

const VEHICLE_REF_OUTPUT: OutputMeta = {
  name: "vehicle",
  type: "object",
  description: "The vehicle the purchase is attributed to.",
  nullable: true,
  fields: [
    { name: "vehicleId", type: "string", description: "Motive vehicle id.", nullable: true },
    { name: "number", type: "string", description: "Vehicle number/label.", nullable: true },
    { name: "make", type: "string", description: "Make.", nullable: true },
    { name: "model", type: "string", description: "Model.", nullable: true },
    { name: "year", type: "string", description: "Year.", nullable: true },
    { name: "vin", type: "string", description: "VIN.", nullable: true },
  ],
};

const DRIVER_REF_OUTPUT: OutputMeta = {
  name: "driver",
  type: "object",
  description: "The driver the purchase is attributed to.",
  nullable: true,
  fields: [
    { name: "driverId", type: "string", description: "Motive driver id.", nullable: true },
    { name: "firstName", type: "string", description: "First name.", nullable: true },
    { name: "lastName", type: "string", description: "Last name.", nullable: true },
    {
      name: "email",
      type: "string",
      description: "Driver email.",
      nullable: true,
      sensitive: true,
    },
    { name: "status", type: "string", description: "Driver status.", nullable: true },
  ],
};

export const MOTIVE_FUEL_PURCHASE_OUTPUTS: readonly OutputMeta[] = [
  { name: "fuelPurchaseId", type: "string", description: "Motive fuel-purchase id.", nullable: true },
  { name: "purchasedAt", type: "string", description: "When the fuel was purchased (ISO-8601).", nullable: true },
  { name: "jurisdiction", type: "string", description: "State/province jurisdiction code.", nullable: true },
  { name: "fuelType", type: "string", description: "Fuel type (e.g. diesel).", nullable: true },
  { name: "fuel", type: "number", description: "Fuel amount.", nullable: true },
  { name: "fuelUnit", type: "string", description: "Fuel unit (gal or ltr).", nullable: true },
  { name: "totalCost", type: "number", description: "Total cost.", nullable: true },
  { name: "currency", type: "string", description: "Currency (USD or CAD).", nullable: true },
  { name: "vendor", type: "string", description: "Vendor/merchant.", nullable: true },
  { name: "refNo", type: "string", description: "Reference number.", nullable: true },
  { name: "odometer", type: "number", description: "Odometer reading.", nullable: true },
  { name: "odometerUnit", type: "string", description: "Odometer unit (MI or KM).", nullable: true },
  { name: "location", type: "string", description: "Purchase location.", nullable: true },
  { name: "receiptUrl", type: "fileRef", description: "URL reference to the receipt image, when present.", nullable: true, sensitive: true },
  { name: "receiptFilename", type: "string", description: "Receipt file name, when present.", nullable: true },
  VEHICLE_REF_OUTPUT,
  DRIVER_REF_OUTPUT,
];

export const MOTIVE_VEHICLE_OUTPUTS: readonly OutputMeta[] = [
  { name: "vehicleId", type: "string", description: "Motive vehicle id.", nullable: true },
  { name: "number", type: "string", description: "Vehicle number/label.", nullable: true },
  { name: "make", type: "string", description: "Make.", nullable: true },
  { name: "model", type: "string", description: "Model.", nullable: true },
  { name: "year", type: "string", description: "Year.", nullable: true },
  { name: "vin", type: "string", description: "VIN.", nullable: true },
  { name: "licensePlateState", type: "string", description: "License plate state.", nullable: true },
  { name: "licensePlateNumber", type: "string", description: "License plate number.", nullable: true },
  { name: "status", type: "string", description: "Vehicle status.", nullable: true },
  { name: "ifta", type: "boolean", description: "Whether the vehicle is IFTA-tracked.", nullable: true },
];

export const MOTIVE_DRIVER_OUTPUTS: readonly OutputMeta[] = [
  { name: "driverId", type: "string", description: "Motive driver id.", nullable: true },
  { name: "firstName", type: "string", description: "First name.", nullable: true },
  { name: "lastName", type: "string", description: "Last name.", nullable: true },
  { name: "username", type: "string", description: "Username.", nullable: true },
  { name: "email", type: "string", description: "Driver email.", nullable: true, sensitive: true },
  { name: "phone", type: "string", description: "Phone number.", nullable: true, sensitive: true },
  { name: "role", type: "string", description: "Role (e.g. driver).", nullable: true },
  { name: "status", type: "string", description: "Status (active/deactivated).", nullable: true },
];
