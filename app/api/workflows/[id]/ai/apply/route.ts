import { NextResponse } from "next/server";
import { z } from "zod";
import {
  applyWorkflowPatchForAI,
  type ApplyErrorCode,
} from "@/services/ai/apply";
import type { WorkflowPatch } from "@/services/workflows/patch/types";
import { recordAiApplyOutcome } from "@/services/ai/events";
import { parseJsonBody, requireUser } from "../../../_shared";

/**
 * POST /api/workflows/[id]/ai/apply — confirmed WorkflowPatch apply (Slice 4.AI-9B).
 *
 * The mutation-capable companion to the preview-only plan route. It delegates to
 * the AI-6 apply service (`applyWorkflowPatchForAI`), which re-loads the UNREDACTED
 * definition, RE-VALIDATES (AI-3) at apply time, enforces optimistic concurrency
 * (read- and write-time), requires explicit confirmation for high-risk/destructive
 * patches, and persists via the existing guarded repo update. This route makes NO
 * model call, NO planner call, never auto-applies, and never mutates outside the
 * apply service. It does NOT trust any client-supplied preview/risk — the service
 * recomputes everything.
 *
 * Status mapping:
 *   - 200 success.
 *   - 404 NOT_FOUND (missing / not owned — no existence leak).
 *   - 428 CONFIRMATION_REQUIRED (precondition: must confirm a high-risk patch).
 *   - 409 STALE_PATCH (baseRevision != current, incl. write-time concurrency miss).
 *   - 400 PATCH_INVALID / UNSUPPORTED_OPERATION / VALIDATION_FAILED.
 *   - 500 UPDATE_FAILED (server-side persist/load error) and any unexpected throw.
 *
 * The response body is the already-sanitized `ApplyWorkflowPatchResult` (no
 * secrets, no config values, no raw definition; AI-6 scrubs secret-shaped fields).
 */

const ConfirmationSchema = z.object({
  confirmed: z.boolean(),
  confirmationToken: z.string().optional(),
  acceptedRiskLevel: z.string().optional(),
  acceptedAt: z.string().optional(),
});

// `patch` must be a JSON object; full structural + semantic validation is the
// apply service's job (it re-parses with the AI-3 schema → PATCH_INVALID on bad
// shape). Unknown top-level keys are stripped (forward-compatible).
const ApplyRequestSchema = z.object({
  patch: z.record(z.string(), z.unknown()),
  confirmation: ConfirmationSchema.optional(),
});

function applyFailureStatus(code: ApplyErrorCode): number {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "CONFIRMATION_REQUIRED":
      return 428;
    case "STALE_PATCH":
      return 409;
    case "PATCH_INVALID":
    case "UNSUPPORTED_OPERATION":
    case "VALIDATION_FAILED":
      return 400;
    case "UPDATE_FAILED":
      return 500;
    default:
      return 400;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id || id.trim() === "") {
    return NextResponse.json({ error: "Workflow id is required." }, { status: 400 });
  }

  const body = await parseJsonBody(request, ApplyRequestSchema);
  if (!body.ok) return body.response;

  let result;
  try {
    result = await applyWorkflowPatchForAI({
      userId: auth.userId,
      workflowId: id,
      patch: body.data.patch as unknown as WorkflowPatch,
      ...(body.data.confirmation ? { confirmation: body.data.confirmation } : {}),
    });
  } catch {
    // Sanitized — never leak internals / connection strings / stack traces.
    return NextResponse.json(
      { error: "Failed to apply the workflow patch." },
      { status: 500 },
    );
  }

  // Fire-and-forget AI observability (AI-10). Fail-open — never affects the
  // response. No raw patch config is recorded (only ids / codes / counts).
  const requestPatchId =
    typeof body.data.patch.patchId === "string" ? body.data.patch.patchId : null;
  try {
    await recordAiApplyOutcome(
      { userId: auth.userId, workflowId: id, patchId: requestPatchId },
      result,
    );
  } catch {
    /* analytics must never break the route */
  }

  const status = result.ok ? 200 : applyFailureStatus(result.code);
  return NextResponse.json(result, { status });
}
