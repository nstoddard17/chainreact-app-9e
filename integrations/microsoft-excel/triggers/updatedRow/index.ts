import { registerActivation } from "@/services/triggers/activationRegistry";
import { activate } from "./activate";

/**
 * Module-init registration for the Excel `updated_row` polling trigger.
 *
 * Activation-only — the shared `microsoftExcelPollingHandler` is
 * registered once via `triggers/newRow/index.ts` and covers all five
 * Excel event types via its `canHandle` predicate.
 */

registerActivation("microsoft-excel", "updated_row", activate);

export { activate };
