import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { attachAssociations } from "../../_shared/hubspot/api/associations";
import { tasksCreate } from "../../_shared/hubspot/api/engagements";
import { resolveTimestampMs } from "./_resolveTimestamp";
import { CreateTaskConfigSchema } from "./createTask.schema";

/**
 * HubSpot `create_task` action handler — Slice 13 Batch 2.
 *
 * POSTs `/crm/v3/objects/tasks` with required `hs_task_subject` +
 * explicit Zod-defaulted status/priority/type. Optional associations
 * to contact / company / deal / ticket via v4 default-typed PUTs.
 */
export const createTask: ActionHandler = async (input) => {
  const config = CreateTaskConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "hubspot"
      ? input.triggerEvent.accountId
      : null;

  const properties: Record<string, string> = {
    hs_task_subject: config.hs_task_subject,
    hs_task_status: config.hs_task_status,
    hs_task_priority: config.hs_task_priority,
    hs_task_type: config.hs_task_type,
  };
  if (config.hs_task_body) properties.hs_task_body = config.hs_task_body;
  const ts = resolveTimestampMs(config.hs_timestamp);
  if (ts) properties.hs_timestamp = ts;
  if (config.hs_task_reminders) {
    properties.hs_task_reminders = config.hs_task_reminders;
  }
  if (config.hubspot_owner_id) {
    properties.hubspot_owner_id = config.hubspot_owner_id;
  }

  const task = await refreshAndRetry({
    userId: input.userId,
    provider: "hubspot",
    accountId,
    apiCall: (accessToken) =>
      tasksCreate({ accessToken, properties }),
  });

  const assoc = await refreshAndRetry({
    userId: input.userId,
    provider: "hubspot",
    accountId,
    apiCall: (accessToken) =>
      attachAssociations({
        accessToken,
        fromType: "tasks",
        fromId: task.id,
        toIds: {
          contacts: config.associatedContactId,
          companies: config.associatedCompanyId,
          deals: config.associatedDealId,
          tickets: config.associatedTicketId,
        },
      }),
  });

  return {
    output: {
      taskId: task.id,
      subject: task.properties.hs_task_subject ?? config.hs_task_subject,
      status: task.properties.hs_task_status ?? config.hs_task_status,
      priority: task.properties.hs_task_priority ?? config.hs_task_priority,
      type: task.properties.hs_task_type ?? config.hs_task_type,
      createdAt: task.createdAt ?? null,
      properties: task.properties,
      associationsAttached: assoc.attached,
      associationWarnings: assoc.warnings,
    },
  };
};
