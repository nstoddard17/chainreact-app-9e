import { NextResponse } from "next/server";
import { z } from "zod";
import {
  planWorkflowFromPromptForAI,
  type PlanWorkflowFailureCode,
} from "@/services/ai/planner";
import { recordAiPlanOutcome } from "@/services/ai/events";
import {
  aiCreditGate,
  type AiCreditGateOutcome,
} from "@/services/billing/aiCreditGate";
import { loadWorkflowForMember, parseJsonBody, requireUser } from "../../../_shared";

/**
 * POST /api/workflows/[id]/ai/plan — the first app-facing AI route (Slice 4.AI-9A).
 *
 * PREVIEW-ONLY. Turns a user prompt into a proposed `WorkflowPatch` + deterministic
 * preview via `planWorkflowFromPromptForAI` (model → parse → AI-3 validate → AI-5
 * preview). It NEVER applies a patch, NEVER mutates the workflow / DB, and NEVER
 * persists the prompt or model output. The route stays thin: auth → validate →
 * resolve+authorize the workflow account (4.AI-CREDITS-3b-0) → call the orchestrator
 * → format response.
 *
 * Safety / status mapping:
 *   - 401 unauthenticated; 400 invalid body.
 *   - 404 when the workflow is not found / not owned (no existence leak).
 *   - 402 `AI_CREDITS_EXHAUSTED` when the AI-credit gate refuses (flag ON + over
 *     limit) — the planner is NOT called (4.AI-CREDITS-3b-i).
 *   - 403 `ACCOUNT_PENDING_DELETION` when the account is frozen — planner NOT called.
 *   - 503 when the model is unconfigured / the model call failed (MODEL_FAILED), or
 *     `AI_GATE_ERROR` when the gate itself errors (fail-closed) — handled, NEVER a 500.
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

/**
 * Slice 4.AI-CREDITS-3b-i — map an AI-credit gate refusal to a no-leak HTTP
 * response. The body carries an `ok:false` flag (so the typed client treats it as a
 * handled result, not a transport throw) shaped like a plan failure
 * (`code` + `message` + `errors`). No tokens / emails / providers / account ids —
 * only the typed code, fixed copy, and (for the quota case) the member-visible
 * `used`/`limit` integers.
 */
function aiCreditDenialResponse(
  gate: Extract<AiCreditGateOutcome, { ok: false }>,
): NextResponse {
  if (gate.reason === "account_frozen") {
    return NextResponse.json(
      {
        ok: false,
        code: "ACCOUNT_PENDING_DELETION",
        message: "This account is pending deletion.",
        errors: [
          { stage: "billing", code: "ACCOUNT_PENDING_DELETION", message: "Account pending deletion." },
        ],
      },
      { status: 403 },
    );
  }
  if (gate.reason === "gate_error") {
    // Fail-closed: the gate could not meter the call, so we refuse it (never run a
    // paid call we couldn't account for). Same "AI temporarily unavailable" family
    // as MODEL_FAILED → 503.
    return NextResponse.json(
      {
        ok: false,
        code: "AI_GATE_ERROR",
        message: "The AI assistant is temporarily unavailable. Please try again in a moment.",
        errors: [
          { stage: "billing", code: "AI_GATE_ERROR", message: "AI credit gate error." },
        ],
      },
      { status: 503 },
    );
  }
  // insufficient_ai_credits → 402 Payment Required (quota / upgrade).
  return NextResponse.json(
    {
      ok: false,
      code: "AI_CREDITS_EXHAUSTED",
      message: "You've used all your AI credits for this billing period.",
      used: gate.used,
      limit: gate.limit,
      errors: [
        { stage: "billing", code: "AI_CREDITS_EXHAUSTED", message: "AI credit limit reached." },
      ],
    },
    { status: 402 },
  );
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

  // Slice 4.AI-CREDITS-3b-0 — resolve the WORKFLOW-OWNING account + authorize
  // membership BEFORE the paid planner call. `loadWorkflowForMember` is the
  // canonical resolver: RLS-scoped `getById` + `isMember`, collapsing a missing /
  // deleted / non-member workflow to the standard no-leak 404 (no existence leak,
  // and — unlike before — no model call is made for an unauthorized id). The
  // returned `record.accountId` is the cost owner for AI usage (personal → personal,
  // team → team pool, business → business pool); it is ALWAYS resolved server-side
  // and NEVER taken from the client.
  const wf = await loadWorkflowForMember(id, auth.userId);
  if (!wf.ok) return wf.response;
  const accountId = wf.record.accountId;

  // Slice 4.AI-CREDITS-3b-i — meter AI credits BEFORE the paid planner call.
  // Flag OFF (`ENABLE_AI_CREDIT_ENFORCEMENT` ≠ "true", the default) → the gate is a
  // pure no-op (`skipped:enforcement_disabled`, no DB write, no charge) and the
  // member happy path is byte-identical. Flag ON → deduct the `workflow_creation`
  // charge from the WORKFLOW-OWNING account; over-limit (402) / frozen (403) /
  // gate-error (503, fail-closed) all refuse the LLM call. This is ONE gate per
  // user-initiated planner call — the classifier sub-call is not separately gated.
  const gate = await aiCreditGate({
    accountId,
    feature: "workflow_creation",
    plannedTier: body.data.modelTier ?? "fast",
  });
  if (!gate.ok) return aiCreditDenialResponse(gate);

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
    // 4.AI-CREDITS-3b-0: AI cost is owned by the WORKFLOW-OWNING account (resolved
    // above), never the actor's personal account — so a Team/Business workflow's
    // usage attributes to the team/business account, not the member's personal pool.
    // `userId` remains the actor (provenance, not owner).
    await recordAiPlanOutcome(
      {
        accountId,
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
