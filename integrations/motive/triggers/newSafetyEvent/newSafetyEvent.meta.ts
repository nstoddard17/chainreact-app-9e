import type { TriggerMeta } from "@/contracts/triggerMeta";
import { MOTIVE_BASE_TRIGGER_PAYLOAD } from "../_shared/payloadShapes";

/**
 * Builder metadata for `motive:new_safety_event` — MOTIVE-1.
 * Webhook-activated (`driver_performance_event_created`). Company-scoped.
 */
export const motiveNewSafetyEventTriggerMeta: TriggerMeta = {
  key: "motive:new_safety_event",
  provider: "motive",
  type: "new_safety_event",
  displayName: "New Safety Event",
  description:
    "Fires when a driver-performance safety event (e.g. harsh braking, cornering) is detected in your Motive company.",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [],
  payloadShape: [
    ...MOTIVE_BASE_TRIGGER_PAYLOAD,
    { name: "safetyEventId", type: "string", description: "Safety event id.", nullable: true },
    { name: "driverId", type: "string", description: "Driver involved.", nullable: true },
    { name: "vehicleId", type: "string", description: "Vehicle involved.", nullable: true },
    { name: "eventTypeName", type: "string", description: "Safety event type.", nullable: true },
  ],
  displayOrder: 30,
};
