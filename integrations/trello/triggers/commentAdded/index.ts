import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { buildTrelloActivate } from "../_shared/activate";
import { trelloSharedDeactivate } from "../_shared/deactivate";

/**
 * Module-init registration for the Trello `comment_added` trigger —
 * Slice 17 Commit 5. See `newCard/index.ts` for the shared design.
 */
const activate = buildTrelloActivate("comment_added");
registerActivation("trello", "comment_added", activate);
registerDeactivation("trello", "comment_added", trelloSharedDeactivate);

export { activate, trelloSharedDeactivate as deactivate };
