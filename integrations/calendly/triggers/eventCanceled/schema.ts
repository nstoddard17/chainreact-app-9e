import { z } from "zod";

/**
 * Zod config schema for the Calendly `event_canceled` webhook trigger —
 * Slice 5.CALENDLY-1. Identical shape to eventScheduled (the lifecycle
 * is shared; only the subscribed provider event differs).
 */
export const CalendlyEventCanceledConfigSchema = z.object({
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
export type CalendlyEventCanceledConfig = z.infer<
  typeof CalendlyEventCanceledConfigSchema
>;
