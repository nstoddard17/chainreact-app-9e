import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerTriggerFilter } from "@/core/triggers/filterRegistry";
import { buildMotiveActivate } from "../_shared/activate";
import { motiveSharedDeactivate } from "../_shared/deactivate";
import { makeMotiveCompanyFilter } from "../_shared/filter";
import type { MotiveTriggerType } from "../_shared/eventMap";

/**
 * Module-init registration for Motive `new_inspection_report` — MOTIVE-1.
 * One of 7 Motive company-webhook triggers sharing the `_shared/` lifecycle.
 * Imported by `integrations/_registry.ts` (boot) AND `app/api/webhooks/motive`
 * (cold serverless receive). No renewal — Motive webhooks don't expire.
 */
const TYPE: MotiveTriggerType = "new_inspection_report";
const activate = buildMotiveActivate(TYPE);
export const motiveNewInspectionReportFilter = makeMotiveCompanyFilter(TYPE);
registerActivation("motive", TYPE, activate);
registerDeactivation("motive", TYPE, motiveSharedDeactivate);
registerTriggerFilter(motiveNewInspectionReportFilter);

export { activate, motiveSharedDeactivate as deactivate };
