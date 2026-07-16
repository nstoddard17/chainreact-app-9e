import { registerActivation } from "@/services/triggers/activationRegistry";
import { activate } from "./activate";

/**
 * Module-init registration for the Power BI
 * `gateway_datasource_status_changed` polling trigger. Activation-only —
 * the shared `microsoftPowerBiPollingHandler` is registered once from
 * `triggers/semanticModelRefreshCompleted/index.ts`.
 */

registerActivation(
  "microsoft-powerbi",
  "gateway_datasource_status_changed",
  activate,
);

export { activate };
