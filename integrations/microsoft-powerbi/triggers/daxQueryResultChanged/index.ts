import { registerActivation } from "@/services/triggers/activationRegistry";
import { activate } from "./activate";

/**
 * Module-init registration for the Power BI `dax_query_result_changed`
 * polling trigger. Activation-only — the shared
 * `microsoftPowerBiPollingHandler` is registered once from
 * `triggers/semanticModelRefreshCompleted/index.ts`.
 */

registerActivation("microsoft-powerbi", "dax_query_result_changed", activate);

export { activate };
