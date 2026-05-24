import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
import { activate } from "./activate";
import { deactivate } from "./deactivate";
import { googleDocsNewDocumentSubscriptionHandler } from "./renew";

/**
 * Module-init registration for the Google Docs `new_document`
 * watch-based push trigger — Slice 3.GDOCS-5.
 *
 * Three registrations (mirrors
 * `integrations/google-drive/triggers/fileChanged/index.ts`):
 *   - activation:        captures startPageToken + creates Drive watch
 *   - deactivation:      stops the watch when the workflow is disabled
 *   - subscription:      renews the watch before expiry (24h threshold)
 *
 * Importing this module from `integrations/_registry.ts` forces all
 * three registrations at module load. The webhook receiver and
 * renewal cron both transitively import the integrations registry.
 */
registerActivation("google-docs", "new_document", activate);
registerDeactivation("google-docs", "new_document", deactivate);
registerSubscriptionHandler(googleDocsNewDocumentSubscriptionHandler);

export { activate, deactivate, googleDocsNewDocumentSubscriptionHandler };
