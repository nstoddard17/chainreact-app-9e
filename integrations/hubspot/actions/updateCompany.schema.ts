import { z } from "zod";

/**
 * `update_company` action schema — Slice 13 Batch 1.
 *
 * Required: `companyId` (HubSpot internal id). At least one property
 * field must be present (handler enforces).
 */
export const UpdateCompanyConfigSchema = z
  .object({
    companyId: z.string().min(1),
    name: z.string().min(1).optional(),
    domain: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
    website: z.string().min(1).optional(),
    address: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
    zip: z.string().min(1).optional(),
    country: z.string().min(1).optional(),
    industry: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    annualrevenue: z.string().min(1).optional(),
    numberofemployees: z.string().min(1).optional(),
    lifecyclestage: z.string().min(1).optional(),
  })
  .strict();

export type UpdateCompanyConfig = z.infer<typeof UpdateCompanyConfigSchema>;
