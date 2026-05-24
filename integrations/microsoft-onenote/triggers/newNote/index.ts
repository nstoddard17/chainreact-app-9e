import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerPollingHandler } from "@/services/triggers/pollingRegistry";
import { activate } from "./activate";
import { microsoftOneNoteNewNotePollingHandler } from "./poll";

/**
 * Module-init registration for the OneNote `new_note` polling trigger
 * — Slice 3.ONENOTE-5.
 *
 * Importing this module registers BOTH the activation hook (seeds
 * `snapshot.lastSeenCreatedDateTime` from the section's current
 * newest page — first-poll-miss protection) and the polling handler
 * (5-minute default cadence). The cron route
 * (`app/api/cron/poll-triggers/route.ts`) imports
 * `integrations/_registry` which transitively imports this module, so
 * registration happens before the first poll executes.
 *
 * The activation registration satisfies
 * `tests/structure/trigger-meta-activation-invariant.test.ts` without
 * an exemption — every polling trigger MUST have an activation
 * function per the first-poll-miss rule.
 */

registerActivation("microsoft-onenote", "new_note", activate);
registerPollingHandler(microsoftOneNoteNewNotePollingHandler);

export { activate, microsoftOneNoteNewNotePollingHandler };
