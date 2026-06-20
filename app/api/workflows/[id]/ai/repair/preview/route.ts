import { NextResponse } from "next/server";
import { diagnoseWorkflowForAgent } from "@/services/ai/diagnostics/diagnoseWorkflowForAgent";
import { parseDraftOverride } from "@/services/ai/diagnostics/draftOverride";
import {
  diagnosisHasRepairableIssue,
  previewWorkflowRepair,
  type PreviewWorkflowRepairResult,
  REPAIR_PREVIEW_NOT_APPLIED_NOTICE,
} from "@/services/ai/repair/previewWorkflowRepair";
import {
  parseSelectedRepairSelection,
  runDanglingEdgeRepairPreview,
  runDeterministicRepairPreview,
  runSelectedVariableRepairPreview,
  runSelfLoopEdgeRepairPreview,
  runDuplicateEdgeRepairPreview,
} from "@/services/ai/repair/deterministicRepairPreview";
import {
  aiCreditGate,
  type AiCreditGateOutcome,
} from "@/services/billing/aiCreditGate";
import {
  recordAiModelCallCompleted,
  recordAiModelCallFailed,
} from "@/services/billing/aiCostEvents";
import { computeAiCreditCharge } from "@/core/billing/aiCreditPolicy";
import { estimateModelCostMicros } from "@/core/ai/modelPricing";
import { getModelForProviderTier, MODEL_API_KEY_ENV } from "@/core/ai/models";
import {
  createModelClientForModel,
  isOpenAiProviderEnabled,
} from "@/services/ai/modelClients/createModelClient";
import { reactAgentService } from "@/services/ai/reactAgent";
import { reactAgentAuditRecorder } from "@/services/ai/reactAgent/audit";
import { repairPatchRef } from "@/services/ai/repair/repairPatchRef";
import { loadWorkflowForMember, requireUser } from "../../../../_shared";

/**
 * POST /api/workflows/[id]/ai/repair/preview — optional LLM VALIDATED-PATCH
 * PREVIEW for the (already-computed) safe workflow diagnosis (Slice 4.AI-REPAIR-2b).
 *
 * Preview-ONLY: the model proposes a `WorkflowPatch`; the server validates it
 * through the EXISTING deterministic preview engine (`previewWorkflowPatchForAI`
 * → `normalizeAiPatchNodeKeys` → `validateWorkflowPatch`) and returns a no-leak,
 * label-based "what would change" view with the AUTHORITATIVE recomputed risk. No
 * patch is applied / saved / run; no graph mutation; no apply/persistence import.
 * It is the structured, validation-backed sibling of `…/ai/repair/plan`.
 *
 * Flow (mirrors the repair/plan route exactly): auth → `loadWorkflowForMember`
 * (workflow-owning account + no-leak 404) → **re-derive the DTO server-side**
 * (never trust a client-posted DTO; optional current-draft snapshot validated via
 * `parseDraftOverride`) → access wall returns the safe DTO with NO gate/model →
 * require OpenAI configured (so a known-unconfigured state never charges) →
 * `aiCreditGate` BEFORE the model call → OpenAI `fast` → `previewWorkflowRepair`
 * → record an `ai_cost_events` model-call event (feature `workflow_repair`,
 * credits 4, billed to the workflow-owning account, fail-open) → typed response.
 *
 * Status mapping: 401 unauth · 400 bad id / invalid draft · 404 not-found/non-member
 * · 402 `AI_CREDITS_EXHAUSTED` (flag ON + insufficient) · 403 frozen · 200 handled
 * `NO_SAFE_PATCH`/`NOTHING_TO_PREVIEW` (incl. AI-REPAIR-2E malformed/unusable model
 * output — the model responded but produced no safe fix) · 503 `MODEL_FAILED`
 * (genuine provider/transport/config failure) / `AI_GATE_ERROR` / not-configured ·
 * 500 `GRAPH_UNAVAILABLE`/unexpected.
 *
 * No-leak: the model sees only `buildDiagnosisExplainContext(dto)` + an opaque-id
 * node inventory (NO config values); the response carries `{ ok, preview,
 * notAppliedNotice }` where `preview` uses node LABELS, not ids, in its change
 * descriptions — never a raw model dump, config, token, integration row, account
 * id, or provider account label. `notAppliedNotice` is server-set + immutable.
 */

const MODEL_TIER = "fast" as const;
const REPAIR_FEATURE = "workflow_repair" as const;

/** Mirror of the repair/plan route's denial mapping — typed, no-leak `ok:false` bodies. */
function aiCreditDenialResponse(
  gate: Extract<AiCreditGateOutcome, { ok: false }>,
): NextResponse {
  if (gate.reason === "account_frozen") {
    return NextResponse.json(
      {
        ok: false,
        code: "ACCOUNT_PENDING_DELETION",
        message: "This account is pending deletion.",
        errors: [{ stage: "billing", code: "ACCOUNT_PENDING_DELETION", message: "Account pending deletion." }],
      },
      { status: 403 },
    );
  }
  if (gate.reason === "gate_error") {
    return NextResponse.json(
      {
        ok: false,
        code: "AI_GATE_ERROR",
        message: "The AI assistant is temporarily unavailable. Please try again in a moment.",
        errors: [{ stage: "billing", code: "AI_GATE_ERROR", message: "AI credit gate error." }],
      },
      { status: 503 },
    );
  }
  return NextResponse.json(
    {
      ok: false,
      code: "AI_CREDITS_EXHAUSTED",
      message: "You've used all AI credits for this billing period.",
      used: gate.used,
      limit: gate.limit,
      errors: [{ stage: "billing", code: "AI_CREDITS_EXHAUSTED", message: "AI credit limit reached." }],
    },
    { status: 402 },
  );
}

/** Record the repair-preview model-call event, billing the workflow-owning account. Fail-open. */
async function recordPreviewEvent(
  accountId: string,
  userId: string,
  workflowId: string,
  result: PreviewWorkflowRepairResult,
): Promise<void> {
  try {
    const charge = computeAiCreditCharge({
      feature: REPAIR_FEATURE,
      isLlmCall: true,
      modelTier: MODEL_TIER,
    });
    const scope = { accountId, userId, feature: REPAIR_FEATURE, workflowId };
    if (result.ok) {
      const micros = estimateModelCostMicros(result.model.modelId, result.model.usage);
      await recordAiModelCallCompleted(scope, {
        modelName: result.model.modelId,
        modelProvider: "openai",
        ...(result.model.usage
          ? { inputTokens: result.model.usage.inputTokens, outputTokens: result.model.usage.outputTokens }
          : {}),
        ...(result.model.latencyMs !== undefined ? { latencyMs: result.model.latencyMs } : {}),
        ...(micros !== null ? { estimatedCostMicros: micros } : {}),
        aiCreditsCharged: charge.credits,
        metadata: {
          kind: "workflow_repair_preview",
          creditPolicyVersion: charge.policyVersion,
        },
      });
    } else {
      await recordAiModelCallFailed(scope, {
        ...(result.model?.modelId ? { modelName: result.model.modelId } : {}),
        modelProvider: "openai",
        ...(result.model?.latencyMs !== undefined ? { latencyMs: result.model.latencyMs } : {}),
        // AI-REPAIR-2E — `detail` keeps the NO_SAFE_PATCH sub-reason (model decline vs
        // malformed/unparseable output) observable in telemetry; never user-facing.
        metadata: {
          kind: "workflow_repair_preview",
          code: result.code,
          ...(result.detail ? { detail: result.detail } : {}),
        },
      });
    }
  } catch {
    // Telemetry must never break the response.
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

  // AI-DIAG-FIX-1 — OPTIONAL current-builder-draft snapshot so the preview
  // re-derives the SAME current diagnosis the user saw (not stale saved state).
  // Validated; used for the deterministic re-derivation only; never persisted.
  // `proposalContext` (optional) is non-authoritative steering for the model.
  const body = await request.json().catch(() => ({}));
  const override = parseDraftOverride(body);
  if (!override.ok) {
    return NextResponse.json({ error: "Invalid workflow draft." }, { status: 400 });
  }
  const proposalContext = (body as { proposalContext?: unknown })?.proposalContext;

  // Workflow-owning account + membership (no-leak 404). The cost owner is resolved
  // server-side; never client-supplied.
  const wf = await loadWorkflowForMember(id, auth.userId);
  if (!wf.ok) return wf.response;
  const accountId = wf.record.accountId;

  // Re-derive the diagnosis server-side — the model never sees a client-posted DTO.
  let dto;
  try {
    dto = await diagnoseWorkflowForAgent({
      subjectUserId: auth.userId,
      workflowId: id,
      ...(override.draftOverride ? { draftOverride: override.draftOverride } : {}),
    });
  } catch {
    return NextResponse.json({ error: "Failed to diagnose the workflow." }, { status: 500 });
  }

  // Access wall (NOT_FOUND / NO_ACCESS) → return the safe DTO; NO gate, NO model call.
  if (dto.access !== "OK") {
    return NextResponse.json(dto);
  }

  // AI-REPAIR-2D — the diagnosis is re-derived from the CURRENT draft. When there's
  // nothing left to repair (e.g. the user already fixed the field a now-stale
  // proposal was based on, so the draft is clean/ready), there is NOTHING to
  // preview. Return a handled "run Check again" result — NO gate, NO model call, NO
  // charge, and crucially NOT a 503. (Expected state mismatch, not a failure.)
  if (!diagnosisHasRepairableIssue(dto)) {
    return NextResponse.json({
      ok: false,
      code: "NOTHING_TO_PREVIEW",
      message: "This issue may already be fixed. Run Check workflow again for an up-to-date result.",
    });
  }

  // AI-REPAIR-3L — an EXPLICIT user-selected replacement (multiple-candidate case).
  // When the body carries `selectedRepair`, we run ONLY the deterministic
  // selected-replacement preview and NEVER fall through to the model path (so the
  // model never sees the user's chosen operation text). The selection is re-validated
  // server-side against the recomputed candidate set; an invalid/unsafe choice is a
  // handled NO_SAFE_PATCH (no gate, no model, no charge). This runs before the auto
  // one-candidate path + the gate/model, mirroring the AI-REPAIR-3H free-path ordering.
  const selectedRepair = parseSelectedRepairSelection(body);
  if (selectedRepair !== undefined) {
    const selectedPreview = selectedRepair
      ? await runSelectedVariableRepairPreview({
          userId: auth.userId,
          workflowId: id,
          selection: selectedRepair,
          ...(override.draftOverride ? { draftDefinition: override.draftOverride } : {}),
        })
      : null;
    if (selectedPreview) {
      return NextResponse.json({
        ok: true,
        preview: selectedPreview.preview,
        notAppliedNotice: REPAIR_PREVIEW_NOT_APPLIED_NOTICE,
      });
    }
    return NextResponse.json({
      ok: false,
      code: "NO_SAFE_PATCH",
      message:
        "That replacement can't be applied automatically. Run Check workflow again, or open the field and fix it manually.",
    });
  }

  // AI-REPAIR-4A — explicit dangling/broken-edge cleanup. When the body sets
  // `repairDanglingEdges`, run ONLY the deterministic `removeEdge` preview (no node
  // deletion, no new endpoints) and NEVER fall through to the model path. Free: no
  // OpenAI-config requirement, no credit gate, no telemetry — same ordering as 3H.
  if ((body as { repairDanglingEdges?: unknown })?.repairDanglingEdges === true) {
    const edgePreview = await runDanglingEdgeRepairPreview({
      dto,
      userId: auth.userId,
      workflowId: id,
      ...(override.draftOverride ? { draftDefinition: override.draftOverride } : {}),
    });
    if (edgePreview) {
      return NextResponse.json({
        ok: true,
        preview: edgePreview.preview,
        notAppliedNotice: REPAIR_PREVIEW_NOT_APPLIED_NOTICE,
      });
    }
    return NextResponse.json({
      ok: false,
      code: "NO_SAFE_PATCH",
      message:
        "That broken connection can't be removed automatically. Run Check workflow again, or fix the connection manually.",
    });
  }

  // AI-REPAIR-COVERAGE-1 — explicit self-loop edge cleanup. When the body sets
  // `repairSelfLoopEdges`, run ONLY the deterministic `removeEdge` preview (no node
  // deletion, no new endpoints) and NEVER fall through to the model path. Free: no
  // OpenAI-config requirement, no credit gate, no telemetry — same ordering as the
  // dangling-edge path above.
  if ((body as { repairSelfLoopEdges?: unknown })?.repairSelfLoopEdges === true) {
    const selfLoopPreview = await runSelfLoopEdgeRepairPreview({
      dto,
      userId: auth.userId,
      workflowId: id,
      ...(override.draftOverride ? { draftDefinition: override.draftOverride } : {}),
    });
    if (selfLoopPreview) {
      return NextResponse.json({
        ok: true,
        preview: selfLoopPreview.preview,
        notAppliedNotice: REPAIR_PREVIEW_NOT_APPLIED_NOTICE,
      });
    }
    return NextResponse.json({
      ok: false,
      code: "NO_SAFE_PATCH",
      message:
        "That self-connection can't be removed automatically. Run Check workflow again, or remove the connection manually.",
    });
  }

  // AI-REPAIR-COVERAGE-2 — explicit duplicate edge cleanup. When the body sets
  // `repairDuplicateEdges`, run ONLY the deterministic `removeEdge` preview (keep the first
  // of each identical (from,to,label) group; no node deletion, no new endpoints, no branch
  // change) and NEVER fall through to the model path. Free: no OpenAI-config requirement, no
  // credit gate, no telemetry — same ordering as the self-loop / dangling-edge paths above.
  if ((body as { repairDuplicateEdges?: unknown })?.repairDuplicateEdges === true) {
    const duplicatePreview = await runDuplicateEdgeRepairPreview({
      dto,
      userId: auth.userId,
      workflowId: id,
      ...(override.draftOverride ? { draftDefinition: override.draftOverride } : {}),
    });
    if (duplicatePreview) {
      return NextResponse.json({
        ok: true,
        preview: duplicatePreview.preview,
        notAppliedNotice: REPAIR_PREVIEW_NOT_APPLIED_NOTICE,
      });
    }
    return NextResponse.json({
      ok: false,
      code: "NO_SAFE_PATCH",
      message:
        "Those duplicate connections can't be removed automatically. Run Check workflow again, or remove them manually.",
    });
  }

  // AI-REPAIR-3H — a deterministic (model-free) repair preview is produced WITHOUT any
  // model call, so it must be FREE: no OpenAI-config requirement, no credit gate, and
  // no `ai_model_call_*` telemetry. Try it FIRST; when it yields an applyable preview
  // (the safe single-broken-variable-reference case), return it directly. Only fall
  // through to the paid model path below when no deterministic repair is available.
  // The returned `preview` is the SAME `PatchPreviewResult` shape the model path
  // returns (same validation + apply-readiness metadata) — no user-facing downgrade.
  const deterministic = await runDeterministicRepairPreview({
    dto,
    userId: auth.userId,
    workflowId: id,
    ...(override.draftOverride ? { draftDefinition: override.draftOverride } : {}),
  });
  if (deterministic) {
    return NextResponse.json({
      ok: true,
      preview: deterministic.preview,
      notAppliedNotice: REPAIR_PREVIEW_NOT_APPLIED_NOTICE,
    });
  }

  // OpenAI must be configured BEFORE we charge — a known-unconfigured state never
  // deducts. Reuse ENABLE_OPENAI_PROVIDER + OPENAI_API_KEY (NOT the planner flag).
  const apiKey = process.env[MODEL_API_KEY_ENV.openai];
  if (!isOpenAiProviderEnabled() || !apiKey) {
    return NextResponse.json(
      {
        ok: false,
        code: "MODEL_FAILED",
        message: "The AI repair assistant isn't available right now. Please try again later.",
        errors: [{ stage: "model", code: "NOT_CONFIGURED", message: "AI repair not configured." }],
      },
      { status: 503 },
    );
  }

  // Credit gate BEFORE the model call. Flag OFF → no-op (preview runs unmetered).
  const gate = await aiCreditGate({ accountId, feature: REPAIR_FEATURE, plannedTier: MODEL_TIER });
  if (!gate.ok) return aiCreditDenialResponse(gate);

  const client = createModelClientForModel(getModelForProviderTier("openai", MODEL_TIER), apiKey);
  // REACT-AGENT-CS-6 — run the ALREADY-authorized, ALREADY-gated repair-PROPOSAL (validated
  // preview) brain call THROUGH the React Agent registry (capability `repair_proposal`, mode
  // `proposes_change`). Auth, membership, safe-DTO re-derivation, the OpenAI-config check, and
  // `aiCreditGate` (above) all stay route-owned; the seam emits ONE audit row (success |
  // failed). PREVIEW only — `notAppliedNotice` is returned, NO patch is applied/persisted, and
  // NO raw patch/config/model text enters the audit (metadata-free at the seam). The
  // deterministic/model-free preview paths above run BEFORE the gate and are NOT this
  // capability (no model, $0) — intentionally not routed through the seam.
  const outcome = await reactAgentService.runAuthorizedCapability({
    scope: { userId: auth.userId, accountId, workflowId: id },
    intent: "propose_repair",
    capabilityId: "repair_proposal",
    auditRecorder: reactAgentAuditRecorder,
    classifyResult: (r) => (r.ok ? "success" : "failed"),
    // CS-7b — when the preview produced an APPLYABLE patch, attach the opaque,
    // one-way content ref (hash of the previewed operations + baseRevision) so this
    // proposal audit row can later correlate to its apply row. Not applyable / model
    // failure / no-safe-patch → no operations → null. Never carries raw patch content.
    deriveProposedPatchRef: (r) =>
      r.ok && r.preview.apply.applyable && r.preview.apply.operations && r.preview.apply.baseRevision
        ? repairPatchRef({
            workflowId: r.preview.workflowId,
            baseRevision: r.preview.apply.baseRevision,
            operations: r.preview.apply.operations,
          })
        : null,
    exec: () =>
      previewWorkflowRepair({
        dto,
        userId: auth.userId,
        workflowId: id,
        modelClient: client,
        tier: MODEL_TIER,
        proposalContext,
        // AI-REPAIR-2b — validate the patch against the SAME current-draft snapshot the
        // diagnosis used (when supplied), so the preview never reflects stale saved state.
        ...(override.draftOverride ? { draftDefinition: override.draftOverride } : {}),
      }),
  });
  if (!outcome.ok) {
    // Unreachable on the wired path (route guarantees a valid scope + the propose_repair
    // capability/intent); mapped to the same safe 503 a genuine model failure produces so the
    // response contract is unchanged.
    return NextResponse.json(
      {
        ok: false,
        code: "MODEL_FAILED",
        message: "Couldn't build a repair preview right now. Please try again.",
        errors: [{ stage: "model", code: "MODEL_FAILED", message: "Repair preview unavailable." }],
      },
      { status: 503 },
    );
  }
  const result = outcome.result;

  // Fail-open telemetry, billed to the workflow-owning account.
  await recordPreviewEvent(accountId, auth.userId, id, result);

  if (!result.ok) {
    // AI-REPAIR-2D — `NO_SAFE_PATCH` is a HANDLED, EXPECTED outcome (the model
    // declined to auto-patch — e.g. the remaining issue needs a value only the user
    // can supply, or a reconnect). Return a friendly 200, NOT a 503.
    if (result.code === "NO_SAFE_PATCH") {
      return NextResponse.json({
        ok: false,
        code: "NO_SAFE_PATCH",
        message:
          "The AI couldn't build a safe automatic fix — the remaining issue may need information only you can provide. Run Check workflow again, or fix it manually.",
      });
    }
    // GRAPH_UNAVAILABLE → 500; genuine model/parse failure → 503. Log the genuine
    // failure with a SAFE internal code only (no secrets / model text / config).
    const status = result.code === "GRAPH_UNAVAILABLE" ? 500 : 503;
    if (status === 503 && typeof console !== "undefined" && typeof console.error === "function") {
      console.error("[ai/repair/preview] unhandled preview failure", { code: result.code, workflowId: id });
    }
    return NextResponse.json(
      {
        ok: false,
        code: result.code,
        message: "Couldn't build a repair preview right now. Please try again.",
        errors: [{ stage: "model", code: result.code, message: "Repair preview unavailable." }],
      },
      { status },
    );
  }

  // Preview-only. `preview.ok === false` is a validation-blocked patch (carries
  // blockedReason) — a legitimate 200 outcome the UI renders as "couldn't build a
  // safe fix". `notAppliedNotice` is server-set + immutable.
  return NextResponse.json({
    ok: true,
    preview: result.preview,
    notAppliedNotice: REPAIR_PREVIEW_NOT_APPLIED_NOTICE,
  });
}
