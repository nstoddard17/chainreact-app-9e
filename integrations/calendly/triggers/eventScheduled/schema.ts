import { z } from "zod";

/**
 * Zod config schema for the Calendly `event_scheduled` webhook trigger —
 * Slice 5.CALENDLY-1.
 *
 * User-set field: `eventTypeId` (OPTIONAL — narrow the trigger to one
 * Calendly event type; absent = all bookings). The remaining fields are
 * written by the activation flow (`triggers/_shared/activate.ts`) and
 * are optional from the builder's perspective. Non-strict so the
 * post-activation merged config still parses (Asana/Typeform precedent).
 */
export const CalendlyEventScheduledConfigSchema = z.object({
  /** Optional event-type filter (Calendly event type UUID). */
  eventTypeId: z.string().min(1).optional(),

  // Activation-written lifecycle fields.
  webhookEnabled: z.boolean().default(false),
  /** Calendly's webhook-subscription URI, for deactivation DELETE. */
  subscriptionUri: z.string().optional(),
  /** V2-minted HMAC signing key, encrypted at rest. */
  hookSecretEncrypted: z.string().optional(),
  /** The exact URL registered with Calendly. */
  notificationUrl: z.string().optional(),
  /** Connected user's UUID — P-S2 filter attribution + dedup scope. */
  calendlyUserId: z.string().optional(),
  /** Connected user's URI (informational). */
  calendlyUserUri: z.string().optional(),
  /** Organization URI the subscription rode on (informational). */
  organizationUri: z.string().optional(),
});
export type CalendlyEventScheduledConfig = z.infer<
  typeof CalendlyEventScheduledConfigSchema
>;
