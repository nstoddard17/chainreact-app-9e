import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { buildMondayActivate } from "../_shared/activate";
import { mondaySharedDeactivate } from "../_shared/deactivate";

/**
 * Module-init registration for the Monday `item_moved` trigger —
 * Slice 3.MONDAY-7. Shares the board-webhook lifecycle (`_shared/`).
 */
const activate = buildMondayActivate("item_moved");
registerActivation("monday", "item_moved", activate);
registerDeactivation("monday", "item_moved", mondaySharedDeactivate);

export { activate, mondaySharedDeactivate as deactivate };
