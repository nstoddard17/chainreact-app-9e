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
 *
 * `hs_timestamp` (the task due date) is REQUIRED by HubSpot's tasks
 * API — omitting it fails the POST with "Some required properties
 * were not set" (verified live, 2026-07-04 action smoke). Like
 * `create_note`, the handler defaults it to `Date.now()` when the
 * workflow author omits it (same UX-safe fall-through V1 shipped).
 */
export const createTask: ActionHandler = async (input) => {
  const config = CreateTaskConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "hubspot"
      ? input.triggerEvent.providerAccountId
      : null;

  const properties: Record<string, string> = {
    hs_task_subject: config.hs_task_subject,
    hs_task_status: config.hs_task_status,
    hs_task_priority: config.hs_task_priority,
    hs_task_type: config.hs_task_type,
  };
  if (config.hs_task_body) properties.hs_task_body = config.hs_task_body;
  // hs_timestamp is REQUIRED by the tasks API (unlike most engagement
  // properties) — default to now() exactly like create_note does.
  properties.hs_timestamp =
    resolveTimestampMs(config.hs_timestamp) ?? Date.now().toString();
  if (config.hs_task_reminders) {
    properties.hs_task_reminders = config.hs_task_reminders;
  }
  if (config.hubspot_owner_id) {
    properties.hubspot_owner_id = config.hubspot_owner_id;
  }

  const task = await refreshAndRetry({
    accountId: input.accountId,
    provider: "hubspot",
    providerAccountId,
    apiCall: (accessToken) =>
      tasksCreate({ accessToken, properties }),
  });

  const assoc = await refreshAndRetry({
    accountId: input.accountId,
    provider: "hubspot",
    providerAccountId,
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
