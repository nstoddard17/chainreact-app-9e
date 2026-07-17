import type { TriggerMeta } from "@/contracts/triggerMeta";
import { MOTIVE_BASE_TRIGGER_PAYLOAD } from "../_shared/payloadShapes";

/**
 * Builder metadata for `motive:new_vehicle` — MOTIVE-1.
 * Webhook-activated (`vehicle_upserted`). First-seen dedup so it fires only on
 * genuinely new vehicles, not updates. Company-scoped.
 */
export const motiveNewVehicleTriggerMeta: TriggerMeta = {
  key: "motive:new_vehicle",
  provider: "motive",
  type: "new_vehicle",
  displayName: "New Vehicle",
  description:
    "Fires when a vehicle is added to your Motive company (first sighting only — updates to existing vehicles don't re-fire).",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [],
  payloadShape: [
    ...MOTIVE_BASE_TRIGGER_PAYLOAD,
    { name: "vehicleId", type: "string", description: "New vehicle id.", nullable: true },
    { name: "number", type: "string", description: "Vehicle number/label.", nullable: true },
    { name: "vin", type: "string", description: "VIN.", nullable: true },
    { name: "make", type: "string", description: "Make.", nullable: true },
    { name: "model", type: "string", description: "Model.", nullable: true },
  ],
  displayOrder: 60,
};
