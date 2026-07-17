import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerTriggerFilter } from "@/core/triggers/filterRegistry";
import { buildMotiveActivate } from "../_shared/activate";
import { motiveSharedDeactivate } from "../_shared/deactivate";
import { makeMotiveCompanyFilter } from "../_shared/filter";
import type { MotiveTriggerType } from "../_shared/eventMap";

/**
 * Module-init registration for Motive `new_fault_code` — MOTIVE-1.
 * Motive `fault_code_opened`. One of 7 company-webhook triggers.
 */
const TYPE: MotiveTriggerType = "new_fault_code";
const activate = buildMotiveActivate(TYPE);
export const motiveNewFaultCodeFilter = makeMotiveCompanyFilter(TYPE);
registerActivation("motive", TYPE, activate);
registerDeactivation("motive", TYPE, motiveSharedDeactivate);
registerTriggerFilter(motiveNewFaultCodeFilter);

export { activate, motiveSharedDeactivate as deactivate };
