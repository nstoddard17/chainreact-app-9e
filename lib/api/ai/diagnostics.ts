/**
 * Builder AI diagnostics client — read-only diagnosis (AI-DIAG-1), optional LLM
 * explanation (AI-DIAG-2a), and optional LLM repair PROPOSAL (AI-REPAIR-1b).
 * Extracted from the monolithic `lib/api/ai.ts` in Slice 4.AI-REPAIR-CLEANUP-1 —
 * refactor only, no behavior change.
 *
 * These are CLIENT-OWNED views of the (already-sanitized) route responses — the
 * client may not import the `@/services/**` DTO types. The diagnosis DTO carries
 * codes / node ids / provider ids+public names / missing-field NAMES / public
 * scope-gap names / the stored humanized run classification / safe deterministic
 * text only. Never tokens, raw config, or integration rows.
 */

import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import { AI_CREDITS_EXHAUSTED_MESSAGE, fetchJson, postStructured } from "./shared";

/**
 * AI-DIAG-FIX-1 — the builder's CURRENT (possibly unsaved) draft, sent with
 * diagnose / explain / repair so the server diagnoses what the user sees on the
 * canvas, not the stale saved `draftDefinition`. The server STRICTLY validates it
 * and uses it for the deterministic diagnosis only — it is never persisted.
 */
export type WorkflowDraftSnapshot = WorkflowDefinition;

/**
 * Slice 4.AI-DIAG-1 — read-only "Check this workflow" / "Why won't this workflow
 * run?" diagnosis for the React Agent.
 *
 * `diagnoseWorkflow(workflowId)` POSTs to `/api/workflows/[id]/ai/diagnose` and
 * returns the agent-safe DTO.
 */

export type AgentDiagnosisAccess = "OK" | "NOT_FOUND" | "NO_ACCESS";

export interface AgentDiagnosisFinding {
  readonly source: "graph" | "field" | "connection" | "run";
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly title: string;
  /** INTERNAL opaque ids — never rendered in user-facing text. Use `nodeLabels`. */
  readonly nodeIds?: readonly string[];
  /** AI-DIAG-FIX-1 — safe human node display labels (never ids). */
  readonly nodeLabels?: readonly string[];
  readonly provider?: string;
  readonly providerName?: string | null;
  readonly missingFields?: readonly string[];
  readonly missingScopes?: readonly string[];
  readonly credentialClass?: "personal" | "account";
}

export interface AgentLatestRunSummary {
  readonly runId: string;
  readonly status: "succeeded" | "failed" | "running";
  readonly visibility: string;
  readonly classificationAvailable: boolean;
  readonly errorClassification?: {
    readonly title: string;
    readonly description: string;
    readonly hint?: string;
    readonly action?: "reconnect" | "open_node" | "upgrade_plan";
    readonly severity: "warning" | "error";
  } | null;
  readonly firstFailedNodeId?: string | null;
}

export interface AgentWorkflowDiagnosis {
  readonly workflowId: string;
  readonly access: AgentDiagnosisAccess;
  // Present only when access === "OK".
  readonly overallReady?: boolean;
  readonly runnable?: boolean;
  readonly allRequiredConnected?: boolean;
  readonly findings?: readonly AgentDiagnosisFinding[];
  readonly latestRun?: AgentLatestRunSummary;
  readonly summaryText?: string;
  readonly nextSteps?: readonly string[];
}

export async function diagnoseWorkflow(
  workflowId: string,
  draftDefinition?: WorkflowDraftSnapshot,
): Promise<AgentWorkflowDiagnosis> {
  return fetchJson<AgentWorkflowDiagnosis>(
    `/api/workflows/${encodeURIComponent(workflowId)}/ai/diagnose`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draftDefinition ? { draftDefinition } : {}),
    },
  );
}

/**
 * Slice 4.AI-DIAG-2a — optional LLM explanation of the (already-computed) safe
 * diagnosis. The server re-derives the diagnosis and sends only an allow-listed
 * projection to the model. Handled failures (402/403/503) return as a structured
 * `ok:false` result; transport failures (401/404/500) throw `AiApiError`. No raw
 * model output / config / secrets are ever returned.
 */
export interface AiDiagnosisExplanationSuccess {
  readonly ok: true;
  readonly explanation: string;
  readonly priorities?: readonly string[];
  readonly missingInfo?: readonly string[];
}
export interface AiDiagnosisExplanationFailure {
  readonly ok: false;
  /** AI_CREDITS_EXHAUSTED | ACCOUNT_PENDING_DELETION | AI_GATE_ERROR | MODEL_FAILED | PARSE_FAILED */
  readonly code: string;
  readonly message: string;
}
export type AiDiagnosisExplanation = AiDiagnosisExplanationSuccess | AiDiagnosisExplanationFailure;

export async function explainDiagnosis(
  workflowId: string,
  draftDefinition?: WorkflowDraftSnapshot,
): Promise<AiDiagnosisExplanation> {
  return postStructured<AiDiagnosisExplanation>(
    `/api/workflows/${encodeURIComponent(workflowId)}/ai/diagnose/explain`,
    draftDefinition ? { draftDefinition } : {},
  );
}

/**
 * Slice 4.AI-REPAIR-1b — optional LLM REPAIR PROPOSAL for the (already-computed)
 * safe diagnosis (POST /api/workflows/[id]/ai/repair/plan). Proposal-ONLY: the
 * server re-derives the diagnosis, sends only an allow-listed projection to the
 * model, and returns plain-language recommendations — it NEVER changes, saves, or
 * runs the workflow, and returns NO patch. Handled failures (402/403/503) return
 * as a structured `ok:false` with a SAFE, code-keyed message; transport failures
 * (401/404/500) throw `AiApiError`.
 */
export type RepairRiskLevel = "low" | "medium" | "high";

export interface RepairProposal {
  readonly summary: string;
  readonly recommendedActions: readonly string[];
  /** Safe human labels only — never node ids / config values. */
  readonly affectedNodes: readonly string[];
  readonly missingInfo: readonly string[];
  /** Advisory — never authoritative; the UI labels it as the AI's estimate. */
  readonly riskLevel: RepairRiskLevel;
  readonly canAutoPatchLater: boolean;
  readonly requiresUserAction: boolean;
  /** Immutable "nothing was changed" line, set by the server. */
  readonly notAppliedNotice: string;
}

export interface RepairPlanSuccess {
  readonly ok: true;
  readonly proposal: RepairProposal;
}
export interface RepairPlanFailure {
  readonly ok: false;
  /** AI_CREDITS_EXHAUSTED | ACCOUNT_PENDING_DELETION | AI_GATE_ERROR | MODEL_FAILED | PARSE_FAILED */
  readonly code: string;
  readonly message: string;
}
export type RepairPlanResult = RepairPlanSuccess | RepairPlanFailure;

/** Safe, code-keyed user-facing copy for a handled repair-plan failure (never raw server/model text). */
function safeRepairFailureMessage(code: string): string {
  switch (code) {
    case "AI_CREDITS_EXHAUSTED":
      return AI_CREDITS_EXHAUSTED_MESSAGE;
    case "ACCOUNT_PENDING_DELETION":
      return "This account is pending deletion.";
    default:
      // MODEL_FAILED | AI_GATE_ERROR | PARSE_FAILED | anything else → one safe line.
      return "Couldn't suggest a fix right now. Please try again.";
  }
}

export async function planWorkflowRepair(
  workflowId: string,
  draftDefinition?: WorkflowDraftSnapshot,
): Promise<RepairPlanResult> {
  const result = await postStructured<RepairPlanResult>(
    `/api/workflows/${encodeURIComponent(workflowId)}/ai/repair/plan`,
    draftDefinition ? { draftDefinition } : {},
  );
  if (result.ok) return result;
  // Normalize handled-failure copy to a safe, code-keyed constant — no raw server text reaches the UI.
  return { ok: false, code: result.code, message: safeRepairFailureMessage(result.code) };
}

/**
 * Slice 4.AI-REPAIR-2b — optional LLM VALIDATED-PATCH PREVIEW for the
 * (already-computed) safe diagnosis (POST /api/workflows/[id]/ai/repair/preview).
 * Preview-ONLY: the model proposes a WorkflowPatch, the server validates it
 * through the existing deterministic preview engine, and returns a no-leak,
 * label-based "what would change" view with the AUTHORITATIVE (recomputed) risk —
 * it NEVER changes, saves, or runs the workflow, and returns NO apply control.
 * Handled failures (402/403/503/500) return as a structured `ok:false` with a
 * SAFE, code-keyed message; transport failures (401/404/400) throw `AiApiError`.
 *
 * These are CLIENT-OWNED views of the (already-sanitized) route response — the
 * client may not import the `@/services/**` preview types. Change descriptions are
 * pre-rendered with node display LABELS; raw node ids appear only in the opaque
 * `affectedNodeIds` and are NOT rendered as user-facing copy.
 */
export type RepairPreviewRiskLevel = "low" | "medium" | "high";

/** One value-free, label-based description of a single proposed patch operation. */
export interface RepairPreviewChange {
  readonly op: string;
  /** Human-readable; uses node labels, never config VALUES or raw ids. */
  readonly description: string;
  readonly nodeId?: string;
  readonly edgeId?: string;
  /** Non-secret field KEY names touched (config edits). */
  readonly fields?: readonly string[];
}

export interface RepairPreviewIssue {
  readonly code: string;
  readonly message: string;
  readonly nodeId?: string;
  readonly edgeId?: string;
  readonly path?: string;
}

export interface RepairPreviewRiskReason {
  readonly code: string;
  readonly message: string;
  readonly nodeId?: string;
}

/** The subset of the AI-5 `PatchPreviewResult` the Builder renders. Extra fields ignored. */
export interface RepairPreview {
  /** True iff the patch validated and could be applied later (a LATER slice). */
  readonly ok: boolean;
  readonly patchSummary: string;
  readonly changes: readonly RepairPreviewChange[];
  /** Opaque ids — NOT rendered as user-facing copy; the label-bearing `changes` are. */
  readonly affectedNodeIds: readonly string[];
  readonly affectedEdgeIds: readonly string[];
  /** Deterministic, recomputed by the validator — the AUTHORITATIVE risk (not the model's). */
  readonly riskLevel: RepairPreviewRiskLevel | string;
  readonly requiresConfirmation: boolean;
  readonly riskReasons: readonly RepairPreviewRiskReason[];
  readonly validation: {
    readonly ok: boolean;
    readonly errors: readonly RepairPreviewIssue[];
    readonly warnings: readonly RepairPreviewIssue[];
  };
  readonly taskCostEstimate?: { readonly estimatedTasksPerRun: number };
  readonly userFacingSummaryText: string;
  readonly candidateSummary?: string;
  /** Metadata only — does NOT enable any apply control in this slice. */
  readonly canApplyLater: boolean;
  /** Set when `ok` is false — the first blocking error message (humanized). */
  readonly blockedReason?: string;
}

export interface RepairPreviewSuccess {
  readonly ok: true;
  readonly preview: RepairPreview;
  /** Server-set immutable "nothing was changed/saved/run" line. */
  readonly notAppliedNotice: string;
}
export interface RepairPreviewFailure {
  readonly ok: false;
  /** AI_CREDITS_EXHAUSTED | ACCOUNT_PENDING_DELETION | AI_GATE_ERROR | MODEL_FAILED | PARSE_FAILED | GRAPH_UNAVAILABLE */
  readonly code: string;
  readonly message: string;
}
export type RepairPreviewResult = RepairPreviewSuccess | RepairPreviewFailure;

/** Optional, NON-AUTHORITATIVE steering context (the user's prior repair proposal). */
export interface RepairPreviewProposalContext {
  readonly summary?: string;
  readonly recommendedActions?: readonly string[];
}

/**
 * Safe, code-keyed, UI-owned copy for a handled repair-PREVIEW failure (never raw
 * server/model text). AI-REPAIR-2D adds the two HANDLED, non-503 states:
 *   - `NOTHING_TO_PREVIEW` — the current draft no longer has the issue the (stale)
 *     proposal was based on; ask the user to re-run Check.
 *   - `NO_SAFE_PATCH` — the model declined to auto-patch (e.g. a user-input-required
 *     field or a reconnect); ask the user to re-check or fix manually.
 */
function safeRepairPreviewMessage(code: string): string {
  switch (code) {
    case "AI_CREDITS_EXHAUSTED":
      return AI_CREDITS_EXHAUSTED_MESSAGE;
    case "ACCOUNT_PENDING_DELETION":
      return "This account is pending deletion.";
    case "NOTHING_TO_PREVIEW":
      return "This issue may already be fixed. Run Check workflow again for an up-to-date result.";
    case "NO_SAFE_PATCH":
      return "The AI couldn't build a safe automatic fix — the remaining issue may need information only you can provide. Run Check workflow again, or fix it manually.";
    default:
      // MODEL_FAILED | PARSE_FAILED | GRAPH_UNAVAILABLE | anything else → one safe line.
      return "Couldn't build a repair preview right now. Please try again.";
  }
}

export async function previewWorkflowRepair(
  workflowId: string,
  draftDefinition?: WorkflowDraftSnapshot,
  proposalContext?: RepairPreviewProposalContext,
): Promise<RepairPreviewResult> {
  const requestBody: Record<string, unknown> = {};
  if (draftDefinition) requestBody.draftDefinition = draftDefinition;
  if (proposalContext) requestBody.proposalContext = proposalContext;
  const result = await postStructured<RepairPreviewResult>(
    `/api/workflows/${encodeURIComponent(workflowId)}/ai/repair/preview`,
    requestBody,
  );
  if (result.ok) return result;
  // Normalize handled-failure copy to a safe, code-keyed constant — no raw server text reaches the UI.
  return { ok: false, code: result.code, message: safeRepairPreviewMessage(result.code) };
}
