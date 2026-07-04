import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerTriggerFilter } from "@/core/triggers/filterRegistry";
import { buildAsanaActivate } from "../_shared/activate";
import { asanaSharedDeactivate } from "../_shared/deactivate";
import { asanaTaskUpdatedInProjectFilter } from "./filter";

/**
 * Module-init registration for the Asana `task_updated_in_project`
 * trigger — Slice 5.ASANA-1. See `newTaskInProject/index.ts` for the
 * shared-lifecycle rationale.
 */
const activate = buildAsanaActivate("task_updated_in_project");
registerActivation("asana", "task_updated_in_project", activate);
registerDeactivation("asana", "task_updated_in_project", asanaSharedDeactivate);
registerTriggerFilter(asanaTaskUpdatedInProjectFilter);

export {
  activate,
  asanaSharedDeactivate as deactivate,
  asanaTaskUpdatedInProjectFilter,
};
