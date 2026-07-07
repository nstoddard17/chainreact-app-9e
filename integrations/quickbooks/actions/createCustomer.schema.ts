import { z } from "zod";

/**
 * Config schema for `quickbooks:create_customer` — QUICKBOOKS-1.
 *
 * `displayName` is required (QBO accepts bare name components, but a V2
 * record must always be findable by name — and DisplayName uniqueness
 * across Customer/Vendor/Employee makes the duplicate error legible).
 * Everything else is optional and passed through ONLY when provided —
 * no hidden defaults.
 */
export const CreateCustomerConfigSchema = z
  .object({
    displayName: z.string().min(1).max(500),
    companyName: z.string().max(500).optional(),
    givenName: z.string().max(100).optional(),
    familyName: z.string().max(100).optional(),
    email: z.string().max(320).optional(),
    phone: z.string().max(30).optional(),
    addressLine1: z.string().max(500).optional(),
    addressLine2: z.string().max(500).optional(),
    city: z.string().max(255).optional(),
    state: z.string().max(255).optional(),
    postalCode: z.string().max(30).optional(),
    country: z.string().max(255).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();
export type CreateCustomerConfig = z.infer<typeof CreateCustomerConfigSchema>;
