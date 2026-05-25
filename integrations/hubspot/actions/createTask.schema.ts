import { z } from "zod";

/**
 * `create_task` action schema — Slice 13 Batch 2.
 *
 * Required: `hs_task_subject`. V1 defaults `hs_task_status` to
 * "NOT_STARTED", `hs_task_priority` to "MEDIUM", `hs_task_type` to
 * "TODO" — V2 makes those defaults EXPLICIT via Zod `.default()` so
 * workflow authors see the resolved value at design time. None are
 * customer-facing (purely internal task metadata) so a Q11 explicit-
 * choice gate isn't warranted.
 */
export const CreateTaskConfigSchema = z
  .object({
    hs_task_subject: z.string().min(1),
    hs_task_body: z.string().min(1).optional(),
    hs_task_status: z
      .enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "WAITING", "DEFERRED"])
      .default("NOT_STARTED"),
    hs_task_priority: z
      .enum(["LOW", "MEDIUM", "HIGH"])
      .default("MEDIUM"),
    hs_task_type: z
      .enum(["TODO", "CALL", "EMAIL"])
      .default("TODO"),
    hs_timestamp: z.string().min(1).optional(),
    hs_task_reminders: z.string().min(1).optional(),
    hubspot_owner_id: z.string().min(1).optional(),
    associatedContactId: z.string().min(1).optional(),
    associatedCompanyId: z.string().min(1).optional(),
    associatedDealId: z.string().min(1).optional(),
    associatedTicketId: z.string().min(1).optional(),
  })
  .strict();

export type CreateTaskConfig = z.infer<typeof CreateTaskConfigSchema>;
