import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerTriggerFilter } from "@/core/triggers/filterRegistry";
import { buildMotiveActivate } from "../_shared/activate";
import { motiveSharedDeactivate } from "../_shared/deactivate";
import { makeMotiveCompanyFilter } from "../_shared/filter";
import type { MotiveTriggerType } from "../_shared/eventMap";

/**
 * Module-init registration for Motive `new_driver` — MOTIVE-1.
 * Motive `user_upserted`; first-seen dedup (id-only key) so an update to an
 * existing driver never re-fires the "new" workflow. One of 7 company-webhook
 * triggers.
 */
const TYPE: MotiveTriggerType = "new_driver";
const activate = buildMotiveActivate(TYPE);
export const motiveNewDriverFilter = makeMotiveCompanyFilter(TYPE);
registerActivation("motive", TYPE, activate);
registerDeactivation("motive", TYPE, motiveSharedDeactivate);
registerTriggerFilter(motiveNewDriverFilter);

export { activate, motiveSharedDeactivate as deactivate };
