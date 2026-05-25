import { registerActivation } from "@/services/triggers/activationRegistry";
import { activate } from "./activate";

/**
 * Module-init registration for the Excel `new_table_row` polling trigger.
 *
 * Activation-only — the shared `microsoftExcelPollingHandler` is
 * registered once via `triggers/newRow/index.ts` and covers both
 * event types via its `canHandle` predicate.
 */

registerActivation("microsoft-excel", "new_table_row", activate);

export { activate };
