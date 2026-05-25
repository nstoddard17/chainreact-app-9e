import { z } from "zod";

/**
 * `create_ticket` action schema — Slice 13 Batch 2.
 *
 * Required: `subject`, `hs_pipeline`, `hs_pipeline_stage`. V1's
 * createTicket enforces all three; V2 enforces at the schema layer.
 *
 * Optional associations: `associatedContactId`, `associatedCompanyId`,
 * `associatedDealId`. Empty / undefined values are skipped. Failed
 * associations don't roll back ticket creation — surfaced as
 * `associationWarnings` in the handler output.
 *
 * Attachments are DEFERRED (V1 ships file-upload + ticket_to_file; V2
 * doesn't have a file-storage abstraction yet — separate slice).
 */
export const CreateTicketConfigSchema = z
  .object({
    subject: z.string().min(1),
    hs_pipeline: z.string().min(1),
    hs_pipeline_stage: z.string().min(1),
    content: z.string().min(1).optional(),
    hs_ticket_priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    hs_ticket_category: z.string().min(1).optional(),
    source_type: z.string().min(1).optional(),
    hubspot_owner_id: z.string().min(1).optional(),
    associatedContactId: z.string().min(1).optional(),
    associatedCompanyId: z.string().min(1).optional(),
    associatedDealId: z.string().min(1).optional(),
  })
  .strict();

export type CreateTicketConfig = z.infer<typeof CreateTicketConfigSchema>;
