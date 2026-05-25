import { NextResponse } from "next/server";
import { z } from "zod";
import {
  planWorkflowFromPromptForAI,
  type PlanWorkflowFailureCode,
} from "@/services/ai/planner";
import { parseJsonBody, requireUser } from "../../../_shared";

/**
 * POST /api/workflows/[id]/ai/plan — the first app-facing AI route (Slice 4.AI-9A).
 *
 * PREVIEW-ONLY. Turns a user prompt into a proposed `WorkflowPatch` + deterministic
 * preview via `planWorkflowFromPromptForAI` (model → parse → AI-3 validate → AI-5
 * preview). It NEVER applies a patch, NEVER mutates the workflow / DB, and NEVER
 * persists the prompt or model output. The route stays thin: auth → validate →
 * call the orchestrator → format response.
 *
 * Safety / status mapping:
 *   - 401 unauthenticated; 400 invalid body.
 *   - 404 when the workflow is not found / not owned (no existence leak).
 *   - 503 when the model is unconfigured / the model call failed (MODEL_FAILED) —
 *     a handled, fail-safe outcome, NEVER a 500.
 *   - 502 when the model output could not be parsed / previewed.
 *   - 200 for any successful plan (including "needs user input" and
 *     "preview rejected / not apply-ready" — the body's `ok` + `canApplyLater`
 *     carry the distinction).
 *   - 500 only for an unexpected thrown error (sanitized).
 *
 * The response body is the already-sanitized `PlanWorkflowResult` (no secrets,
 * no config values, no apply side effects).
 */

const MAX_PROMPT_LENGTH = 8_000;

// Unknown keys are stripped (forward-compatible); declared fields are validated.
const PlanRequestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, "prompt is required")
    .max(MAX_PROMPT_LENGTH, "prompt is too long"),
  modelTier: z.enum(["fast", "strong"]).optional(),
});

function planFailureStatus(code: PlanWorkflowFailureCode): number {
  switch (code) {
    case "MODEL_FAILED":
      // Includes NOT_CONFIGURED — the AI is unavailable, not a server crash.
      return 503;
    case "PARSE_FAILED":
    case "PREVIEW_UNAVAILABLE":
      return 502;
    default:
      return 502;
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

  const body = await parseJsonBody(request, PlanRequestSchema);
  if (!body.ok) return body.response;

  let result;
  try {
    result = await planWorkflowFromPromptForAI({
      userId: auth.userId,
      workflowId: id,
      prompt: body.data.prompt,
      ...(body.data.modelTier ? { modelTier: body.data.modelTier } : {}),
    });
  } catch {
    // Sanitized — never leak internals / connection strings / stack traces.
    return NextResponse.json(
      { error: "Failed to generate a workflow plan." },
      { status: 500 },
    );
  }

  // Workflow not found / not owned → 404 (matches the route convention; no
  // existence leak). Every other failure is a handled structured result.
  if (
    !result.ok &&
    result.code === "PREVIEW_UNAVAILABLE" &&
    result.errors.some((e) => e.code === "NOT_FOUND")
  ) {
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  }

  const status = result.ok ? 200 : planFailureStatus(result.code);
  return NextResponse.json(result, { status });
}
