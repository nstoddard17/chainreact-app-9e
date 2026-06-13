import { NextResponse } from "next/server";
import { diagnoseWorkflowForAgent } from "@/services/ai/diagnostics/diagnoseWorkflowForAgent";
import { parseDraftOverride } from "@/services/ai/diagnostics/draftOverride";
import { recordAiCostEvent } from "@/services/billing/aiCostEvents";
import { computeAiCreditCharge } from "@/core/billing/aiCreditPolicy";
import { loadWorkflowForMember, requireUser } from "../../../_shared";

/**
 * POST /api/workflows/[id]/ai/diagnose — read-only "Check this workflow" for the
 * React Agent (Slice 4.AI-DIAG-1). Thin shell: auth → delegate → JSON.
 *
 * The route owns ONLY the session-auth boundary + serialization. All data access,
 * membership authz, personal-provider provenance, the diagnostic composition, and
 * the deterministic rendering live in `diagnoseWorkflowForAgent`, which consumes
 * `services/diagnostics/*` DIRECTLY (never the MCP server). NO body is required.
 *
 * This is the INTERNAL consumer path: authentication is the user session
 * (`requireUser`), NOT the MCP machine bearer. The composition forwards only the
 * session `userId` as the subject; the diagnostic services apply the same
 * account-membership + provenance walls they apply for the MCP path.
 *
 * Slice 4.AI-CREDITS-2 (recording-only): the deterministic diagnosis makes NO LLM
 * call, so it records a **0-credit** `ai_cost_events` row for usage observability —
 * never deducts/enforces. Recorded ONLY when access is OK (a non-member/not-found
 * walls out with no event). Fail-open: a telemetry failure never breaks the
 * diagnosis response. Slice 4.AI-DIAG-2-pre: the cost event is attributed to the
 * **workflow-owning account** (via `loadWorkflowForMember`), matching the planner
 * route's 3b-0 attribution — not the actor's personal account.
 *
 * NEVER returned/recorded: tokens, refresh tokens, providerAccountId, account
 * metadata, integration display names, connectedByUserId, exact expiry, raw
 * granted scopes, external account labels, or workflow config values.
 */

/**
 * Record the 0-credit deterministic-diagnosis observability event. Fail-open.
 *
 * Slice 4.AI-DIAG-2-pre — attribute the event to the WORKFLOW-OWNING account (same
 * rule the planner route adopted in 3b-0, `e538a6b0c`), NOT the actor's personal
 * account. This runs only AFTER `diagnoseWorkflowForAgent` returned access==="OK"
 * (the caller is a confirmed member), so `loadWorkflowForMember` resolves in the
 * normal path. A race (workflow deleted / membership lost between the two reads)
 * makes it return `!ok` → SKIP the telemetry (fail-open) rather than mis-attribute.
 * Still 0-credit, still no gate, still no LLM — only the cost-owner changed.
 */
async function recordDiagnosisCostEvent(userId: string, workflowId: string): Promise<void> {
  const wf = await loadWorkflowForMember(workflowId, userId);
  if (!wf.ok) return; // fail-open: never mis-attribute, never break the response
  const charge = computeAiCreditCharge({ feature: "other", isLlmCall: false });
  await recordAiCostEvent({
    accountId: wf.record.accountId,
    userId,
    workflowId,
    feature: "other",
    eventType: "ai_cost_recorded",
    aiCreditsCharged: charge.credits, // 0 — deterministic, no LLM
    success: true,
    metadata: {
      kind: "workflow_diagnosis",
      deterministic: true,
      creditPolicyVersion: charge.policyVersion,
    },
  });
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

  // AI-DIAG-FIX-1 — OPTIONAL current-builder-draft snapshot. Validated (strict
  // WorkflowDefinitionSchema) and used for the deterministic diagnosis ONLY; never
  // persisted. Absent body → diagnose the saved state (back-compat). Still 0-credit,
  // still no LLM — diagnosing the unsaved canvas mutates/saves/runs nothing.
  const body = await request.json().catch(() => ({}));
  const override = parseDraftOverride(body);
  if (!override.ok) {
    return NextResponse.json({ error: "Invalid workflow draft." }, { status: 400 });
  }

  let dto;
  try {
    dto = await diagnoseWorkflowForAgent({
      subjectUserId: auth.userId,
      workflowId: id,
      ...(override.draftOverride ? { draftOverride: override.draftOverride } : {}),
    });
  } catch {
    // Sanitized — never leak internals / connection strings / stack traces.
    return NextResponse.json({ error: "Failed to diagnose the workflow." }, { status: 500 });
  }

  // AI-CREDITS-2 recording-only telemetry. Only for an authorized result; fail-open.
  if (dto.access === "OK") {
    try {
      await recordDiagnosisCostEvent(auth.userId, id);
    } catch {
      // Telemetry must never break the diagnosis response.
    }
  }

  return NextResponse.json(dto);
}
