/**
 * Internal MCP server — composite "doctor" tools (Phase C-2 / Stage 2C).
 *
 *   doctor_workflow            → one consolidated answer for "why is this workflow
 *                                not ready / broken / failing?" — composes
 *                                readiness + graph + connections (+ optional run).
 *   doctor_provider            → "what remains for provider X to be ready?" —
 *                                composes the static provider tools (+ optional
 *                                live connection).
 *   doctor_account_integration → account-level integration health (provider-scoped
 *                                first; account-wide enumeration deferred).
 *
 * COMPOSE, NEVER DUPLICATE. Live sections reuse the SAME gated transport
 * (`postDiagnostic` → `/api/internal/diagnostics/*`, `applyDiagnosticsGate` +
 * egress redaction) that the individual live tools use; static sections reuse the
 * SAME local `providerStatics` brain the provider tools use. No new route, no new
 * diagnostic brain, no DB/service-role access in `scripts/mcp`.
 *
 * IMPORT FENCE — LOCAL MCP modules + `node` globals only. Every value placed in a
 * doctor's output comes from an already-sanitized DTO (the route sanitizes) or
 * static manifest/structural data — never a token, raw config value, provider
 * body, or raw error.
 */
import { postDiagnostic } from "./diagnoseTransport";
import { doctorAccountIntegration, doctorProvider } from "./doctorsProviders";
import {
  ACCESS_WALL,
  aggregateOverall,
  CONNECTED,
  type ConnectionsDTO,
  dedup,
  describeGraphFinding,
  type DoctorOutcome,
  type DoctorStatus,
  type GraphDTO,
  graphNextSteps,
  type ReadinessDTO,
  renderDoctor,
  type RunFailureDTO,
  type Section,
} from "../lib/doctorShared";
import type { ToolDefinition } from "../registry";

const READINESS_PATH = "/api/internal/diagnostics/workflow-readiness";
const GRAPH_PATH = "/api/internal/diagnostics/workflow-graph";
const CONNECTIONS_PATH = "/api/internal/diagnostics/workflow-connections";
const RUN_FAILURE_PATH = "/api/internal/diagnostics/run-failure";

// ─────────────────────────────── doctor_workflow ───────────────────────────────

/**
 * Compute the composite workflow doctor answer (no rendering). Shared by the
 * `doctor_workflow` tool and the Phase 2D `generate_diagnostic_report` tool so the
 * report COMPOSES the same diagnosis rather than re-deriving it.
 */
export async function computeDoctorWorkflow(args: Record<string, unknown>): Promise<DoctorOutcome> {
  const workflowId = typeof args.workflowId === "string" ? args.workflowId.trim() : "";
  const userId = typeof args.userId === "string" ? args.userId.trim() : "";
  if (!workflowId) return { ok: false, message: "Error: 'workflowId' is required." };
  if (!userId)
    return {
      ok: false,
      message: "Error: 'userId' is required — the subject to diagnose under (member of the workflow's account).",
    };
  const runId = typeof args.runId === "string" ? args.runId.trim() : "";
  const includeRunVisibility = args.includeRunVisibility === true;

  const sections: Section[] = [];
  const unavailable: Array<{ section: string; reason: string }> = [];
  const sourceTools: string[] = [];
  const nextSteps: string[] = [];

  // 1. Readiness — also the access-wall probe. If it walls, every other live
  //    section would wall the same way, so short-circuit with the wall.
  sourceTools.push("diagnose_workflow_readiness");
  const readiness = await postDiagnostic<ReadinessDTO>(READINESS_PATH, { workflowId, userId });
  if (!readiness.ok) {
    // Gate off / unreachable → the whole live API is unavailable.
    return {
      ok: true,
      title: "doctor_workflow",
      result: {
        overall: "unknown",
        sections: [],
        nextSteps: [],
        sourceTools,
        unavailable: [{ section: "readiness/graph/connections", reason: readiness.message }],
      },
    };
  }
  if (readiness.dto.access !== "OK") {
    const wall = ACCESS_WALL[readiness.dto.access] ?? { status: "unknown" as DoctorStatus, reason: readiness.dto.access };
    return {
      ok: true,
      title: "doctor_workflow",
      result: {
        overall: wall.status,
        sections: [{ name: "access", status: wall.status === "blocked" ? "blocked" : "unavailable", summary: `${readiness.dto.access} — ${wall.reason}` }],
        nextSteps: [],
        sourceTools,
        unavailable: [],
      },
    };
  }
  {
    const runnable = readiness.dto.runnable === true;
    sections.push({
      name: "readiness",
      status: runnable ? "ok" : "blocked",
      summary: runnable ? "runnable" : `not runnable (${readiness.dto.readinessError ?? "see graph"})`,
    });
  }

  // 2. Graph structure.
  sourceTools.push("diagnose_workflow_graph");
  const graph = await postDiagnostic<GraphDTO>(GRAPH_PATH, { workflowId, userId });
  if (!graph.ok) {
    unavailable.push({ section: "graph", reason: graph.message });
  } else {
    const findings = graph.dto.findings ?? [];
    const errors = findings.filter((f) => f.severity === "error");
    const warnings = findings.filter((f) => f.severity === "warning");
    sections.push({
      name: "graph",
      status: errors.length ? "blocked" : warnings.length ? "warning" : "ok",
      summary: findings.length
        ? `${errors.length} error, ${warnings.length} warning across ${graph.dto.nodeCount ?? "?"} node(s)`
        : `structurally valid (${graph.dto.nodeCount ?? "?"} node(s))`,
      findings: findings.slice(0, 12).map(describeGraphFinding),
    });
    for (const step of graphNextSteps(findings)) nextSteps.push(step);
  }

  // 3. Provider connections used by the graph.
  sourceTools.push("diagnose_workflow_connections");
  const conns = await postDiagnostic<ConnectionsDTO>(CONNECTIONS_PATH, { workflowId, userId });
  if (!conns.ok) {
    unavailable.push({ section: "connections", reason: conns.message });
  } else if (conns.dto.access !== "OK") {
    unavailable.push({ section: "connections", reason: conns.dto.access });
  } else {
    const providers = conns.dto.providers ?? [];
    const broken = providers.filter((p) => p.status !== CONNECTED || !p.ready);
    sections.push({
      name: "connections",
      status: broken.length ? "blocked" : "ok",
      summary: providers.length
        ? `${providers.length - broken.length}/${providers.length} provider connection(s) ready`
        : "no provider connections required",
      findings: broken.map((p) => `${p.provider} [${p.credentialClass}]: ${p.status} (used by ${p.nodeCount} node(s))`),
    });
    for (const p of broken) nextSteps.push(`Connect/reconnect ${p.provider} for this account (${p.status}).`);
  }

  // 4. Optional run failure.
  if (runId) {
    sourceTools.push("diagnose_run_failure");
    const run = await postDiagnostic<RunFailureDTO>(RUN_FAILURE_PATH, { runId, userId });
    if (!run.ok) {
      unavailable.push({ section: "run", reason: run.message });
    } else {
      const d = run.dto;
      const hasSummary = d.status !== undefined;
      const failed = d.status === "failed" || d.failedStepCount ? true : false;
      sections.push({
        name: "run",
        status: !hasSummary ? "unavailable" : failed ? "warning" : "ok",
        summary: hasSummary
          ? `${d.visibility} — status ${d.status}${d.classificationAvailable && d.errorClassification ? `: ${d.errorClassification.title}` : ""}`
          : d.visibility,
        findings:
          hasSummary && d.firstFailedNodeId ? [`first failed node: ${d.firstFailedNodeId} (${d.failedStepCount ?? 0} failed step(s))`] : undefined,
      });
      if (d.classificationAvailable && d.errorClassification?.action) {
        nextSteps.push(d.errorClassification.action);
      } else if (d.firstFailedNodeId) {
        nextSteps.push(`Review the failed step ${d.firstFailedNodeId} in the run.`);
      }
    }
  } else {
    unavailable.push({ section: "run", reason: "no runId provided" });
  }

  // 5. Optional explicit visibility (only when requested + runId).
  if (includeRunVisibility && runId) {
    sourceTools.push("explain_run_visibility");
    const vis = await postDiagnostic<{ runId: string; visibility: string }>(RUN_FAILURE_PATH, { runId, userId, mode: "visibility" });
    if (!vis.ok) unavailable.push({ section: "visibility", reason: vis.message });
    else sections.push({ name: "visibility", status: "ok", summary: vis.dto.visibility });
  } else if (includeRunVisibility) {
    unavailable.push({ section: "visibility", reason: "includeRunVisibility requested but no runId provided" });
  }

  const overall = aggregateOverall(sections.map((s) => s.status));
  return {
    ok: true,
    title: "doctor_workflow",
    result: {
      overall,
      sections,
      nextSteps: dedup(nextSteps).slice(0, 10),
      sourceTools,
      unavailable,
    },
  };
}

/** `doctor_workflow` tool handler — renders the computed outcome to text. */
async function doctorWorkflow(args: Record<string, unknown>): Promise<string> {
  const outcome = await computeDoctorWorkflow(args);
  if (!outcome.ok) return outcome.message;
  return renderDoctor(outcome.title, outcome.result);
}

export const doctorTools: ToolDefinition[] = [
  {
    name: "doctor_workflow",
    description:
      "Composite doctor: one consolidated, SAFE answer for 'why is this workflow not ready / broken / failing?' Composes diagnose_workflow_readiness + diagnose_workflow_graph + diagnose_workflow_connections (and, when a runId is given, diagnose_run_failure / explain_run_visibility) into an overall status (healthy/warning/blocked/unknown), per-section summaries, merged nextSteps, the source tool names used, and any unavailable sections + reasons. Returns enums/counts/ids/field-names + the stored humanized classification only — never config values, tokens, provider bodies, or raw errors. Live sections require the diagnostics API enabled (dev-only).",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: { type: "string", description: "The workflow id to diagnose." },
        userId: { type: "string", description: "Subject (must be a member of the workflow's account)." },
        accountId: { type: "string", description: "Optional account id (the routes resolve the account from the workflow)." },
        runId: { type: "string", description: "Optional run id — adds the run-failure section." },
        includeRunVisibility: { type: "boolean", description: "When true (with a runId), adds the explicit visibility section." },
      },
      required: ["workflowId", "userId"],
      additionalProperties: false,
    },
    handler: doctorWorkflow,
  },
  {
    name: "doctor_provider",
    description:
      "Composite doctor: 'what remains for provider X to be ready?' Composes the static provider tools (capability matrix, action/trigger + option-source counts, metadata-consistency, option-source coverage, connection requirements) and, when accountId + userId are provided, the live diagnose_integration_connection. Returns an overall status, per-section summaries, merged nextSteps, source tool names, and unavailable sections. Static sections never touch the DB; the live section reuses the gated route. Names/counts/enums only — never tokens or raw values.",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", description: "Provider id, e.g. 'slack'." },
        accountId: { type: "string", description: "Optional — with userId, adds the live connection section." },
        userId: { type: "string", description: "Optional — with accountId, adds the live connection section." },
      },
      required: ["provider"],
      additionalProperties: false,
    },
    handler: doctorProvider,
  },
  {
    name: "doctor_account_integration",
    description:
      "Composite doctor: account-level integration health. Provider-scoped first — with a 'provider' it composes diagnose_integration_connection for that provider under the account and returns status + counts + nextSteps. WITHOUT a provider, account-wide enumeration is DEFERRED (it would require a new gated route; no new service-role DB access is added to the MCP boundary). Never exposes credential identity, tokens, raw scopes, or private account data — status/enums/counts only.",
    inputSchema: {
      type: "object",
      properties: {
        accountId: { type: "string", description: "The account id to check." },
        userId: { type: "string", description: "Subject (must be a member of the account)." },
        provider: { type: "string", description: "Optional provider id for a scoped check (account-wide enumeration is deferred)." },
      },
      required: ["accountId", "userId"],
      additionalProperties: false,
    },
    handler: doctorAccountIntegration,
  },
];

// Re-export the aggregation helper for tests / callers.
export { aggregateOverall };
