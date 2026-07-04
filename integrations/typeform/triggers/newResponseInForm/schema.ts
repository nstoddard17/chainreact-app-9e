import { z } from "zod";

/**
 * Zod config schema for the Typeform `new_response_in_form` webhook
 * trigger — Slice 5.TYPEFORM-1.
 *
 * User-set field: `formId` (the form to watch). The remaining fields are
 * written by the activation flow (`activate.ts`) and are optional from
 * the builder's perspective. Non-strict so the post-activation merged
 * config still parses (Asana precedent).
 */
export const TypeformNewResponseInFormConfigSchema = z.object({
  formId: z.string().min(1),

  // Activation-written lifecycle fields.
  webhookEnabled: z.boolean().default(false),
  /** Deterministic per-(workflow, node) tag — Typeform's webhook key. */
  webhookTag: z.string().optional(),
  /** Typeform's webhook id from the PUT response (informational). */
  webhookId: z.string().optional(),
  /** V2-minted HMAC signing key, encrypted at rest. */
  hookSecretEncrypted: z.string().optional(),
  /** The exact URL registered with Typeform. */
  notificationUrl: z.string().optional(),
});
export type TypeformNewResponseInFormConfig = z.infer<
  typeof TypeformNewResponseInFormConfigSchema
>;
