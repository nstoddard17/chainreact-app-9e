import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { buildTrelloActivate } from "../_shared/activate";
import { trelloSharedDeactivate } from "../_shared/deactivate";

/**
 * Module-init registration for the Trello `card_updated` trigger —
 * Slice 17 Commit 5. See `newCard/index.ts` for the shared design.
 */
const activate = buildTrelloActivate("card_updated");
registerActivation("trello", "card_updated", activate);
registerDeactivation("trello", "card_updated", trelloSharedDeactivate);

export { activate, trelloSharedDeactivate as deactivate };
