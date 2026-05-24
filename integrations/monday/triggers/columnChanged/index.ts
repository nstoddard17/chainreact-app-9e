import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { buildMondayActivate } from "../_shared/activate";
import { mondaySharedDeactivate } from "../_shared/deactivate";

/**
 * Module-init registration for the Monday `column_changed` trigger —
 * Slice 3.MONDAY-7.
 *
 * The activate factory upgrades the Monday event to
 * `change_specific_column_value` (config-filtered) when the workflow sets
 * a `columnId` filter; otherwise it subscribes to board-wide
 * `change_column_value`. Shared deactivate deletes the webhook.
 */
const activate = buildMondayActivate("column_changed");
registerActivation("monday", "column_changed", activate);
registerDeactivation("monday", "column_changed", mondaySharedDeactivate);

export { activate, mondaySharedDeactivate as deactivate };
