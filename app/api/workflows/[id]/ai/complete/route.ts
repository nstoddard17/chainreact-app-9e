import { NextResponse } from "next/server";
import { z } from "zod";
import {
  completePlanWithRequiredInputs,
  type CompletePlanRequiredInputAnswer,
  type PlanRequiredUserInput,
} from "@/services/ai/planner";
import type { WorkflowPatch } from "@/services/workflows/patch/types";
import type { CurrentWorkflowGraphView } from "@/services/ai/planner";
import { logAiCostDebug } from "@/services/ai/events/aiCostDebug";
import { parseJsonBody, requireUser } from "../../../_shared";

/**
 * POST /api/workflows/[id]/ai/complete — deterministic required-input completion
 * (Slice 4.AI-35B). NO model call.
 *
 * When the user fills the EXACT required fields the planner already identified,
 * this route drops the values into the pending patch's config (or builds an
 * `updateNodeConfig` for an existing-canvas node), runs the SAME AI-5 preview +
 * apply-readiness gate as the planner, and returns an apply-ready
 * `PlanWorkflowSuccess`. It NEVER calls a model, NEVER mutates the workflow, and
 * NEVER auto-applies.
 *
 * When the answers can't be safely mapped (no target node, preview rejects,
 * provider-choice shape change, etc.), it returns `{ ok:false, code:"NEEDS_REPLAN",
 * reason }` (status 200) so the client falls back to the model planner. The
 * client only calls this route for pure structured-answer follow-ups; ambiguous
 * / free-text / provider-choice follow-ups go straight to /ai/plan.
 */

const MAX_ANSWERS = 50;
const MAX_VALUE_LENGTH = 4_000;

// nodeId/field are OPTIONAL (Slice 4.AI-35F): a bare answer (rendered required
// text control with no node identity) is forwarded without a target, and
// `completePlanWithRequiredInputs` infers the unique missing required text field
// from the pending patch. A targeted answer (AI-35B) still carries both.
const AnswerSchema = z.object({
  nodeId: z.string().min(1).max(200).optional(),
  field: z.string().min(1).max(200).optional(),
  value: z.string().max(MAX_VALUE_LENGTH),
  multiple: z.boolean().optional(),
});

const CurrentGraphSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        kind: z.enum(["trigger", "action"]),
        provider: z.string().min(1).max(100),
        type: z.string().min(1).max(200),
      }),
    )
    .max(500),
  edges: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        from: z.string().min(1).max(200),
        to: z.string().min(1).max(200),
      }),
    )
    .max(500),
});

// The pending patch + carried required-input are forwarded from the plan
// result the client already holds (same as the apply route accepts a patch).
// Validated loosely here; the patch is re-validated by the AI-3/AI-5 preview.
const CompleteRequestSchema = z.object({
  proposedPatch: z.record(z.string(), z.unknown()).nullable().optional(),
  answers: z.array(AnswerSchema).min(1).max(MAX_ANSWERS),
  currentGraph: CurrentGraphSchema.optional(),
  intentSummary: z.string().max(2_000).optional(),
  carryRequiredInput: z
    .array(z.object({ label: z.string().max(2_000), kind: z.string().max(100) }).passthrough())
    .max(MAX_ANSWERS)
    .optional(),
});

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

  const body = await parseJsonBody(request, CompleteRequestSchema);
  if (!body.ok) return body.response;

  let completion;
  try {
    completion = await completePlanWithRequiredInputs({
      userId: auth.userId,
      workflowId: id,
      proposedPatch: (body.data.proposedPatch ?? null) as WorkflowPatch | null,
      answers: body.data.answers as readonly CompletePlanRequiredInputAnswer[],
      ...(body.data.currentGraph
        ? { currentGraph: body.data.currentGraph as CurrentWorkflowGraphView }
        : {}),
      ...(body.data.intentSummary ? { intentSummary: body.data.intentSummary } : {}),
      ...(body.data.carryRequiredInput
        ? { carryRequiredInput: body.data.carryRequiredInput as unknown as PlanRequiredUserInput[] }
        : {}),
    });
  } catch {
    // Any unexpected throw → tell the client to re-plan (never a 500 that would
    // make the deterministic path look more fragile than the model path).
    return NextResponse.json(
      { ok: false, code: "NEEDS_REPLAN", reason: "completion_error" },
      { status: 200 },
    );
  }

  // Dev-only cost visibility (AI-35D hook): record whether this follow-up was
  // resolved deterministically (no model call) or is being bounced to re-plan.
  try {
    logAiCostDebug({
      feature: "workflow_creation",
      eventType: "ai_required_input_completed",
      plannerInteractionKind: "follow_up",
      requiredInputResolutionMode: completion.ok ? "deterministic" : "model_replan",
      requiredInputResolutionReason: completion.ok ? "config_values_applied" : completion.reason,
      patchOutcome: completion.ok ? "previewed" : "none",
      workflowId: id,
    });
  } catch {
    /* dev logging must never break the route */
  }

  if (!completion.ok) {
    return NextResponse.json(
      { ok: false, code: "NEEDS_REPLAN", reason: completion.reason },
      { status: 200 },
    );
  }
  return NextResponse.json(completion.result, { status: 200 });
}
