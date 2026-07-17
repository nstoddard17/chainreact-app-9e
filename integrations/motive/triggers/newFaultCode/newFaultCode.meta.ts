import type { TriggerMeta } from "@/contracts/triggerMeta";
import { MOTIVE_BASE_TRIGGER_PAYLOAD } from "../_shared/payloadShapes";

/**
 * Builder metadata for `motive:new_fault_code` — MOTIVE-1.
 * Webhook-activated (`fault_code_opened`). Company-scoped.
 */
export const motiveNewFaultCodeTriggerMeta: TriggerMeta = {
  key: "motive:new_fault_code",
  provider: "motive",
  type: "new_fault_code",
  displayName: "New Fault Code",
  description:
    "Fires when a diagnostic fault code opens on a vehicle in your Motive company.",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [],
  payloadShape: [
    ...MOTIVE_BASE_TRIGGER_PAYLOAD,
    { name: "faultCodeId", type: "string", description: "Fault code id.", nullable: true },
    { name: "vehicleId", type: "string", description: "Vehicle reporting the fault.", nullable: true },
    { name: "code", type: "string", description: "The diagnostic code.", nullable: true },
    { name: "description", type: "string", description: "Fault description.", nullable: true },
  ],
  displayOrder: 50,
};
