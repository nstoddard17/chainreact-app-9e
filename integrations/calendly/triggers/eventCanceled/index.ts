import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerTriggerFilter } from "@/core/triggers/filterRegistry";
import { makeCalendlyActivate } from "../_shared/activate";
import { calendlyDeactivate } from "../_shared/deactivate";
import { calendlyEventCanceledFilter } from "./filter";

/**
 * Module-init registration for the Calendly `event_canceled` trigger —
 * Slice 5.CALENDLY-1. See eventScheduled/index.ts — identical lifecycle
 * (shared activate factory + shared deactivate), differing only in the
 * subscribed provider event (`invitee.canceled`).
 */
export const calendlyEventCanceledActivate =
  makeCalendlyActivate("event_canceled");

registerActivation("calendly", "event_canceled", calendlyEventCanceledActivate);
registerDeactivation("calendly", "event_canceled", calendlyDeactivate);
registerTriggerFilter(calendlyEventCanceledFilter);

export {
  calendlyDeactivate as deactivate,
  calendlyEventCanceledFilter,
};
