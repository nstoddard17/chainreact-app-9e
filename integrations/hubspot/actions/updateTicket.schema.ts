import { z } from "zod";

/**
 * `update_ticket` action schema — Slice 13 Batch 2.
 *
 * Required: `ticketId`. At least one property field must be present
 * (handler enforces). No association handling on update (V1 also
 * doesn't ship it on update; ticket relinking is a separate flow).
 */
export const UpdateTicketConfigSchema = z
  .object({
    ticketId: z.string().min(1),
    subject: z.string().min(1).optional(),
    content: z.string().min(1).optional(),
    hs_pipeline: z.string().min(1).optional(),
    hs_pipeline_stage: z.string().min(1).optional(),
    hs_ticket_priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    hs_ticket_category: z.string().min(1).optional(),
    source_type: z.string().min(1).optional(),
    hubspot_owner_id: z.string().min(1).optional(),
  })
  .strict();

export type UpdateTicketConfig = z.infer<typeof UpdateTicketConfigSchema>;
