import type { TriggerMeta } from "@/contracts/triggerMeta";
import { MOTIVE_BASE_TRIGGER_PAYLOAD } from "../_shared/payloadShapes";

/**
 * Builder metadata for `motive:new_driver` — MOTIVE-1.
 * Webhook-activated (`user_upserted`). First-seen dedup so it fires only on
 * genuinely new drivers, not updates. Company-scoped. The driver email is a
 * PII field on the payload — flagged sensitive.
 */
export const motiveNewDriverTriggerMeta: TriggerMeta = {
  key: "motive:new_driver",
  provider: "motive",
  type: "new_driver",
  displayName: "New Driver",
  description:
    "Fires when a driver is added to your Motive company (first sighting only — updates to existing drivers don't re-fire).",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [],
  payloadShape: [
    ...MOTIVE_BASE_TRIGGER_PAYLOAD,
    { name: "driverId", type: "string", description: "New driver id.", nullable: true },
    { name: "email", type: "string", description: "Driver email.", nullable: true, sensitive: true },
    { name: "firstName", type: "string", description: "First name.", nullable: true },
    { name: "lastName", type: "string", description: "Last name.", nullable: true },
    { name: "role", type: "string", description: "Role.", nullable: true },
  ],
  displayOrder: 70,
};
