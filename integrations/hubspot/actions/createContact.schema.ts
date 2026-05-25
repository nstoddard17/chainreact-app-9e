import { z } from "zod";

/**
 * `create_contact` action schema.
 *
 * Slice 13 Batch 1. Core HubSpot CRM properties most workflows touch.
 * Custom properties are NOT modeled here — V1's "all_field_values" /
 * "custom_properties" patterns produce a giant dynamic schema; V2's
 * Batch 1 keeps the surface focused on the documented standard
 * properties. Custom-property support is a separate slice.
 *
 * Required: `email` — V1's createHubSpotContact also requires email
 * before issuing the POST. Properties are typed strings per HubSpot's
 * wire format (server coerces numbers/booleans to strings anyway).
 *
 * `duplicateHandling` is the V2 fix for V1's brittle regex-extract
 * `/Existing ID: (\d+)/` from error messages. V2 strategy on 409:
 *   - `'fail'` — surface the 409 as an error (default).
 *   - `'update'` — deterministic search-by-email + PATCH the existing
 *     contact.
 *   - `'skip'` — deterministic search-by-email + return the existing
 *     contact without changes.
 */
export const CreateContactConfigSchema = z
  .object({
    email: z.string().email(),
    firstname: z.string().min(1).optional(),
    lastname: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
    company: z.string().min(1).optional(),
    jobtitle: z.string().min(1).optional(),
    website: z.string().min(1).optional(),
    lifecyclestage: z.string().min(1).optional(),
    hs_lead_status: z.string().min(1).optional(),
    address: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
    zip: z.string().min(1).optional(),
    country: z.string().min(1).optional(),
    duplicateHandling: z
      .enum(["fail", "update", "skip"])
      .default("fail"),
  })
  .strict();

export type CreateContactConfig = z.infer<typeof CreateContactConfigSchema>;
