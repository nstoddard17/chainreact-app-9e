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
