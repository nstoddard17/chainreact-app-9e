import type { TriggerMeta } from "@/contracts/triggerMeta";
import { MOTIVE_BASE_TRIGGER_PAYLOAD } from "../_shared/payloadShapes";

/**
 * Builder metadata for `motive:new_speeding_event` — MOTIVE-1.
 * Webhook-activated (`speeding_event_created`). Company-scoped.
 */
export const motiveNewSpeedingEventTriggerMeta: TriggerMeta = {
  key: "motive:new_speeding_event",
  provider: "motive",
  type: "new_speeding_event",
  displayName: "New Speeding Event",
  description:
    "Fires when a speeding event is detected for a driver/vehicle in your Motive company.",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [],
  payloadShape: [
    ...MOTIVE_BASE_TRIGGER_PAYLOAD,
    { name: "speedingEventId", type: "string", description: "Speeding event id.", nullable: true },
    { name: "driverId", type: "string", description: "Driver involved.", nullable: true },
    { name: "vehicleId", type: "string", description: "Vehicle involved.", nullable: true },
  ],
  displayOrder: 40,
};
