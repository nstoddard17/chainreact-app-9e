import { getByIdServiceRole } from "@/repositories/workflowRunsDiagnostics";
import { isMemberServiceRole } from "@/repositories/accountMemberships";
import {
  classifyRunVisibility,
  summarizeRunFailure,
  type RunErrorClassificationInput,
  type RunStepSummary,
  type RunVisibilityStatus,
} from "@/services/workflows/runDiagnosis";

/**
 * Run-diagnosis capability (Slice 4.MCP-STAGE-2B-3 extraction).
 *
 * The reusable "brain" — the SOURCE OF TRUTH for "diagnose this run for this
 * subject." Consumed today by the gated MCP route
 * (`app/api/internal/diagnostics/run-failure`) and callable in-process by the
 * future React Agent with the same guarantees.
 *
 * Separation of concerns:
 *   - The MACHINE bearer gate (`applyDiagnosticsGate`) stays in the route — it is
 *     the MCP-adapter boundary, not a capability concern.
 *   - This service OWNS the per-account MEMBERSHIP authz (`isMemberServiceRole`),
 *     so every consumer (route or agent) inherits the same wall.
 *
 * No-leak: the raw `DiagnosticsRunRecord` is NEVER spread. It is mapped down to
 * the pure functions' NARROW inputs, which structurally cannot carry
 * `steps[].output`, `steps[].error.message/details`, `fatalError.message`, or
 * `triggerEvent`. The only free text returned is the stored, already-humanized
 * `errorClassification`. Tokens / user ids never reach the DTO.
 *
 * The pure verdict logic stays in `services/workflows/runDiagnosis.ts`; this is
 * the orchestration layer that composes them.
 */

/**
 * `failure` (default; `diagnose_run_failure`) returns the authorized summary.
 * `visibility` (`explain_run_visibility`) returns ONLY `{ runId, visibility }` —
 * the summary is never computed, so the response is strictly narrower.
 */
export type RunReportMode = "failure" | "visibility";

export interface RunReportDTO {
  readonly runId: string;
  readonly visibility: RunVisibilityStatus;
  // ── Present ONLY when the subject is an authorized member, in `failure` mode. ──
  readonly status?: "succeeded" | "failed" | "running" | "queued";
  readonly isTest?: boolean;
  readonly triggeredBy?: string;
  readonly firstFailedNodeId?: string | null;
  readonly failedStepCount?: number;
  readonly classificationAvailable?: boolean;
  readonly errorClassification?: RunErrorClassificationInput | null;
  readonly steps?: readonly RunStepSummary[];
}

/**
 * Diagnose a run for a subject. Owns the raw read, membership authz, the
 * NOT_FOUND / WRONG_ACCOUNT shaping, the visibility-vs-failure mode branch, the
 * pure `classifyRunVisibility` + `summarizeRunFailure` composition, and sanitized
 * DTO assembly. Returns a DTO the caller serializes verbatim.
 */
export async function diagnoseRunReport(input: {
  subjectUserId: string;
  runId: string;
  mode: RunReportMode;
  includeTestRuns: boolean;
}): Promise<RunReportDTO> {
  const { subjectUserId, runId, mode, includeTestRuns } = input;

  // 1. Raw read (service-role; sees `running`). NON-authorizing by itself.
  const run = await getByIdServiceRole(runId);

  // 2. No row → NOT_FOUND, reveal nothing (don't even hit membership).
  if (run === null) {
    return { runId, visibility: classifyRunVisibility(null, { authorizedAccountId: "" }) };
  }

  // 3. Account-membership authz (sessionless, service-role). A non-member passes a
  // sentinel authorized account so `classifyRunVisibility` yields WRONG_ACCOUNT,
  // and the summary is NOT computed.
  const authorized = await isMemberServiceRole(run.accountId, subjectUserId);
  const visibility = classifyRunVisibility(
    { status: run.status, isTest: run.isTest, accountId: run.accountId },
    { authorizedAccountId: authorized ? run.accountId : "", includeTestRuns },
  );

  // 4. Visibility-only mode, OR unauthorized → visibility ONLY. The summary is
  // never computed here, so a non-member (WRONG_ACCOUNT) and any visibility-mode
  // caller both leak nothing beyond the classification.
  if (mode === "visibility" || !authorized) {
    return { runId, visibility };
  }

  // 5. Authorized member → sanitized failure summary from the NARROW inputs.
  const summary = summarizeRunFailure({
    status: run.status,
    isTest: run.isTest,
    triggeredBy: run.triggeredBy,
    steps: run.steps.map((s) => ({
      nodeId: s.nodeId,
      status: s.status,
      // ONLY the error code — message/details are dropped at this boundary.
      ...(s.error?.code !== undefined && { error: { code: s.error.code } }),
    })),
    errorClassification: run.errorClassification,
  });

  return {
    runId,
    visibility,
    status: summary.status,
    isTest: summary.isTest,
    triggeredBy: summary.triggeredBy,
    firstFailedNodeId: summary.firstFailedNodeId,
    failedStepCount: summary.failedStepCount,
    classificationAvailable: summary.classificationAvailable,
    errorClassification: summary.errorClassification,
    steps: summary.steps,
  };
}
