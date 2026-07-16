import { registerActivation } from "@/services/triggers/activationRegistry";
import { activate } from "./activate";

/**
 * Module-init registration for the Power BI
 * `pipeline_deployment_completed` polling trigger. Activation-only — the
 * shared `microsoftPowerBiPollingHandler` is registered once via
 * `triggers/semanticModelRefreshCompleted/index.ts`.
 */

registerActivation(
  "microsoft-powerbi",
  "pipeline_deployment_completed",
  activate,
);

export { activate };
