import { z } from "zod";

/**
 * `create_note` action schema — Slice 13 Batch 2.
 *
 * Required: `hs_note_body`. Optional associations to contact /
 * company / deal / ticket via the v4 default-typed associations API
 * (handled by `_shared/hubspot/api/associations.ts`).
 *
 * `hs_timestamp` accepts an ISO 8601 string OR a numeric epoch-ms
 * string. The handler converts ISO → ms-string before sending to
 * HubSpot (which expects ms). Omitted → handler defaults to
 * `Date.now()`. Surfaced as a normal optional schema field (no
 * required-explicit-choice gate — defaulting to "now" matches every
 * note-taking UX in V1 and isn't a high-risk decision).
 */
export const CreateNoteConfigSchema = z
  .object({
    hs_note_body: z.string().min(1),
    hs_timestamp: z.string().min(1).optional(),
    hubspot_owner_id: z.string().min(1).optional(),
    associatedContactId: z.string().min(1).optional(),
    associatedCompanyId: z.string().min(1).optional(),
    associatedDealId: z.string().min(1).optional(),
    associatedTicketId: z.string().min(1).optional(),
  })
  .strict();

export type CreateNoteConfig = z.infer<typeof CreateNoteConfigSchema>;
