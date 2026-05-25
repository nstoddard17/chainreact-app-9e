import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { buildMondayActivate } from "../_shared/activate";
import { mondaySharedDeactivate } from "../_shared/deactivate";

/**
 * Module-init registration for the Monday `new_subitem` trigger —
 * Slice 3.MONDAY-7. Shares the board-webhook lifecycle (`_shared/`).
 */
const activate = buildMondayActivate("new_subitem");
registerActivation("monday", "new_subitem", activate);
registerDeactivation("monday", "new_subitem", mondaySharedDeactivate);

export { activate, mondaySharedDeactivate as deactivate };
