import { registerActivation } from "@/services/triggers/activationRegistry";
import { activate } from "./activate";

/**
 * Module-init registration for the Power BI `workspace_access_changed`
 * polling trigger. Activation-only — the shared
 * `microsoftPowerBiPollingHandler` is registered once from
 * `triggers/semanticModelRefreshCompleted/index.ts`.
 */

registerActivation("microsoft-powerbi", "workspace_access_changed", activate);

export { activate };
