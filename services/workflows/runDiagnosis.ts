/**
 * Pure workflow-run diagnostics (Slice 4.MCP-STAGE-2B-3, CS-1).
 *
 * Two pure, framework-free, DB-free, deterministic functions behind the future
 * `diagnose_run_failure` / `explain_run_visibility` diagnostics
 * (roadmap docs/slices/phase-4/mcp-internal-diagnostic-suite-roadmap.md §6.1).
 *
 * Hard constraints (this module is deliberately inert):
 *   - No `next/*`, no Supabase, no repositories, no `process.env`, no `Date.now()`.
 *   - NO-LEAK BY CONSTRUCTION: the input types below expose ONLY the safe fields
 *     the derivation needs. A full `WorkflowRunRecord` can be passed (structural
 *     typing), but these functions can never read `steps[].output`,
 *     `steps[].error.message/details`, `fatalError.message`, or `triggerEvent` —
 *     those fields are not on the input types, so they cannot reach the result.
 *   - The stored `errorClassification` (already humanized for the UI) is the only
 *     free-text passed through; when it is null we report
 *     `classificationAvailable: false` and NEVER fall back to a raw error message.
 */

// ───────────────────────── summarizeRunFailure ─────────────────────────

/** Per-step input — only `nodeId`, `status`, and the error CODE (never message/details). */
export interface RunStepDiagnosisInput {
  readonly nodeId: string;
  readonly status: "succeeded" | "failed" | "skipped";
  /** Only the classification CODE is read — `error.message`/`details` are not on this type. */
  readonly error?: { readonly code?: string };
}

/** The stored, already-humanized classification (safe UI surface; passed through verbatim). */
export interface RunErrorClassificationInput {
  readonly title: string;
  readonly description: string;
  readonly hint?: string;
  readonly action?: "reconnect" | "open_node" | "upgrade_plan";
  readonly severity: "warning" | "error";
}

/** Narrow run projection for failure summary — no output/triggerEvent/fatalError text. */
export interface RunFailureInput {
  readonly status: "succeeded" | "failed" | "running";
  readonly isTest: boolean;
  /** Trigger category enum (manual/test/webhook/scheduled/retry/api_key/unknown) — all safe. */
  readonly triggeredBy: string;
  readonly steps: readonly RunStepDiagnosisInput[];
  readonly errorClassification: RunErrorClassificationInput | null;
}

export interface RunStepSummary {
  readonly nodeId: string;
  readonly status: "succeeded" | "failed" | "skipped";
  /** The step's error classification CODE, or null. Never a message/body. */
  readonly errorCode: string | null;
}

export interface RunFailureSummary {
  readonly status: "succeeded" | "failed" | "running";
  readonly isTest: boolean;
  readonly triggeredBy: string;
  /** First step with `status === "failed"`, else null. */
  readonly firstFailedNodeId: string | null;
  readonly failedStepCount: number;
  /** True iff a stored humanized classification exists. */
  readonly classificationAvailable: boolean;
  /** Passed through verbatim when present; null otherwise (never reconstructed). */
  readonly errorClassification: RunErrorClassificationInput | null;
  readonly steps: readonly RunStepSummary[];
}

/**
 * Project a run into a sanitized failure summary. Pure; reads only the safe
 * fields on the narrow input. `firstFailedNodeId` is the first failed step's
 * node id (no provider detail). Each step contributes `{nodeId, status,
 * errorCode}` only.
 */
export function summarizeRunFailure(run: RunFailureInput): RunFailureSummary {
  const steps: RunStepSummary[] = run.steps.map((s) => ({
    nodeId: s.nodeId,
    status: s.status,
    errorCode: s.error?.code ?? null,
  }));
  const firstFailed = run.steps.find((s) => s.status === "failed");
  const failedStepCount = run.steps.reduce(
    (n, s) => (s.status === "failed" ? n + 1 : n),
    0,
  );
  return {
    status: run.status,
    isTest: run.isTest,
    triggeredBy: run.triggeredBy,
    firstFailedNodeId: firstFailed ? firstFailed.nodeId : null,
    failedStepCount,
    classificationAvailable: run.errorClassification !== null,
    errorClassification: run.errorClassification,
    steps,
  };
}

// ───────────────────────── classifyRunVisibility ─────────────────────────

/**
 * Why a run is/ isn't visible on `/runs`.
 *   - `NOT_FOUND`         — no run row resolved.
 *   - `WRONG_ACCOUNT`     — the run belongs to a different account than the one
 *                           the requester is authorized for (defense-in-depth;
 *                           the route's membership gate normally precedes this).
 *   - `RUNNING`           — non-terminal; the UI readers exclude `running`, so it
 *                           is "missing from /runs" until it finalizes.
 *   - `TEST_RUN`          — terminal test run hidden behind the test-runs toggle.
 *   - `FAILED_VISIBLE`    — terminal failed run that the UI shows.
 *   - `COMPLETED_VISIBLE` — terminal succeeded run that the UI shows.
 */
export type RunVisibilityStatus =
  | "NOT_FOUND"
  | "WRONG_ACCOUNT"
  | "RUNNING"
  | "TEST_RUN"
  | "FAILED_VISIBLE"
  | "COMPLETED_VISIBLE";

/** Narrow run projection for visibility — status/isTest/accountId only. */
export interface RunVisibilityInput {
  readonly status: "succeeded" | "failed" | "running";
  readonly isTest: boolean;
  /** The run's owning account. */
  readonly accountId: string;
}

export interface RunVisibilityContext {
  /** The account the requester is authorized for (route-resolved). */
  readonly authorizedAccountId: string;
  /** Whether the run-history view includes test runs (the opt-in toggle). Default false. */
  readonly includeTestRuns?: boolean;
}

/**
 * Classify run visibility. Pure + deterministic. Precedence (first match wins):
 *   NOT_FOUND → WRONG_ACCOUNT → RUNNING → TEST_RUN → FAILED_VISIBLE → COMPLETED_VISIBLE.
 *
 * `WRONG_ACCOUNT` precedes status checks so a foreign run never reveals its state.
 * `RUNNING` precedes `TEST_RUN` because `running` rows are hidden for everyone,
 * regardless of test-mode.
 */
export function classifyRunVisibility(
  run: RunVisibilityInput | null,
  ctx: RunVisibilityContext,
): RunVisibilityStatus {
  if (run === null) return "NOT_FOUND";
  if (run.accountId !== ctx.authorizedAccountId) return "WRONG_ACCOUNT";
  if (run.status === "running") return "RUNNING";
  if (run.isTest && ctx.includeTestRuns !== true) return "TEST_RUN";
  if (run.status === "failed") return "FAILED_VISIBLE";
  return "COMPLETED_VISIBLE";
}
