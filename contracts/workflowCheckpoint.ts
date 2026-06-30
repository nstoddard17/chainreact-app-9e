import { z } from "zod";
import { WorkflowDefinitionSchema } from "./workflowDefinition";

/**
 * Contract for workflow checkpoints (CHECKPOINTS-1) — durable, account-scoped
 * "restore points" for a workflow's DRAFT graph.
 *
 * A checkpoint answers "can I go back?": it stores the draft definition as it
 * was just before a notable change (launch scope: a React Agent apply), the
 * prompt that drove the change, and a plain-English summary. It is distinct
 * from published `workflow_revisions` and from the session-only builder
 * undo/redo stack.
 *
 * The LIST DTO deliberately OMITS the `definition` JSON — the recent-checkpoints
 * UI needs only metadata, and the restoreable snapshot stays server-side until
 * an explicit restore reads it by id. This keeps the list light and avoids
 * shipping the draft graph around for display.
 */

export const WORKFLOW_CHECKPOINT_SOURCES = ["react_agent", "manual", "system"] as const;
export const WorkflowCheckpointSourceSchema = z.enum(WORKFLOW_CHECKPOINT_SOURCES);
export type WorkflowCheckpointSource = z.infer<typeof WorkflowCheckpointSourceSchema>;

/** Max lengths keep a single checkpoint row bounded (defense-in-depth at the API boundary). */
export const CHECKPOINT_NAME_MAX = 120;
export const CHECKPOINT_PROMPT_MAX = 2000;
export const CHECKPOINT_SUMMARY_MAX = 2000;

/** Safe metadata DTO returned to the client for the recent-checkpoints list. No `definition`. */
export interface WorkflowCheckpoint {
  readonly id: string;
  readonly workflowId: string;
  readonly source: WorkflowCheckpointSource;
  readonly name: string;
  readonly prompt: string | null;
  readonly summary: string | null;
  /** Provenance — the actor who created the checkpoint; null when the user was deleted. */
  readonly createdByUserId: string | null;
  readonly createdAt: string;
}

/**
 * POST body to create a checkpoint. `definition` is the PRE-change draft snapshot
 * the user can restore to (validated against the canonical workflow-definition
 * schema). `source` / `name` / `prompt` / `summary` describe the change. The
 * server sets `account_id` (from the workflow) and `created_by_user_id` (from the
 * authenticated user) — the client never supplies them.
 */
export const CreateWorkflowCheckpointRequestSchema = z.object({
  definition: WorkflowDefinitionSchema,
  source: WorkflowCheckpointSourceSchema,
  name: z.string().trim().min(1).max(CHECKPOINT_NAME_MAX),
  prompt: z.string().trim().max(CHECKPOINT_PROMPT_MAX).optional(),
  summary: z.string().trim().max(CHECKPOINT_SUMMARY_MAX).optional(),
});
export type CreateWorkflowCheckpointRequest = z.infer<
  typeof CreateWorkflowCheckpointRequestSchema
>;

/** GET list response shape. */
export interface ListWorkflowCheckpointsResponse {
  readonly checkpoints: readonly WorkflowCheckpoint[];
}
