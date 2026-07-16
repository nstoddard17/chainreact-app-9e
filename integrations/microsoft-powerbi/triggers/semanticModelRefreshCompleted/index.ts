import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerPollingHandler } from "@/services/triggers/pollingRegistry";
import { microsoftPowerBiPollingHandler } from "../_shared/pollingHandler";
import { activate } from "./activate";

/**
 * Module-init registration for the Power BI
 * `semantic_model_refresh_completed` polling trigger.
 *
 * This module also registers the provider's ONE shared polling handler,
 * which covers every Power BI event type via its `canHandle` predicate.
 * The other trigger modules register activation only — registering the
 * handler again would push a duplicate onto the polling registry.
 */

registerPollingHandler(microsoftPowerBiPollingHandler);

registerActivation(
  "microsoft-powerbi",
  "semantic_model_refresh_completed",
  activate,
);

export { activate };
