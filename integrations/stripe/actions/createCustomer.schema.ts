import { z } from "zod";

/**
 * `create_customer` action schema.
 *
 * Slice 11 Batch 1 — minimal customer surface area: email + name +
 * description + metadata. Address / shipping / tax_id_data /
 * preferred_locales / invoice_settings deferred. V1 ships all of
 * these but Slice 11 keeps Batch 1 focused on the most-common
 * fields; the deferred set adds 100+ LOC of bracket-notation
 * construction with low marginal value for the first cut.
 *
 * Q11 — every field explicit. `email` is required (Stripe accepts
 * customers without email but workflow-driven creation almost always
 * has one; making it required surfaces missing-email bugs at design
 * time).
 *
 * `metadata` is `Record<string, string>` per Stripe's wire-format —
 * Stripe coerces numbers / booleans to strings server-side anyway,
 * but typing it as string-only here forces workflow authors to be
 * explicit about coercion at the schema layer.
 */
export const CreateCustomerConfigSchema = z
  .object({
    email: z.string().email(),
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export type CreateCustomerConfig = z.infer<typeof CreateCustomerConfigSchema>;
