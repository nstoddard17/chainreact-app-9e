import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { buildTrelloActivate } from "../_shared/activate";
import { trelloSharedDeactivate } from "../_shared/deactivate";

/**
 * Module-init registration for the Trello `member_changed` trigger —
 * Slice 17 Commit 5. See `newCard/index.ts` for the shared design.
 */
const activate = buildTrelloActivate("member_changed");
registerActivation("trello", "member_changed", activate);
registerDeactivation("trello", "member_changed", trelloSharedDeactivate);

export { activate, trelloSharedDeactivate as deactivate };
