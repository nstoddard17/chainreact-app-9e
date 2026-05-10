import { z } from "zod";

/**
 * `create_meeting` action schema — Slice 13 Batch 2.
 *
 * Required: `hs_meeting_title`. Defaults `hs_meeting_outcome` to
 * "SCHEDULED" via Zod. Start/end times accept ISO 8601 OR epoch-ms
 * string; handler resolves to epoch-ms-string before sending.
 */
export const CreateMeetingConfigSchema = z
  .object({
    hs_meeting_title: z.string().min(1),
    hs_meeting_body: z.string().min(1).optional(),
    hs_meeting_start_time: z.string().min(1).optional(),
    hs_meeting_end_time: z.string().min(1).optional(),
    hs_meeting_location: z.string().min(1).optional(),
    hs_meeting_outcome: z
      .enum(["SCHEDULED", "COMPLETED", "RESCHEDULED", "NO_SHOW", "CANCELED"])
      .default("SCHEDULED"),
    hs_timestamp: z.string().min(1).optional(),
    hubspot_owner_id: z.string().min(1).optional(),
    associatedContactId: z.string().min(1).optional(),
    associatedCompanyId: z.string().min(1).optional(),
    associatedDealId: z.string().min(1).optional(),
    associatedTicketId: z.string().min(1).optional(),
  })
  .strict();

export type CreateMeetingConfig = z.infer<typeof CreateMeetingConfigSchema>;
