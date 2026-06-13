import type {
  AgentFinding,
  AgentLatestRunSummary,
} from "./diagnoseWorkflowForAgent";

/**
 * Pure, deterministic renderer for the React-Agent workflow diagnosis
 * (Slice 4.AI-DIAG-1). Maps the already-sanitized structured diagnosis into a
 * safe, user-facing `summaryText` + `nextSteps`.
 *
 * No I/O, no model call, no `Date.now()`. It reads ONLY the safe fields on its
 * input (codes, node ids, public provider names, missing-field NAMES, public
 * required-scope gap names, and the stored humanized run classification). It
 * never interpolates a raw config value or token — none are reachable from its
 * input type, so a leak is impossible by construction.
 */

export interface RenderWorkflowDiagnosisInput {
  readonly overallReady: boolean;
  readonly runnable: boolean;
  readonly allRequiredConnected: boolean;
  readonly findings: readonly AgentFinding[];
  readonly latestRun?: AgentLatestRunSummary;
}

export interface RenderedWorkflowDiagnosis {
  readonly summaryText: string;
  readonly nextSteps: readonly string[];
}

/** Provider label for a connection finding — public name, else the provider id. */
function providerLabel(f: AgentFinding): string {
  return f.providerName ?? f.provider ?? "the provider";
}

/** Deterministic next-step per finding code (deduped, order-preserving). */
function nextStepFor(f: AgentFinding): string | null {
  switch (f.source) {
    case "field":
      return "Fill in the required fields on the flagged nodes.";
    case "graph":
      if (f.code === "no_trigger") return "Add a trigger to start the workflow.";
      return "Fix the workflow structure before running.";
    case "connection":
      switch (f.code) {
        case "DISCONNECTED":
        case "RECONNECT_REQUIRED":
          return `Reconnect ${providerLabel(f)}.`;
        case "TOKEN_EXPIRED":
          return null; // may auto-refresh; no user action required
        case "MISSING_SCOPES":
          return f.missingScopes && f.missingScopes.length > 0
            ? `Reconnect ${providerLabel(f)} to grant: ${f.missingScopes.join(", ")}.`
            : `Reconnect ${providerLabel(f)} to grant the missing permissions.`;
        case "NOT_WORKFLOW_OWNER":
          return `Ask the workflow's creator to connect ${providerLabel(f)}, or duplicate the workflow to use your own connection.`;
        case "PROVIDER_DISABLED":
        case "PROVIDER_UNKNOWN":
          return `Replace the ${providerLabel(f)} node — it isn't available.`;
        default:
          return `Resolve the connection issue with ${providerLabel(f)}.`;
      }
    case "run":
      // Prefer the humanized hint when present; handled in the main renderer.
      return null;
    default:
      return null;
  }
}

export function renderWorkflowDiagnosis(
  input: RenderWorkflowDiagnosisInput,
): RenderedWorkflowDiagnosis {
  const { overallReady, runnable, allRequiredConnected, findings, latestRun } = input;

  // ── summaryText ──
  const lines: string[] = [];
  if (overallReady) {
    lines.push("This workflow looks ready to run.");
  } else {
    const reasons: string[] = [];
    if (!runnable) reasons.push("its configuration is incomplete");
    if (!allRequiredConnected) reasons.push("one or more providers aren't connected");
    lines.push(
      reasons.length > 0
        ? `This workflow can't run yet because ${reasons.join(" and ")}.`
        : "This workflow can't run yet.",
    );
  }

  const errorCount = findings.filter((f) => f.severity === "error").length;
  const warningCount = findings.filter((f) => f.severity === "warning").length;
  if (errorCount > 0 || warningCount > 0) {
    const parts: string[] = [];
    if (errorCount > 0) parts.push(`${errorCount} blocking issue${errorCount === 1 ? "" : "s"}`);
    if (warningCount > 0) parts.push(`${warningCount} warning${warningCount === 1 ? "" : "s"}`);
    lines.push(`Found ${parts.join(" and ")}:`);
  }

  for (const f of findings) {
    const detail: string[] = [];
    if (f.provider) detail.push(providerLabel(f));
    if (f.missingFields && f.missingFields.length > 0) {
      detail.push(`fields: ${f.missingFields.join(", ")}`);
    }
    if (f.missingScopes && f.missingScopes.length > 0) {
      detail.push(`scopes: ${f.missingScopes.join(", ")}`);
    }
    if (f.nodeIds && f.nodeIds.length > 0) {
      detail.push(`node${f.nodeIds.length === 1 ? "" : "s"}: ${f.nodeIds.join(", ")}`);
    }
    const suffix = detail.length > 0 ? ` (${detail.join("; ")})` : "";
    lines.push(`- ${f.title}${suffix}`);
  }

  if (latestRun) {
    if (latestRun.status === "failed") {
      const c = latestRun.errorClassification;
      lines.push(
        c
          ? `The most recent run failed: ${c.title} — ${c.description}${c.hint ? ` ${c.hint}` : ""}`
          : "The most recent run failed.",
      );
    } else if (latestRun.status === "succeeded") {
      lines.push("The most recent run succeeded.");
    }
  }

  // ── nextSteps (deduped, order-preserving) ──
  const steps: string[] = [];
  const seen = new Set<string>();
  for (const f of findings) {
    const step = nextStepFor(f);
    if (step && !seen.has(step)) {
      seen.add(step);
      steps.push(step);
    }
  }
  // A failed latest run with a humanized hint contributes a safe step.
  if (latestRun?.status === "failed" && latestRun.errorClassification?.hint) {
    const step = latestRun.errorClassification.hint;
    if (!seen.has(step)) {
      seen.add(step);
      steps.push(step);
    }
  }

  return { summaryText: lines.join("\n"), nextSteps: steps };
}
