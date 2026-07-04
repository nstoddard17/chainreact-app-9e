import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerTriggerFilter } from "@/core/triggers/filterRegistry";
import { makeCalendlyActivate } from "../_shared/activate";
import { calendlyDeactivate } from "../_shared/deactivate";
import { calendlyEventScheduledFilter } from "./filter";

/**
 * Module-init registration for the Calendly `event_scheduled` trigger —
 * Slice 5.CALENDLY-1.
 *
 * User-scoped webhook subscription with a caller-minted signing key (no
 * creation handshake — Typeform posture). Imported by
 * `integrations/_registry.ts` (boot pipeline) AND
 * `app/api/webhooks/calendly/route.ts` (cold serverless receive
 * invocations — without it the P-S2 subscriber/event-type filter
 * registry would be empty and events would match all rows).
 *
 * **NO subscription/renewal registration** — Calendly subscriptions
 * don't expire on a schedule (same "permanent endpoint" pattern as
 * GitHub / Monday / Asana / Typeform).
 */
export const calendlyEventScheduledActivate =
  makeCalendlyActivate("event_scheduled");

registerActivation("calendly", "event_scheduled", calendlyEventScheduledActivate);
registerDeactivation("calendly", "event_scheduled", calendlyDeactivate);
registerTriggerFilter(calendlyEventScheduledFilter);

export {
  calendlyDeactivate as deactivate,
  calendlyEventScheduledFilter,
};
