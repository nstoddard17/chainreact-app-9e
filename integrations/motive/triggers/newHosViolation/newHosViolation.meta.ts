import type { TriggerMeta } from "@/contracts/triggerMeta";
import { MOTIVE_BASE_TRIGGER_PAYLOAD } from "../_shared/payloadShapes";

/**
 * Builder metadata for `motive:new_hos_violation` — MOTIVE-1.
 * Webhook-activated (`hos_violation_upserted`). Company-scoped — no setup fields.
 */
export const motiveNewHosViolationTriggerMeta: TriggerMeta = {
  key: "motive:new_hos_violation",
  provider: "motive",
  type: "new_hos_violation",
  displayName: "New Hours-of-Service Violation",
  description:
    "Fires when an hours-of-service (HOS) violation is recorded for a driver in your Motive company.",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [],
  payloadShape: [
    ...MOTIVE_BASE_TRIGGER_PAYLOAD,
    { name: "violationId", type: "string", description: "HOS violation id.", nullable: true },
    { name: "driverId", type: "string", description: "Driver in violation.", nullable: true },
    { name: "violationType", type: "string", description: "Violation type.", nullable: true },
  ],
  displayOrder: 20,
};
