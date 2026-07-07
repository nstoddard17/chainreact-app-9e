import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Asana discovery sub-registry — Slice 5.ASANA-1.
 *
 * First net-new V2 provider (no V1 code — docs/providers/asana/v1-audit.md).
 * Actions + triggers + metas + COVERED_PROVIDERS all land in ONE slice, so
 * 1:1 handler↔meta drift is enforced from day one.
 *
 * **Coverage:** 7 actions, 5 webhook triggers (ASANA-1 + ASANA-2).
 *
 * Action metas in displayOrder (10..70):
 *   10 - create_task           40 - add_comment_to_task   70 - list_tasks_in_project
 *   20 - update_task           50 - get_task
 *   30 - complete_task         60 - create_subtask
 *
 * **Triggers:** 5 project-scoped webhook triggers (new_task_in_project,
 * task_updated_in_project + ASANA-2's task_completed, task_assigned,
 * comment_added_to_task) via Asana's POST /webhooks lifecycle with the
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
// ASANA-2 actions
import { asanaCreateSubtaskMeta } from "@/integrations/asana/actions/tasks/createSubtask.meta";
import { asanaListTasksInProjectMeta } from "@/integrations/asana/actions/tasks/listTasksInProject.meta";

// triggers
import { asanaNewTaskInProjectTriggerMeta } from "@/integrations/asana/triggers/newTaskInProject/newTaskInProject.meta";
import { asanaTaskUpdatedInProjectTriggerMeta } from "@/integrations/asana/triggers/taskUpdatedInProject/taskUpdatedInProject.meta";
// ASANA-2 triggers
import { asanaTaskCompletedTriggerMeta } from "@/integrations/asana/triggers/taskCompleted/taskCompleted.meta";
import { asanaTaskAssignedTriggerMeta } from "@/integrations/asana/triggers/taskAssigned/taskAssigned.meta";
import { asanaCommentAddedToTaskTriggerMeta } from "@/integrations/asana/triggers/commentAddedToTask/commentAddedToTask.meta";

export const ASANA_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  asanaCreateTaskMeta,
  asanaUpdateTaskMeta,
  asanaCompleteTaskMeta,
  asanaAddCommentToTaskMeta,
  asanaGetTaskMeta,
  asanaCreateSubtaskMeta,
  asanaListTasksInProjectMeta,
];

/** Asana webhook trigger metas — displayOrder 10..50. */
export const ASANA_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  asanaNewTaskInProjectTriggerMeta,
  asanaTaskUpdatedInProjectTriggerMeta,
  asanaTaskCompletedTriggerMeta,
  asanaTaskAssignedTriggerMeta,
  asanaCommentAddedToTaskTriggerMeta,
];
