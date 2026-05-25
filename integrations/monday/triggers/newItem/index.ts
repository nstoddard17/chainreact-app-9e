import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { buildMondayActivate } from "../_shared/activate";
import { mondaySharedDeactivate } from "../_shared/deactivate";

/**
 * Module-init registration for the Monday `new_item` trigger —
 * Slice 3.MONDAY-7.
 *
 * One of 5 Monday board-webhook triggers. All 5 share the same
 * activate/deactivate logic (`_shared/`) — the only difference is the
 * Monday event enum the activate factory subscribes to. Imported by
 * `integrations/_registry.ts` so the registrations exist on every worker.
 *
 * **NO subscription handler registration** — Monday webhooks don't
 * expire. Same "permanent endpoint" pattern as GitHub / Shopify / Trello.
 */
const activate = buildMondayActivate("new_item");
registerActivation("monday", "new_item", activate);
registerDeactivation("monday", "new_item", mondaySharedDeactivate);

export { activate, mondaySharedDeactivate as deactivate };
