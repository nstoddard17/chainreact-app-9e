import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { buildTrelloActivate } from "../_shared/activate";
import { trelloSharedDeactivate } from "../_shared/deactivate";

/**
 * Module-init registration for the Trello `card_archived` trigger —
 * Slice 17 Commit 5. See `newCard/index.ts` for the shared design.
 */
const activate = buildTrelloActivate("card_archived");
registerActivation("trello", "card_archived", activate);
registerDeactivation("trello", "card_archived", trelloSharedDeactivate);

export { activate, trelloSharedDeactivate as deactivate };
