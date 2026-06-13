import {
  diagnoseWorkflowReadiness,
} from "@/services/diagnostics/workflowReadiness";
import {
  diagnoseWorkflowConnections,
} from "@/services/diagnostics/integrationConnection";
import { diagnoseRunReport } from "@/services/diagnostics/runReport";
import { listByWorkflow } from "@/repositories/workflowRuns";
import { renderWorkflowDiagnosis } from "./renderWorkflowDiagnosis";

/**
 * React-Agent workflow diagnosis (Slice 4.AI-DIAG-1 — first direct consumer of
 * `services/diagnostics/*` from inside the app).
 *
 * This is the in-app composition layer the React Agent (and any internal app
 * caller) uses to answer "Check this workflow" / "Why won't this workflow run?".
 * It is NOT the MCP path: the MCP server stays an EXTERNAL adapter. Internal
 * callers consume the diagnostic services DIRECTLY through this module — it
 * imports NOTHING from `scripts/mcp/*`.
 *
 * Composition (read-only; no patch, no apply, no mutation, no model call):
 *   diagnoseWorkflowReadiness   — graph / required-field verdict + provider inventory
 *   diagnoseWorkflowConnections — per-provider connection readiness (creator-pin
 *                                 provenance; see CAVEAT below)
 *   diagnoseRunReport           — OPTIONAL, best-effort, ONLY after access is OK and
 *                                 a latest terminal run exists
 *   → renderWorkflowDiagnosis (pure, deterministic) → summaryText + nextSteps
 *
 * Authorization: the caller passes ONLY the session-derived `subjectUserId`. Each
 * diagnostic service independently enforces account-membership (`isMemberServiceRole`)
 * and personal-provider provenance (`decideOptionsCredential`). This module forwards
 * that subject and NEVER accepts a client-supplied account / creator / provenance, and
 * NEVER reads an integration or workflow row itself — it only composes the services'
 * already-sanitized DTOs. The latest-run lookup runs ONLY after readiness confirms
 * access (member), via the RLS-scoped `listByWorkflow`, and `diagnoseRunReport`
 * re-checks membership per run — double-gated.
 *
 * No-leak by construction: every field below is lifted from an already-sanitized
 * diagnostic DTO (codes / node ids / provider ids+public names / missing-field NAMES /
 * public required-scope gap names / the stored humanized run classification). Tokens,
 * config values, integration rows, providerAccountId, account metadata, integration
 * display names, connectedByUserId, exact expiry, and raw granted scopes never appear.
 *
 * CAVEAT (OQ-2, accepted for this slice): `diagnoseWorkflowConnections` uses
 * CREATOR-PIN provenance (no CS-5 accepted per-node owners), so a personal provider
 * whose node credential was reassigned to a non-creator is attributed to the creator —
 * safe (never over-exposes; a non-creator still gets NOT_WORKFLOW_OWNER) but coarser
 * than the planner's `getWorkflowIntegrationAvailabilityForAI`. Convergence is a
 * follow-up (OQ-1).
 */

export type AgentDiagnosisAccess = "OK" | "NOT_FOUND" | "NO_ACCESS";

export type AgentFindingSource = "graph" | "field" | "connection" | "run";

export type AgentFindingSeverity = "error" | "warning";

/** Compact, code-driven finding. Carries safe identifiers/labels only — never values. */
export interface AgentFinding {
  readonly source: AgentFindingSource;
  /** Stable code (graph code / readiness code / ConnectionStatus / run marker). */
  readonly code: string;
  readonly severity: AgentFindingSeverity;
  /** Deterministic, safe one-line title mapped from the code (no raw values). */
  readonly title: string;
  /** INTERNAL-only opaque node ids (for future repair/apply mapping). Never rendered, never sent to the model. */
  readonly nodeIds?: readonly string[];
  /**
   * AI-DIAG-FIX-1 — safe human display labels matching `nodeIds` (custom node name
   * → action/trigger meta displayName → friendly type). User-facing render +
   * model context use THESE; raw `nodeIds` never reach user/model text.
   */
  readonly nodeLabels?: readonly string[];
  readonly provider?: string;
  readonly providerName?: string | null;
  /** Missing required-field NAMES (never values). */
  readonly missingFields?: readonly string[];
  /** Public required-scope constant names (the gap only). */
  readonly missingScopes?: readonly string[];
  readonly credentialClass?: "personal" | "account";
}

/** Stored humanized run classification — the safe, display-ready surface. */
export interface AgentRunClassification {
  readonly title: string;
  readonly description: string;
  readonly hint?: string;
  readonly action?: "reconnect" | "open_node" | "upgrade_plan";
  readonly severity: "warning" | "error";
}

export interface AgentLatestRunSummary {
  readonly runId: string;
  readonly status: "succeeded" | "failed" | "running";
  readonly visibility: string;
  readonly classificationAvailable: boolean;
  readonly errorClassification?: AgentRunClassification | null;
  readonly firstFailedNodeId?: string | null;
}

export interface AgentWorkflowDiagnosisDTO {
  readonly workflowId: string;
  readonly access: AgentDiagnosisAccess;
  // ── Present ONLY when access === "OK" (an authorized member). ──
  readonly overallReady?: boolean;
  readonly runnable?: boolean;
  readonly allRequiredConnected?: boolean;
  readonly findings?: readonly AgentFinding[];
  readonly latestRun?: AgentLatestRunSummary;
  readonly summaryText?: string;
  readonly nextSteps?: readonly string[];
}

/** Map the diagnostic services' access enum → the agent's compact 3-state enum. */
function mapAccess(access: "OK" | "NOT_FOUND" | "NO_ACCOUNT_ACCESS"): AgentDiagnosisAccess {
  if (access === "OK") return "OK";
  return access === "NOT_FOUND" ? "NOT_FOUND" : "NO_ACCESS";
}

/** Human-safe titles for the readiness graph + field codes. Unknown → generic, code echoed. */
function graphTitle(code: string): string {
  switch (code) {
    case "no_trigger":
      return "The workflow has no trigger.";
    case "unreachable_node":
      return "A node can't be reached from the trigger.";
    case "empty_workflow":
      return "The workflow is empty.";
    default:
      return `Workflow structure issue (${code}).`;
  }
}

/** Human-safe titles for connection ConnectionStatus codes. */
function connectionTitle(code: string): string {
  switch (code) {
    case "DISCONNECTED":
      return "The provider isn't connected.";
    case "RECONNECT_REQUIRED":
      return "The connection expired and needs reconnecting.";
    case "TOKEN_EXPIRED":
      return "The access token is expired (it may auto-refresh on the next run).";
    case "MISSING_SCOPES":
      return "The connection is missing required permissions.";
    case "PROVIDER_DISABLED":
      return "The provider is currently disabled.";
    case "PROVIDER_UNKNOWN":
      return "This provider isn't recognized.";
    case "NOT_WORKFLOW_OWNER":
      return "This provider's connection belongs to the workflow's creator.";
    default:
      return `Connection issue (${code}).`;
  }
}

/** Resolve the latest terminal run (best-effort) and project it to the safe summary. */
async function resolveLatestRun(
  subjectUserId: string,
  workflowId: string,
): Promise<AgentLatestRunSummary | undefined> {
  let latestRunId: string | null = null;
  try {
    const runs = await listByWorkflow(workflowId, { limit: 1 });
    latestRunId = runs[0]?.id ?? null;
  } catch {
    return undefined; // best-effort: a flaky run read never breaks the diagnosis
  }
  if (!latestRunId) return undefined;

  try {
    const report = await diagnoseRunReport({
      subjectUserId,
      runId: latestRunId,
      mode: "failure",
      includeTestRuns: false,
    });
    // Summary fields are present only for an authorized member in failure mode.
    // The subject is already a confirmed member (access was OK), but guard anyway.
    if (report.status === undefined) return undefined;
    return {
      runId: report.runId,
      status: report.status,
      visibility: report.visibility,
      classificationAvailable: report.classificationAvailable ?? false,
      errorClassification: report.errorClassification ?? null,
      firstFailedNodeId: report.firstFailedNodeId ?? null,
    };
  } catch {
    return undefined;
  }
}

/**
 * Diagnose a workflow for the React Agent. Returns a compact, agent-safe DTO the
 * caller serializes verbatim. Read-only.
 */
export async function diagnoseWorkflowForAgent(input: {
  subjectUserId: string;
  workflowId: string;
  /**
   * AI-DIAG-FIX-1 — the caller's CURRENT builder draft (unsaved edits), validated
   * by the route. Threaded to BOTH sub-diagnostics so "Check workflow" /
   * "Explain" / "Suggest a fix" all evaluate what the user sees on the canvas, not
   * the stale saved `draftDefinition`. Never persisted; authz unchanged.
   */
  draftOverride?: import("@/contracts/workflowDefinition").WorkflowDefinition;
}): Promise<AgentWorkflowDiagnosisDTO> {
  const { subjectUserId, workflowId, draftOverride } = input;
  const overrideArg = draftOverride ? { draftOverride } : {};

  // 1. Readiness FIRST — it owns the access wall. Non-OK short-circuits with NO
  // connection lookup and NO run lookup.
  const readiness = await diagnoseWorkflowReadiness({ subjectUserId, workflowId, ...overrideArg });
  if (readiness.access !== "OK") {
    return { workflowId, access: mapAccess(readiness.access) };
  }

  // 2. Connection readiness (same authz wall; defensive re-check on disagreement).
  const connections = await diagnoseWorkflowConnections({ subjectUserId, workflowId, ...overrideArg });
  if (connections.access !== "OK") {
    return { workflowId, access: mapAccess(connections.access) };
  }

  // AI-DIAG-FIX-1 — nodeId → safe display label map for the diagnosed graph, so
  // every finding carries human `nodeLabels` and NO raw node id reaches user/model
  // text (the render + explain layers use labels; nodeIds stay internal).
  const labelMap = new Map((readiness.nodeLabels ?? []).map((n) => [n.nodeId, n.label]));
  const labelsFor = (ids?: readonly string[]): readonly string[] =>
    (ids ?? [])
      .map((id) => labelMap.get(id))
      .filter((l): l is string => typeof l === "string" && l.length > 0);
  const withLabels = (ids?: readonly string[]): { nodeLabels?: readonly string[] } => {
    const labels = labelsFor(ids);
    return labels.length > 0 ? { nodeLabels: labels } : {};
  };

  // 3. Assemble findings from the already-sanitized DTOs (allow-listed fields only).
  const findings: AgentFinding[] = [];

  for (const g of readiness.graphIssues ?? []) {
    findings.push({
      source: "graph",
      code: g.code,
      severity: "error",
      title: graphTitle(g.code),
      ...(g.nodeId ? { nodeIds: [g.nodeId], ...withLabels([g.nodeId]) } : {}),
    });
  }
  for (const f of readiness.fieldGaps ?? []) {
    findings.push({
      source: "field",
      code: "MISSING_REQUIRED_FIELD",
      severity: "error",
      title: "Required fields are missing.",
      nodeIds: [f.nodeId],
      ...withLabels([f.nodeId]),
      missingFields: f.missingFields,
    });
  }
  for (const p of connections.providers ?? []) {
    if (p.ready) continue;
    findings.push({
      source: "connection",
      code: p.status,
      severity: p.status === "TOKEN_EXPIRED" ? "warning" : "error",
      title: connectionTitle(p.status),
      provider: p.provider,
      providerName: p.name,
      nodeIds: p.nodeIds,
      ...withLabels(p.nodeIds),
      credentialClass: p.credentialClass,
      ...(p.status === "MISSING_SCOPES" && p.missingScopes
        ? { missingScopes: p.missingScopes }
        : {}),
    });
  }

  // 4. Best-effort latest terminal run — ONLY now that access is confirmed OK.
  const latestRun = await resolveLatestRun(subjectUserId, workflowId);
  if (latestRun && latestRun.status === "failed") {
    findings.push({
      source: "run",
      code: "RECENT_RUN_FAILED",
      severity: "warning",
      title: latestRun.errorClassification?.title ?? "The most recent run failed.",
      ...(latestRun.firstFailedNodeId
        ? { nodeIds: [latestRun.firstFailedNodeId], ...withLabels([latestRun.firstFailedNodeId]) }
        : {}),
    });
  }

  const runnable = readiness.runnable ?? false;
  const allRequiredConnected = connections.allRequiredConnected ?? false;
  const overallReady = runnable && allRequiredConnected;

  const { summaryText, nextSteps } = renderWorkflowDiagnosis({
    overallReady,
    runnable,
    allRequiredConnected,
    findings,
    ...(latestRun ? { latestRun } : {}),
  });

  return {
    workflowId,
    access: "OK",
    overallReady,
    runnable,
    allRequiredConnected,
    findings,
    ...(latestRun ? { latestRun } : {}),
    summaryText,
    nextSteps,
  };
}
