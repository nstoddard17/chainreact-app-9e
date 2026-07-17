import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerTriggerFilter } from "@/core/triggers/filterRegistry";
import { buildMotiveActivate } from "../_shared/activate";
import { motiveSharedDeactivate } from "../_shared/deactivate";
import { makeMotiveCompanyFilter } from "../_shared/filter";
import type { MotiveTriggerType } from "../_shared/eventMap";

/**
 * Module-init registration for Motive `new_speeding_event` — MOTIVE-1.
 * Motive `speeding_event_created`. One of 7 company-webhook triggers.
 */
const TYPE: MotiveTriggerType = "new_speeding_event";
const activate = buildMotiveActivate(TYPE);
export const motiveNewSpeedingEventFilter = makeMotiveCompanyFilter(TYPE);
registerActivation("motive", TYPE, activate);
registerDeactivation("motive", TYPE, motiveSharedDeactivate);
registerTriggerFilter(motiveNewSpeedingEventFilter);

export { activate, motiveSharedDeactivate as deactivate };
