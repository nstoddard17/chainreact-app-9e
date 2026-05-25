import { registerActivation } from "@/services/triggers/activationRegistry";
import { activate } from "./activate";

/**
 * Module-init registration for the Excel `new_worksheet` polling trigger.
 *
 * Activation-only — the shared `microsoftExcelPollingHandler` is
 * registered once via `triggers/newRow/index.ts` and covers all five
 * Excel event types via its `canHandle` predicate.
 */

registerActivation("microsoft-excel", "new_worksheet", activate);

export { activate };
