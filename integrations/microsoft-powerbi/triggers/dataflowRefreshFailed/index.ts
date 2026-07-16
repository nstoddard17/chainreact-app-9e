import { registerActivation } from "@/services/triggers/activationRegistry";
import { activate } from "./activate";

/**
 * Module-init registration for the Power BI `dataflow_refresh_failed`
 * polling trigger. Activation-only — the shared
 * `microsoftPowerBiPollingHandler` is registered once via
 * `triggers/semanticModelRefreshCompleted/index.ts`.
 */

registerActivation("microsoft-powerbi", "dataflow_refresh_failed", activate);

export { activate };
