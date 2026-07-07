import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerTriggerFilter } from "@/core/triggers/filterRegistry";
import { buildAsanaActivate } from "../_shared/activate";
import { asanaSharedDeactivate } from "../_shared/deactivate";
import { asanaTaskAssignedFilter } from "./filter";

/**
 * Module-init registration for the Asana `task_assigned` trigger —
 * ASANA-2. See `newTaskInProject/index.ts` for the shared-lifecycle
 * rationale (same POST /webhooks + X-Hook-Secret handshake activate,
 * same DELETE /webhooks deactivate; the per-trigger differences are the
 * server-side filter pair — task+changed fields:["assignee"] — and the
 * projectId + optional assigneeId dispatcher filter).
 */
const activate = buildAsanaActivate("task_assigned");
registerActivation("asana", "task_assigned", activate);
registerDeactivation("asana", "task_assigned", asanaSharedDeactivate);
registerTriggerFilter(asanaTaskAssignedFilter);

export {
  activate,
  asanaSharedDeactivate as deactivate,
  asanaTaskAssignedFilter,
};
