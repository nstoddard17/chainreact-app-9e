import { NextResponse } from "next/server";
import { z } from "zod";
import {
  planWorkflowFromPromptForAI,
  type PlanWorkflowFailureCode,
} from "@/services/ai/planner";
import { recordAiPlanOutcome } from "@/services/ai/events";
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
/**
 * Slice 4.AI-24 — defense against an oversized `currentGraph` payload (a
 * malicious / runaway client could send a huge nodes/edges list and inflate
 * the planner prompt). Real workflows fit comfortably under 500 nodes; we
 * cap conservatively here.
 */
const MAX_CURRENT_GRAPH_NODES = 500;
const MAX_CURRENT_GRAPH_EDGES = 500;

// Slice 4.AI-24 — value-free snapshot of the client's pending/unsaved
// builder graph. Deliberately minimal — provider:type pairs + edges only,
// NO config (the planner reads catalog metadata for config shape; it never
// reads canvas config values), NO position, NO secrets. The route does
// NOT consult `WorkflowDefinitionSchema` here because we don't need the
// full strict shape — just enough for the planner to know what's on the
// canvas.
const CurrentGraphNodeSchema = z.object({
  id: z.string().min(1).max(200),
  kind: z.enum(["trigger", "action"]),
  provider: z.string().min(1).max(100),
  type: z.string().min(1).max(200),
  // Slice 4.BUILDER-NODE-IDENTITY-1 — optional user node name, forwarded to the
  // planner as read-only context (shown next to the opaque id). Never identity.
  displayName: z.string().max(120).optional(),
});
const CurrentGraphEdgeSchema = z.object({
  id: z.string().min(1).max(200),
  from: z.string().min(1).max(200),
  to: z.string().min(1).max(200),
});
const CurrentGraphSchema = z.object({
  nodes: z.array(CurrentGraphNodeSchema).max(MAX_CURRENT_GRAPH_NODES),
  edges: z.array(CurrentGraphEdgeSchema).max(MAX_CURRENT_GRAPH_EDGES),
});

// Unknown keys are stripped (forward-compatible); declared fields are validated.
const PlanRequestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, "prompt is required")
    .max(MAX_PROMPT_LENGTH, "prompt is too long"),
  modelTier: z.enum(["fast", "strong"]).optional(),
  /**
   * Slice 4.AI-24 — optional client-supplied current builder-canvas snapshot.
   * When omitted, the planner is told the canvas is empty (the right default
   * for "build a workflow from scratch"). Non-builder callers (none today)
   * can also omit this safely.
   */
  currentGraph: CurrentGraphSchema.optional(),
  /**
   * Slice 4.AI-35D — optional observability tag (initial prompt vs follow-up
   * vs retry). Forwarded ONLY to the fail-open recorder for cost attribution;
   * never reaches the planner, so it cannot change planner behavior.
   */
  interactionKind: z.enum(["initial_plan", "follow_up", "retry", "unknown"]).optional(),
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
      // AI-24 — forward the canvas snapshot when the client sent one. The
      // planner is the only consumer; the apply route is unaffected (no
      // canvas snapshot involvement at apply time).
      ...(body.data.currentGraph ? { currentGraph: body.data.currentGraph } : {}),
    });
  } catch {
    // Sanitized — never leak internals / connection strings / stack traces.
    return NextResponse.json(
      { error: "Failed to generate a workflow plan." },
      { status: 500 },
    );
  }

  // Fire-and-forget AI observability (AI-10). Fail-open: the recorder swallows
  // its own errors; the extra try/catch is belt-and-suspenders so analytics can
  // never affect the response. No raw prompt/config is recorded.
  try {
    await recordAiPlanOutcome(
      {
        userId: auth.userId,
        workflowId: id,
        ...(body.data.interactionKind ? { interactionKind: body.data.interactionKind } : {}),
      },
      result,
    );
  } catch {
    /* analytics must never break the route */
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
