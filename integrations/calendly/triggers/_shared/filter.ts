import { z } from "zod";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  FilterResult,
  TriggerFilter,
} from "@/core/triggers/filterContract";
import type { CalendlyTriggerType } from "./eventMap";

/**
 * Shared filter factory for the Calendly triggers (P-S2) — Slice
 * 5.CALENDLY-1.
 *
 * The dispatcher fans out by (provider, eventType) GLOBALLY: an
 * invitee event dedups across the per-workflow subscriptions, then
 * matches every `(calendly, <type>)` trigger row. This filter narrows on
 * TWO dimensions:
 *
 *   1. `calendlyUserId` (REQUIRED, activation-written) — must equal the
 *      event's row-attributed `subscriberUserId`. This is the
 *      cross-account isolation: subscriptions are user-scoped, so the
 *      connected user IS the watched resource (the Typeform formId /
 *      Asana projectId analog). A row belonging to a different Calendly
 *      user never fires on this user's bookings.
 *   2. `eventTypeId` (OPTIONAL, user-chosen) — when configured, the
 *      event's `eventTypeId` must match ("only my Discovery Call
 *      bookings"). Absent = all event types. An event MISSING an
 *      eventTypeId while the row filters on one → no-match (fails
 *      closed; covers the older payload generation without the embedded
 *      scheduled_event).
 *
 * Fails closed: a row missing the activation-written `calendlyUserId`
 * throws in `parseConfig` (unarmed/corrupt rows never fire).
 */
const ConfigSchema = z.object({
  calendlyUserId: z.string().min(1),
  eventTypeId: z.string().min(1).optional(),
});
type Config = z.infer<typeof ConfigSchema>;

export function makeCalendlyFilter(
  eventType: CalendlyTriggerType,
): TriggerFilter<Config> {
  return {
    provider: "calendly",
    eventType,
    parseConfig(rawConfig: unknown): Config {
      return ConfigSchema.parse(rawConfig);
    },
    evaluate(event: TriggerEvent, config: Config): FilterResult {
      const subscriberUserId = event.payload.subscriberUserId;
      if (subscriberUserId !== config.calendlyUserId) {
        return {
          kind: "no-match",
          reason: `subscriber ${String(subscriberUserId)} does not match connected user ${config.calendlyUserId}`,
        };
      }
      if (config.eventTypeId) {
        const eventTypeId = event.payload.eventTypeId;
        if (eventTypeId !== config.eventTypeId) {
          return {
            kind: "no-match",
            reason: `event type ${String(eventTypeId)} does not match filter ${config.eventTypeId}`,
          };
        }
      }
      return { kind: "match" };
    },
  };
}
