import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerTriggerFilter } from "@/core/triggers/filterRegistry";
import { buildMotiveActivate } from "../_shared/activate";
import { motiveSharedDeactivate } from "../_shared/deactivate";
import { makeMotiveCompanyFilter } from "../_shared/filter";
import type { MotiveTriggerType } from "../_shared/eventMap";

/**
 * Module-init registration for Motive `new_hos_violation` — MOTIVE-1.
 * One of 7 Motive company-webhook triggers sharing the `_shared/` lifecycle.
 */
const TYPE: MotiveTriggerType = "new_hos_violation";
const activate = buildMotiveActivate(TYPE);
export const motiveNewHosViolationFilter = makeMotiveCompanyFilter(TYPE);
registerActivation("motive", TYPE, activate);
registerDeactivation("motive", TYPE, motiveSharedDeactivate);
registerTriggerFilter(motiveNewHosViolationFilter);

export { activate, motiveSharedDeactivate as deactivate };
