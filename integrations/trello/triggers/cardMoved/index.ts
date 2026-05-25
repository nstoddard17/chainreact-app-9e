import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { buildTrelloActivate } from "../_shared/activate";
import { trelloSharedDeactivate } from "../_shared/deactivate";

/**
 * Module-init registration for the Trello `card_moved` trigger —
 * Slice 17 Commit 5. See `newCard/index.ts` for the shared design.
 */
const activate = buildTrelloActivate("card_moved");
registerActivation("trello", "card_moved", activate);
registerDeactivation("trello", "card_moved", trelloSharedDeactivate);

export { activate, trelloSharedDeactivate as deactivate };
