import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Asana discovery sub-registry — Slice 5.ASANA-1.
 *
 * First net-new V2 provider (no V1 code — docs/providers/asana/v1-audit.md).
 * Actions + triggers + metas + COVERED_PROVIDERS all land in ONE slice, so
 * 1:1 handler↔meta drift is enforced from day one.
 *
 * **Coverage:** 5 actions, 2 webhook triggers.
 *
 * Action metas in displayOrder (10..50):
 *   10 - create_task           40 - add_comment_to_task
 *   20 - update_task           50 - get_task
 *   30 - complete_task
 *
 * **Triggers:** 2 project-scoped webhook triggers (new_task_in_project,
 * task_updated_in_project) via Asana's POST /webhooks lifecycle with the
 * X-Hook-Secret handshake persisted per row. Each registers activation +
 * deactivation hooks in its `triggers/<event>/index.ts`, satisfying the
 * trigger-meta-activation-invariant test without an exemption.
 */

// actions/tasks
import { asanaCreateTaskMeta } from "@/integrations/asana/actions/tasks/createTask.meta";
import { asanaUpdateTaskMeta } from "@/integrations/asana/actions/tasks/updateTask.meta";
import { asanaCompleteTaskMeta } from "@/integrations/asana/actions/tasks/completeTask.meta";
import { asanaGetTaskMeta } from "@/integrations/asana/actions/tasks/getTask.meta";
// actions/comments
import { asanaAddCommentToTaskMeta } from "@/integrations/asana/actions/comments/addCommentToTask.meta";

// triggers
import { asanaNewTaskInProjectTriggerMeta } from "@/integrations/asana/triggers/newTaskInProject/newTaskInProject.meta";
import { asanaTaskUpdatedInProjectTriggerMeta } from "@/integrations/asana/triggers/taskUpdatedInProject/taskUpdatedInProject.meta";

export const ASANA_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  asanaCreateTaskMeta,
  asanaUpdateTaskMeta,
  asanaCompleteTaskMeta,
  asanaAddCommentToTaskMeta,
  asanaGetTaskMeta,
];

/** Asana webhook trigger metas — displayOrder 10..20. */
export const ASANA_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  asanaNewTaskInProjectTriggerMeta,
  asanaTaskUpdatedInProjectTriggerMeta,
];
