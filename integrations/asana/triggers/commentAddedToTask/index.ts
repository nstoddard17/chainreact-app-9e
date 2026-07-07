import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerTriggerFilter } from "@/core/triggers/filterRegistry";
import { buildAsanaActivate } from "../_shared/activate";
import { asanaSharedDeactivate } from "../_shared/deactivate";
import { asanaCommentAddedToTaskFilter } from "./filter";

/**
 * Module-init registration for the Asana `comment_added_to_task`
 * trigger — ASANA-2. See `newTaskInProject/index.ts` for the
 * shared-lifecycle rationale (same POST /webhooks + X-Hook-Secret
 * handshake activate, same DELETE /webhooks deactivate; the per-trigger
 * differences are the server-side filter — story+added
 * resource_subtype:"comment_added" — the projectId dispatcher filter,
 * and the receive-time story post-fetch which needs `stories:read`).
 */
const activate = buildAsanaActivate("comment_added_to_task");
registerActivation("asana", "comment_added_to_task", activate);
registerDeactivation("asana", "comment_added_to_task", asanaSharedDeactivate);
registerTriggerFilter(asanaCommentAddedToTaskFilter);

export {
  activate,
  asanaSharedDeactivate as deactivate,
  asanaCommentAddedToTaskFilter,
};
