import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
import { activate } from "./activate";
import { deactivate } from "./deactivate";
import { airtableRecordChangedSubscriptionHandler } from "./renew";

/**
 * Module-init registration for the Airtable `record_changed`
 * subscription-watch trigger.
 *
 * Three registrations:
 *   - activation: creates the Airtable webhook + persists
 *     webhookId / macSecretBase64 / baseId / tableIdOrName / expiresAt
 *     to `trigger_resources.config`.
 *   - deactivation: deletes the webhook when the workflow is disabled.
 *     Best-effort 404/403 → swallow.
 *   - subscription handler: refreshes the webhook before its 7-day
 *     TTL via `runRenewals` cron with a 6-day threshold.
 *
 * Importing this module from `integrations/_registry.ts` forces all
 * three registrations at module load. The webhook receive route also
 * transitively imports the registry to ensure the deactivation hook
 * is available even when the receive path runs in a fresh worker
 * process.
 */
registerActivation("airtable", "record_changed", activate);
registerDeactivation("airtable", "record_changed", deactivate);
registerSubscriptionHandler(airtableRecordChangedSubscriptionHandler);

export {
  activate,
  deactivate,
  airtableRecordChangedSubscriptionHandler,
};
