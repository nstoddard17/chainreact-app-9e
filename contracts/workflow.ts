import { z } from "zod";
import { WorkflowDefinitionSchema } from "./workflowDefinition";
import { TriggerEventSchema } from "./triggerEvent";

/**
 * Cross-layer workflow contracts.
 *
 * Per docs/rules/workflow-lifecycle.md (Resolved Decisions):
 *   - Six lifecycle states: draft, active, paused, disabled, eligible_to_resume, deleted.
 *   - Soft-delete is the `deleted` lifecycle state itself, not a separate flag.
 *   - `disabled_reason` is a typed enum + optional context string.
 *
 * The structured node + edge schemas live in `contracts/workflowDefinition.ts`
 * (Slice 1I). This file re-exports the type so existing imports keep working.
 */
export {
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
  WorkflowNodeSchema,
  type WorkflowNode,
  WorkflowEdgeSchema,
  type WorkflowEdge,
  WorkflowNodeKindSchema,
  type WorkflowNodeKind,
  EMPTY_WORKFLOW_DEFINITION,
} from "./workflowDefinition";

export const WorkflowStateSchema = z.enum([
  "draft",
  "active",
  "paused",
  "disabled",
  "eligible_to_resume",
  "deleted",
]);
export type WorkflowState = z.infer<typeof WorkflowStateSchema>;

export const WorkflowDisabledReasonSchema = z.enum([
  "integration_revoked",
  "billing_exhausted",
  "repeated_failure",
  "manual_admin",
]);
export type WorkflowDisabledReason = z.infer<typeof WorkflowDisabledReasonSchema>;


/**
 * Wire shape returned by the workflow API endpoints. Excludes server-only
 * fields like the full draft_definition, user_id, and active_revision_id —
 * the list / lifecycle endpoints don't need them. The edit page (Slice 1H.4+)
 * loads the full record via a dedicated endpoint.
 */
export const WorkflowSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  state: WorkflowStateSchema,
  disabledReason: WorkflowDisabledReasonSchema.nullable(),
  disabledContext: z.string().nullable(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkflowSummary = z.infer<typeof WorkflowSummarySchema>;

// ── API request schemas ─────────────────────────────────────────────────────

export const CreateWorkflowRequestSchema = z.object({
  name: z.string().trim().min(1, "Workflow name is required.").max(120),
});
export type CreateWorkflowRequest = z.infer<typeof CreateWorkflowRequestSchema>;

export const DisableWorkflowRequestSchema = z.object({
  reason: WorkflowDisabledReasonSchema,
  context: z.string().max(500).optional(),
});
export type DisableWorkflowRequest = z.infer<typeof DisableWorkflowRequestSchema>;

/**
 * Detailed wire shape returned by GET / PATCH /api/workflows/[id]. Extends
 * WorkflowSummary with the editable definition + active revision pointer
 * needed by the edit page (Slice 1H.4) and the builder UI (Slice 1I+).
 */
export const WorkflowDetailSchema = WorkflowSummarySchema.extend({
  activeRevisionId: z.string().uuid().nullable(),
  draftDefinition: WorkflowDefinitionSchema,
});
export type WorkflowDetail = z.infer<typeof WorkflowDetailSchema>;

/**
 * Wire shape for the run-history list (Slice 1M.2). Light by design —
 * strips user_id, the full trigger_event payload, the per-step results,
 * and run-fatal details. The list view only needs status + timestamps +
 * humanized error_classification. A future "run detail" endpoint serves
 * the full record when we add per-run drill-down.
 */
export const WorkflowRunStatusSchema = z.enum(["succeeded", "failed"]);
export type WorkflowRunStatus = z.infer<typeof WorkflowRunStatusSchema>;

// ── Workflows list-page enriched item (Slice 4.WORKFLOWS-PAGE-1) ─────────────

/**
 * One connected provider rendered as a chip on a workflows-list row/card.
 * Derived SERVER-SIDE from the workflow's draft definition node `provider`
 * fields only — never from node config or any value. `iconUrl` is the public
 * SVG path (or null for unknown providers); the UI falls back to initials.
 */
export const WorkflowProviderChipSchema = z.object({
  id: z.string(),
  label: z.string(),
  iconUrl: z.string().nullable(),
});
export type WorkflowProviderChip = z.infer<typeof WorkflowProviderChipSchema>;

/**
 * LIFETIME run aggregates for one workflow. Sourced from the
 * `workflow_run_stats` view (real, non-test runs only). `successRate` is
 * `succeeded / total` (0 when `total === 0`). These are lifetime totals — the
 * UI must never present them as "today"/"24h".
 */
export const WorkflowRunStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  lastRunAt: z.string().nullable(),
  lastRunStatus: WorkflowRunStatusSchema.nullable(),
});
export type WorkflowRunStats = z.infer<typeof WorkflowRunStatsSchema>;

/**
 * Enriched wire shape for GET /api/workflows — the workflows list/dashboard
 * page. Extends WorkflowSummary (so it stays backward-compatible for any
 * consumer that only reads summary fields) with server-derived per-row data:
 * provider chips + trigger/action counts (from the draft definition) and
 * lifetime run stats. Carries NO raw config / secrets / draftDefinition.
 */
export const WorkflowListItemSchema = WorkflowSummarySchema.extend({
  providers: z.array(WorkflowProviderChipSchema),
  triggerCount: z.number().int().nonnegative(),
  actionCount: z.number().int().nonnegative(),
  runStats: WorkflowRunStatsSchema,
  // 4.WORKFLOW-FOLDERS-6 / WF-5 — folder membership for the dashboard folder
  // navigation. null = uncategorized. Carried on the list item only (NOT the
  // summary wire shape, which stays folder-agnostic).
  folderId: z.string().uuid().nullable(),
});
export type WorkflowListItem = z.infer<typeof WorkflowListItemSchema>;

export const HumanizedErrorSchema = z.object({
  title: z.string(),
  description: z.string(),
  hint: z.string().optional(),
  action: z.enum(["reconnect", "open_node", "upgrade_plan"]).optional(),
  severity: z.enum(["warning", "error"]),
});
export type HumanizedErrorSummary = z.infer<typeof HumanizedErrorSchema>;

export const WorkflowRunSummarySchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string().uuid(),
  status: WorkflowRunStatusSchema,
  triggerNodeId: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  errorClassification: HumanizedErrorSchema.nullable(),
});
export type WorkflowRunSummary = z.infer<typeof WorkflowRunSummarySchema>;

/**
 * Wire shape for per-step results inside a WorkflowRunDetail. The engine
 * already persists this exact shape into `workflow_runs.steps` (see
 * `repositories/workflowRuns.ts:WorkflowRunStep`). The schema is mirrored
 * here so the typed client can validate the response and so the UI doesn't
 * have to import server-only repository types.
 *
 * Slice 3.8 surfaces per-step output for the latest test-run preview;
 * authors need this to confirm what their downstream variable references
 * will resolve to. The existing run summary endpoint strips `steps[]` and
 * `triggerEvent` on purpose — keeping the list view light — so the detail
 * endpoint exists as a separate, opt-in surface.
 */
export const WorkflowRunStepSchema = z.object({
  nodeId: z.string(),
  status: z.enum(["succeeded", "failed", "skipped"]),
  output: z.record(z.string(), z.unknown()).optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      details: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});
export type WorkflowRunStep = z.infer<typeof WorkflowRunStepSchema>;

export const WorkflowRunFatalErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type WorkflowRunFatalError = z.infer<typeof WorkflowRunFatalErrorSchema>;

/**
 * Detail shape returned by GET /api/workflows/[id]/runs/[runId]. Extends
 * the summary with `steps[]`, `triggerEvent`, and `fatalError`. Used by
 * Slice 3.8's RunResultsPanel to show per-step output for the latest run.
 *
 * Intentionally omits `userId` (RLS-gated; UI never needs it) and the
 * raw `createdAt` (the engine writes `startedAt`/`finishedAt`; `createdAt`
 * is a row-insert timestamp not a workflow-execution timestamp).
 */
export const WorkflowRunDetailSchema = WorkflowRunSummarySchema.extend({
  triggerEvent: TriggerEventSchema,
  steps: z.array(WorkflowRunStepSchema),
  fatalError: WorkflowRunFatalErrorSchema.nullable(),
});
export type WorkflowRunDetail = z.infer<typeof WorkflowRunDetailSchema>;

/**
 * Source labels mirrored from the `workflow_runs.triggered_by` CHECK
 * constraint (Slice 3.SEC-2 migration). The display layer surfaces
 * these as filter facets + per-row badges on the `/runs` page.
 */
export const WorkflowRunTriggeredBySchema = z.enum([
  "manual",
  "test",
  "webhook",
  "scheduled",
  "retry",
  "unknown",
]);
export type WorkflowRunTriggeredBy = z.infer<typeof WorkflowRunTriggeredBySchema>;

/**
 * Wire shape returned by `GET /api/runs` and consumed by the Runs page
 * (Slice 4.RUNS-PAGE-1). Deliberately narrower than
 * `WorkflowRunSummary` / `WorkflowRunDetail`:
 *
 *   - Workflow name is joined in (display-facing pages don't issue
 *     per-row name fetches).
 *   - `userId` / `triggerEvent` / `steps` / `fatalError` are NEVER
 *     present — they contain raw upstream payloads, per-step output
 *     blobs, and engine-internal codes that the run-history surface
 *     does not need. `errorClassification` is the only error surface
 *     exposed; it is the humanized shape already designed for users.
 *   - All billing/task-cost columns are excluded — billing is out of
 *     scope for the read-only run-history surface.
 *   - `durationMs` is computed on the server (finishedAt − startedAt)
 *     to avoid every UI re-computing it. NULL means the run had no
 *     terminal finishedAt (pre-COST-15B rows or sweep-failed rows
 *     where finished_at was never set).
 *
 * The status enum stays terminal-only (succeeded / failed) — matches
 * the existing display contract and the
 * `workflow_runs.status != 'running'` filter the repository applies.
 */
export const RunListItemSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string().uuid(),
  workflowName: z.string(),
  status: WorkflowRunStatusSchema,
  isTest: z.boolean(),
  triggeredBy: WorkflowRunTriggeredBySchema,
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  errorClassification: HumanizedErrorSchema.nullable(),
});
export type RunListItem = z.infer<typeof RunListItemSchema>;

/**
 * PATCH /api/workflows/[id] body. Slice 1I extended this beyond name-only
 * to accept the full `draftDefinition` so the builder can save graph edits.
 * The orchestrator owns lifecycle transitions via the dedicated action
 * endpoints — `state` is intentionally NOT editable here.
 */
export const UpdateWorkflowRequestSchema = z
  .object({
    name: z.string().trim().min(1, "Workflow name is required.").max(120).optional(),
    draftDefinition: WorkflowDefinitionSchema.optional(),
    // 4.WORKFLOW-FOLDERS-3 / WF-2 — move into a folder, or null to uncategorize.
    // `undefined` = leave membership unchanged; explicit `null` = uncategorized.
    folderId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.draftDefinition !== undefined || v.folderId !== undefined,
    { message: "At least one field must be provided." },
  );
export type UpdateWorkflowRequest = z.infer<typeof UpdateWorkflowRequestSchema>;
