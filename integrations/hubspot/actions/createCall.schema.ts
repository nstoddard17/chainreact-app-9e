import { z } from "zod";

/**
 * `create_call` action schema — Slice 13 Batch 2.
 *
 * No required field — HubSpot accepts an empty call as a "logged
 * call" placeholder (V1's createCall has no required field). The
 * handler defaults `hs_call_status` to "COMPLETED" via Zod and
 * `hs_timestamp` to `Date.now()` if omitted.
 */
export const CreateCallConfigSchema = z
  .object({
    hs_call_title: z.string().min(1).optional(),
    hs_call_body: z.string().min(1).optional(),
    hs_call_duration: z.string().min(1).optional(),
    hs_call_direction: z.enum(["INBOUND", "OUTBOUND"]).optional(),
    hs_call_disposition: z.string().min(1).optional(),
    hs_call_status: z
      .enum(["BUSY", "CANCELED", "COMPLETED", "CONNECTING", "FAILED", "IN_PROGRESS", "NO_ANSWER", "QUEUED", "RINGING"])
      .default("COMPLETED"),
    hs_timestamp: z.string().min(1).optional(),
    hubspot_owner_id: z.string().min(1).optional(),
    associatedContactId: z.string().min(1).optional(),
    associatedCompanyId: z.string().min(1).optional(),
    associatedDealId: z.string().min(1).optional(),
    associatedTicketId: z.string().min(1).optional(),
  })
  .strict();

export type CreateCallConfig = z.infer<typeof CreateCallConfigSchema>;
