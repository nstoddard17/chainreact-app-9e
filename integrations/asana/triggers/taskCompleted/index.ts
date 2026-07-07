import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerTriggerFilter } from "@/core/triggers/filterRegistry";
import { buildAsanaActivate } from "../_shared/activate";
import { asanaSharedDeactivate } from "../_shared/deactivate";
import { asanaTaskCompletedFilter } from "./filter";

/**
 * Module-init registration for the Asana `task_completed` trigger —
 * ASANA-2. See `newTaskInProject/index.ts` for the shared-lifecycle
 * rationale (same POST /webhooks + X-Hook-Secret handshake activate,
 * same DELETE /webhooks deactivate; the per-trigger differences are the
 * server-side filter pair — task+changed fields:["completed"] — and the
 * projectId dispatcher filter).
 */
const activate = buildAsanaActivate("task_completed");
registerActivation("asana", "task_completed", activate);
registerDeactivation("asana", "task_completed", asanaSharedDeactivate);
registerTriggerFilter(asanaTaskCompletedFilter);

export {
  activate,
  asanaSharedDeactivate as deactivate,
  asanaTaskCompletedFilter,
};
