import { registerActivation } from "@/services/triggers/activationRegistry";
import { activate } from "./activate";

/**
 * Module-init registration for the Power BI `dax_condition_met` polling
 * trigger. Activation-only — the shared `microsoftPowerBiPollingHandler`
 * is registered once from `triggers/semanticModelRefreshCompleted/index.ts`
 * and covers every Power BI event type via its `canHandle` predicate.
 */

registerActivation("microsoft-powerbi", "dax_condition_met", activate);

export { activate };
