import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { buildTrelloActivate } from "../_shared/activate";
import { trelloSharedDeactivate } from "../_shared/deactivate";

/**
 * Module-init registration for the Trello `new_card` trigger —
 * Slice 17 Commit 5.
 *
 * One of 6 Trello board-webhook triggers. All 6 share the same
 * activate/deactivate logic (`_shared/`) — the only difference is the
 * V2 event type stored in `trigger_resources.config.eventType`, which
 * the receive helper uses to filter inbound action types.
 *
 * **NO subscription handler registration.** Trello webhooks don't
 * expire — same "permanent endpoint" pattern as GitHub / Shopify /
 * Mailchimp.
 */
const activate = buildTrelloActivate("new_card");
registerActivation("trello", "new_card", activate);
registerDeactivation("trello", "new_card", trelloSharedDeactivate);

export { activate, trelloSharedDeactivate as deactivate };
