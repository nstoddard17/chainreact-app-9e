import type { TriggerMeta } from "@/contracts/triggerMeta";
import { MOTIVE_BASE_TRIGGER_PAYLOAD } from "../_shared/payloadShapes";

/**
 * Builder metadata for `motive:new_inspection_report` — MOTIVE-1.
 * Webhook-activated (`inspection_report_upserted`). Company-scoped — no setup
 * fields; the connected Motive company is the scope. Compact payload; chain a
 * fetch for full detail.
 */
export const motiveNewInspectionReportTriggerMeta: TriggerMeta = {
  key: "motive:new_inspection_report",
  provider: "motive",
  type: "new_inspection_report",
  displayName: "New Inspection Report (DVIR)",
  description:
    "Fires when a driver vehicle inspection report is submitted or updated in your Motive company.",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [],
  payloadShape: [
    ...MOTIVE_BASE_TRIGGER_PAYLOAD,
    { name: "inspectionReportId", type: "string", description: "Inspection report id.", nullable: true },
    { name: "vehicleId", type: "string", description: "Vehicle inspected.", nullable: true },
    { name: "driverId", type: "string", description: "Driver who inspected.", nullable: true },
    { name: "inspectionType", type: "string", description: "Inspection type (e.g. pre_trip).", nullable: true },
    { name: "status", type: "string", description: "Report status.", nullable: true },
  ],
  displayOrder: 10,
};
