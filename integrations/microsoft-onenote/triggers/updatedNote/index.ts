import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerPollingHandler } from "@/services/triggers/pollingRegistry";
import { activate } from "./activate";
import { microsoftOneNoteUpdatedNotePollingHandler } from "./poll";

/**
 * Module-init registration for the OneNote `updated_note` polling
 * trigger — Slice 3.ONENOTE-5.
 *
 * Importing this module registers BOTH the activation hook (seeds
 * `snapshot.lastSeenModifiedDateTime` from the section's current
 * most-recently-modified page) and the polling handler (5-minute
 * default cadence). The cron route imports
 * `integrations/_registry` which transitively imports this module, so
 * registration happens before the first poll executes.
 *
 * The activation registration satisfies
 * `tests/structure/trigger-meta-activation-invariant.test.ts` without
 * an exemption.
 */

registerActivation("microsoft-onenote", "updated_note", activate);
registerPollingHandler(microsoftOneNoteUpdatedNotePollingHandler);

export { activate, microsoftOneNoteUpdatedNotePollingHandler };
