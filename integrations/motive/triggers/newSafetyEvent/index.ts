import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerTriggerFilter } from "@/core/triggers/filterRegistry";
import { buildMotiveActivate } from "../_shared/activate";
import { motiveSharedDeactivate } from "../_shared/deactivate";
import { makeMotiveCompanyFilter } from "../_shared/filter";
import type { MotiveTriggerType } from "../_shared/eventMap";

/**
 * Module-init registration for Motive `new_safety_event` — MOTIVE-1.
 * Motive `driver_performance_event_created`. One of 7 company-webhook triggers.
 */
const TYPE: MotiveTriggerType = "new_safety_event";
const activate = buildMotiveActivate(TYPE);
export const motiveNewSafetyEventFilter = makeMotiveCompanyFilter(TYPE);
registerActivation("motive", TYPE, activate);
registerDeactivation("motive", TYPE, motiveSharedDeactivate);
registerTriggerFilter(motiveNewSafetyEventFilter);

export { activate, motiveSharedDeactivate as deactivate };
