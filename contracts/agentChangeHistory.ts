import { z } from "zod";
import { AgentApplyModeSchema, type AgentApplyMode } from "./agentApplyModes";

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
  // REACT-AGENT-APPLY-MODES-1 — the user explicitly chose to keep the preview
  // (no apply). Transitions the existing preview row; carries applyMode preview_only.
  "kept_as_preview",
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
  /**
   * The REDACTED value-level config diff for this change (the same secret-scrubbed
   * `ConfigDiff` shape the live "Review changes" rail renders), or null when none
   * was captured / it exceeded the size cap. Consumers cast to `ConfigDiff`.
   * Drives the per-item "View diff" action. NEVER carries secret values.
   */
  readonly diff: Record<string, unknown> | null;
  /** Link to the ai_cost_events row for this change, where one exists (server apply / repair path). */
  readonly aiCostEventId: string | null;
  /**
   * REACT-AGENT-APPLY-MODES-1 — which apply mode the user chose for this change
   * (preview_only / apply_to_draft / apply_and_test), or null when not yet decided
   * (e.g. a row still at preview_created). Stored in the row's metadata; surfaced
   * here so the audit knows the choice independent of any rail/history UI.
   */
  readonly applyMode: AgentApplyMode | null;
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
  /**
   * The redacted `ConfigDiff` for "View diff". Validated only as a JSON object here;
   * the service defensively re-scrubs secret field values and enforces a size cap
   * before persisting (so a malformed/oversized client payload can never leak or bloat).
   */
  diff: z.record(z.string(), z.unknown()).optional(),
  aiCostEventId: z.string().uuid().optional(),
  /**
   * REACT-AGENT-APPLY-MODES-1 — the apply mode the user chose. Persisted into the
   * row metadata by the service so the audit timeline records the decision. Safe
   * (a fixed enum, never free text / a value).
   */
  applyMode: AgentApplyModeSchema.optional(),
});
export type RecordAgentChangeRequest = z.infer<typeof RecordAgentChangeRequestSchema>;

/** GET list response shape. */
export interface ListAgentChangeHistoryResponse {
  readonly items: readonly AgentChangeHistoryItem[];
}
