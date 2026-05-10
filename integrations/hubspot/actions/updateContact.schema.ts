import { z } from "zod";

/**
 * `update_contact` action schema — Slice 13 Batch 1.
 *
 * Required: `contactId` (the HubSpot internal id). V1's update flow
 * supports an `email`-mode lookup, but V2 keeps the contract simple:
 * pass the id you want to update. Email-based update flows belong in
 * `create_contact` with `duplicateHandling: "update"`.
 *
 * At least ONE property field MUST be provided (handler enforces).
 * Properties are typed strings per HubSpot's wire format.
 */
export const UpdateContactConfigSchema = z
  .object({
    contactId: z.string().min(1),
    email: z.string().email().optional(),
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
  })
  .strict();

export type UpdateContactConfig = z.infer<typeof UpdateContactConfigSchema>;
