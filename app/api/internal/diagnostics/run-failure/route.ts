import { NextResponse } from "next/server";
import { getByIdServiceRole } from "@/repositories/workflowRunsDiagnostics";
import { isMemberServiceRole } from "@/repositories/accountMemberships";
import {
  classifyRunVisibility,
  summarizeRunFailure,
  type RunErrorClassificationInput,
  type RunStepSummary,
  type RunVisibilityStatus,
} from "@/services/workflows/runDiagnosis";
import { applyDiagnosticsGate } from "../_shared";

/**
 * POST /api/internal/diagnostics/run-failure — live, read-only run diagnosis
 * (Slice 4.MCP-STAGE-2B-3, CS-2).
 *
 * THE route is the AUTHORIZATION CHOKEPOINT. The repository readers
 * (`workflowRunsDiagnostics`) are intentionally raw + non-authorizing
 * (service-role, RLS-bypassing). This route is the ONLY caller that decides who
 * may see what:
 *   1. `applyDiagnosticsGate` first (machine bearer; default OFF → 404; prod-lock
 *      → 404; bad bearer → 401, token never echoed). No `requireUser` (no cookie).
 *   2. Read the run via service-role (can SEE `running` rows the UI hides).
 *   3. `run === null` → `NOT_FOUND` only — reveal nothing.
 *   4. `isMemberServiceRole(run.accountId, userId)` — a NON-member gets
 *      `WRONG_ACCOUNT` and NOTHING ELSE (no status, workflowId, steps, provider,
 *      raw errors, triggerEvent, outputs, tokens, or user ids).
 *   5. ONLY after membership passes: compute `classifyRunVisibility` +
 *      `summarizeRunFailure` and return the sanitized summary.
 *
 * The raw `DiagnosticsRunRecord` is NEVER spread into the response — it is mapped
 * down to the pure functions' NARROW inputs, which structurally cannot carry
 * `steps[].output`, `steps[].error.message/details`, `fatalError.message`, or
 * `triggerEvent`. The only free text returned is the stored, already-humanized
 * `errorClassification`.
 */

interface RunFailureDTO {
  readonly runId: string;
  readonly visibility: RunVisibilityStatus;
  // ── Present ONLY when the subject is an authorized member of the run's account. ──
  readonly status?: "succeeded" | "failed" | "running";
  readonly isTest?: boolean;
  readonly triggeredBy?: string;
  readonly firstFailedNodeId?: string | null;
  readonly failedStepCount?: number;
  readonly classificationAvailable?: boolean;
  readonly errorClassification?: RunErrorClassificationInput | null;
  readonly steps?: readonly RunStepSummary[];
}

const badInput = (): NextResponse =>
  NextResponse.json({ error: "invalid_input" }, { status: 400 });

export async function POST(request: Request): Promise<Response> {
  const gate = applyDiagnosticsGate(request);
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badInput();
  }
  if (typeof body !== "object" || body === null) return badInput();
  const b = body as Record<string, unknown>;

  const userId = typeof b.userId === "string" ? b.userId.trim() : "";
  if (!userId) return badInput();
  const runId = typeof b.runId === "string" ? b.runId.trim() : "";
  if (!runId) return badInput();
  const includeTestRuns = b.includeTestRuns === true;
  // `visibility` mode (explain_run_visibility) returns ONLY { runId, visibility } —
  // the failure summary is never computed, so the response is strictly narrower.
  // `failure` mode (default; diagnose_run_failure) returns the authorized summary.
  const mode = b.mode === "visibility" ? "visibility" : "failure";

  // 1. Raw read (service-role; sees `running`). NON-authorizing by itself.
  const run = await getByIdServiceRole(runId);

  // 2. No row → NOT_FOUND, reveal nothing (don't even hit membership).
  if (run === null) {
    const dto: RunFailureDTO = {
      runId,
      visibility: classifyRunVisibility(null, { authorizedAccountId: "" }),
    };
    return NextResponse.json(dto);
  }

  // 3. Account-membership authz (sessionless, service-role). A non-member passes a
  // sentinel authorized account so `classifyRunVisibility` yields WRONG_ACCOUNT,
  // and the summary is NOT computed.
  const authorized = await isMemberServiceRole(run.accountId, userId);
  const visibility = classifyRunVisibility(
    { status: run.status, isTest: run.isTest, accountId: run.accountId },
    { authorizedAccountId: authorized ? run.accountId : "", includeTestRuns },
  );

  // 4. Visibility-only mode, OR unauthorized → visibility ONLY. The summary is
  // never computed here, so a non-member (WRONG_ACCOUNT) and any visibility-mode
  // caller both leak nothing beyond the classification.
  if (mode === "visibility" || !authorized) {
    const dto: RunFailureDTO = { runId, visibility };
    return NextResponse.json(dto);
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

  const dto: RunFailureDTO = {
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
  return NextResponse.json(dto);
}
