import { NextResponse } from "next/server";
import { z } from "zod";
import * as workflowsRepo from "@/repositories/workflows";
import { createLifecycleOrchestrator } from "@/services/workflows/orchestratorFactory";
import {
  findConfirmationRequiredActions,
  isValidConfirmationText,
} from "@/services/workflows/riskConfirmation";
import {
  requireUser,
  runLifecycle,
  toWorkflowSummary,
} from "../../_shared";

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
  if (workflow && workflow.state !== "deleted") {
    const risk = findConfirmationRequiredActions(workflow.draftDefinition.nodes);
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

  const orch = createLifecycleOrchestrator();
  return runLifecycle(
    () => orch.activate(id),
    (record) => NextResponse.json(toWorkflowSummary(record)),
  );
}
