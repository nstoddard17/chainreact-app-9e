import { z } from "zod";

/**
 * `create_company` action schema — Slice 13 Batch 1.
 *
 * Required: `name` (HubSpot allows missing names but V1 enforces).
 * `domain` is optional but recommended — it's the field most HubSpot
 * automation rules dedupe on.
 *
 * Same `duplicateHandling` enum as `create_contact` — applies when
 * HubSpot's CRM v3 returns 409 on a duplicate domain. Recovery uses
 * deterministic `findCompanyByDomain` (search-by-property), NOT regex.
 */
export const CreateCompanyConfigSchema = z
  .object({
    name: z.string().min(1),
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
    duplicateHandling: z.enum(["fail", "update", "skip"]).default("fail"),
  })
  .strict();

export type CreateCompanyConfig = z.infer<typeof CreateCompanyConfigSchema>;
