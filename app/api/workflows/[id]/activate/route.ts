import { NextResponse } from "next/server";
import { z } from "zod";
import * as workflowsRepo from "@/repositories/workflows";
import { notifyHighRiskActivation } from "@/services/notifications/notifyHighRiskWorkflowEvent";
import { createLifecycleOrchestrator } from "@/services/workflows/orchestratorFactory";
import {
  findConfirmationRequiredActions,
  isValidConfirmationText,
  type RiskConfirmationResult,
} from "@/services/workflows/riskConfirmation";
import {
  assertWorkflowRunEditAllowed,
  requireUser,
  requireWorkflowAccountMember,
  runLifecycle,
  toWorkflowSummary,
} from "../../_shared";
import { checkWritePathReadiness } from "@/services/workflows/executionReadiness";

/**
 * POST /api/workflows/[id]/activate
 *
 * Slice 3.SEC-4B — destructive-action confirmation gate.
 * Before delegating to the lifecycle orchestrator, the route enumerates
 * action nodes whose meta declares `isDestructive: true` or
 * `requiresConfirmation: true`. If any are present, the caller MUST
 * include `confirmationText: "CONFIRM"` in the request body; otherwise
 * the route returns 409 with a structured `CONFIRMATION_REQUIRED`
 * response. The response carries only route-safe fields (nodeId,
 * provider, type, displayName, riskDescription) — never config,
 * resolved values, IDs, or any data derived from the workflow run.
 *
 * Body shape (all fields optional):
 *   - `confirmationText: string` — must equal `"CONFIRM"` when any
 *     action in the workflow requires confirmation. Ignored when
 *     no action requires it (low-risk workflows activate with an
 *     empty body, preserving the pre-SEC-4B contract).
 *
 * Empty / missing body is treated as `{}` — equivalent to no
 * `confirmationText` supplied. Bodies > 16 KiB are 413.
 */

const BODY_BYTES_CAP = 16 * 1024;

const ActivateBodySchema = z
  .object({
    confirmationText: z.string().optional(),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  // Parse body before loading the workflow. Empty body is a valid
  // request shape (pre-SEC-4B activations sent none).
  const contentLengthHeader = request.headers.get("content-length");
  if (
    contentLengthHeader !== null &&
    Number(contentLengthHeader) > BODY_BYTES_CAP
  ) {
    return NextResponse.json(
      { error: "Payload too large." },
      { status: 413 },
    );
  }

  let rawBody: unknown;
  try {
    const text = await request.text();
    rawBody = text.length === 0 ? {} : JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = ActivateBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid request body.",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const { confirmationText } = parsed.data;

  // Load the workflow's draft definition once so the confirmation
  // enumerator can inspect the action nodes. Ownership / not-found
  // / RLS are enforced inside `getById` (SSR-cookie client). When
  // the row is missing, defer the 404/403/etc. decision to the
  // orchestrator — its LifecycleError mapping is the single source.
  // (Pre-existing behavior: the orchestrator also calls getById; the
  // extra route-level read is cheap and avoids duplicating
  // LifecycleError translation.)
  const workflow = await workflowsRepo.getById(id);
  // 4.TEAM-WORKFLOWS-1 (TW-1): explicit account-membership authorization before
  // any confirmation probing or orchestration. A non-member collapses to the
  // standard 404 (no existence leak). When the row is missing/deleted we defer
  // to the orchestrator's LifecycleError mapping (unchanged behavior).
  if (workflow && workflow.state !== "deleted") {
    const authorized = await requireWorkflowAccountMember(auth.userId, workflow.accountId);
    if (!authorized.ok) return authorized.response;
    // WF-RUNPERM — activating arms the workflow to fire under the creator's
    // identity. Only the creator may activate a private-credential workflow.
    const runEditDenied = await assertWorkflowRunEditAllowed(workflow, auth.userId);
    if (runEditDenied) return runEditDenied;
  }
  let risk: RiskConfirmationResult | null = null;
  if (workflow && workflow.state !== "deleted") {
    risk = findConfirmationRequiredActions(workflow.draftDefinition.nodes);
    if (risk.requiresConfirmation && !isValidConfirmationText(confirmationText)) {
      return NextResponse.json(
        {
          error: "CONFIRMATION_REQUIRED",
          requiresConfirmation: true,
          confirmationText: risk.confirmationText,
          actions: risk.actions,
        },
        { status: 409 },
      );
    }
  }

  // B — write-path execution-readiness gate (AI-READINESS-CONVERGENCE CS-2). Block
  // activation of a structurally-invalid / unconfigured workflow (incl. self-loops
  // from CS-1) AND a draft whose config references a deleted/missing step
  // (INVALID_VARIABLE_REFERENCE) — both of which Check already flags. After the
  // destructive gate so CONFIRMATION_REQUIRED still takes precedence. Validates the
  // DRAFT about to go live; does NOT touch the engine/run-now hot path or any existing
  // active revision. Missing/deleted rows defer to the orchestrator's LifecycleError
  // mapping below (unchanged).
  if (workflow && workflow.state !== "deleted") {
    const readinessError = checkWritePathReadiness(workflow.draftDefinition);
    if (readinessError) {
      return NextResponse.json(readinessError, { status: 422 });
    }
  }

  const orch = createLifecycleOrchestrator();
  return runLifecycle(
    () => orch.activate(id),
    async (record) => {
      // Slice 3.POSTSEC-8 — emit a high-risk audit event when the
      // workflow contains destructive / requires-confirmation actions
      // AND the orchestrator returned success. Best-effort — the
      // helper swallows write errors so an audit failure never flips
      // a successful activation response to a 5xx. Only fires when
      // `risk.requiresConfirmation` was true on entry (low-risk
      // activations don't pollute the audit surface).
      if (workflow && risk && risk.requiresConfirmation) {
        await notifyHighRiskActivation({
          workflowId: workflow.id,
          workflowName: workflow.name,
          actorUserId: auth.userId,
          confirmationRequiredActions: risk.actions,
        });
      }
      return NextResponse.json(toWorkflowSummary(record));
    },
  );
}
