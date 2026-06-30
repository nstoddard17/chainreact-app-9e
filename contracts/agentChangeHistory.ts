import { z } from "zod";

/**
 * Contract for agent change history (AGENT-CHANGE-HISTORY-1) — a user-visible,
 * account-scoped ACTIVITY TIMELINE of what the React Agent did to a workflow.
 *
 * Each notable agent interaction (a preview shown, applied, discarded, undone,
 * or a checkpoint restored) is one item carrying the prompt, a value-free change
 * summary + counts, a typed status, and optional links to the checkpoint / run
 * it produced. It answers "what did the agent do?" — distinct from checkpoints
 * (restore points) and from the value-free governance audit ledger.
 *
 * Privacy: NO config values, before/after values, raw patches, provider
 * payloads, tokens, or secrets are ever carried. `prompt` is the member's own
 * request text; `title`/`summary` are the secret-scrubbed descriptions already
 * shown in the live preview. The service sanitizes + clamps before persisting.
 */

/** Statuses that CREATE a new history item (their own agent_change_id). */
export const AGENT_CHANGE_NEW_STATUSES = [
  "preview_created",
  "restored_checkpoint",
] as const;

/** Statuses that TRANSITION an existing item (the preview's agent_change_id). */
export const AGENT_CHANGE_TRANSITION_STATUSES = [
  "preview_applied",
  "preview_discarded",
  "apply_failed",
  "undone",
  "tested",
  "test_failed",
] as const;

export const AGENT_CHANGE_STATUSES = [
  ...AGENT_CHANGE_NEW_STATUSES,
  ...AGENT_CHANGE_TRANSITION_STATUSES,
] as const;

export const AgentChangeStatusSchema = z.enum(AGENT_CHANGE_STATUSES);
export type AgentChangeStatus = z.infer<typeof AgentChangeStatusSchema>;

export const AGENT_CHANGE_SOURCES = ["react_agent"] as const;
export const AgentChangeSourceSchema = z.enum(AGENT_CHANGE_SOURCES);
export type AgentChangeSource = z.infer<typeof AgentChangeSourceSchema>;

/** Max lengths keep a single row bounded (defense-in-depth at the API boundary). */
export const AGENT_CHANGE_PROMPT_MAX = 2000;
export const AGENT_CHANGE_TITLE_MAX = 200;
export const AGENT_CHANGE_SUMMARY_MAX = 2000;
export const AGENT_CHANGE_REASON_MAX = 2000;
export const AGENT_CHANGE_REF_MAX = 256;

/** Safe DTO returned to the client for the recent-changes list. */
export interface AgentChangeHistoryItem {
  readonly id: string;
  readonly agentChangeId: string;
  readonly workflowId: string;
  readonly source: AgentChangeSource;
  readonly status: AgentChangeStatus;
  readonly prompt: string | null;
  readonly title: string | null;
  readonly summary: string | null;
  readonly changedNodeCount: number;
  readonly addedNodeCount: number;
  readonly removedNodeCount: number;
  readonly changedConfigCount: number;
  readonly setupIssueCount: number;
  readonly previewPatchRef: string | null;
  /** Links to the restore point captured for this change, when still present. */
  readonly checkpointId: string | null;
  readonly runId: string | null;
  /** User-safe humanized failure reason (apply_failed / test_failed). */
  readonly failureReason: string | null;
  /** Provenance — the actor; null when the user was deleted. */
  readonly createdByUserId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A non-negative integer count (coerced + clamped). */
const CountSchema = z.number().int().min(0).max(100_000);

/**
 * POST body to record one agent change. The server sets `account_id` (from the
 * workflow) and `created_by_user_id` (from the authenticated user) — the client
 * never supplies them. `status` decides create-vs-transition (see the status
 * groups above): a transition updates the row that shares `agentChangeId`.
 */
export const RecordAgentChangeRequestSchema = z.object({
  agentChangeId: z.string().uuid(),
  status: AgentChangeStatusSchema,
  prompt: z.string().trim().max(AGENT_CHANGE_PROMPT_MAX).optional(),
  title: z.string().trim().max(AGENT_CHANGE_TITLE_MAX).optional(),
  summary: z.string().trim().max(AGENT_CHANGE_SUMMARY_MAX).optional(),
  changedNodeCount: CountSchema.optional(),
  addedNodeCount: CountSchema.optional(),
  removedNodeCount: CountSchema.optional(),
  changedConfigCount: CountSchema.optional(),
  setupIssueCount: CountSchema.optional(),
  previewPatchRef: z.string().trim().max(AGENT_CHANGE_REF_MAX).optional(),
  checkpointId: z.string().uuid().optional(),
  runId: z.string().uuid().optional(),
  failureReason: z.string().trim().max(AGENT_CHANGE_REASON_MAX).optional(),
});
export type RecordAgentChangeRequest = z.infer<typeof RecordAgentChangeRequestSchema>;

/** GET list response shape. */
export interface ListAgentChangeHistoryResponse {
  readonly items: readonly AgentChangeHistoryItem[];
}
