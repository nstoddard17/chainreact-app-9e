import { NextResponse } from "next/server";
import { z } from "zod";
import { applyRepairPatch } from "@/services/ai/repair/applyRepairPatch";
import { repairPatchRef } from "@/services/ai/repair/repairPatchRef";
import type { PatchOperation } from "@/services/workflows/patch/types";
import { reactAgentService } from "@/services/ai/reactAgent";
import { reactAgentAuditRecorder } from "@/services/ai/reactAgent/audit";
import {
  assertWorkflowRunEditAllowed,
  loadWorkflowForMember,
  parseJsonBody,
  requireUser,
} from "@/app/api/workflows/_shared";

/**
 * POST /api/workflows/[id]/ai/repair/apply — AI-REPAIR-3D.
 *
 * The GUARDED persistence path a future AI-REPAIR-3 Apply UI will call. It is the
 * first AI-REPAIR endpoint that may WRITE — but only behind every 3A/3B/3C gate:
 * authenticate → authorize membership → authorize edit → load FRESH definition →
 * re-validate → `assessApplyReadiness` → `executeWorkflowPatch` (in memory) → persist
 * the DRAFT ONLY via the optimistic, account-scoped repository write. It does NOT run,
 * activate/deactivate, register triggers, mutate integrations/credentials, change
 * billing, call the LLM, or emit model-call telemetry. It is NOT wired into the
 * builder (no Apply button); it exists for tests + a future UI.
 *
 * Authorization: `requireUser` (401) → `loadWorkflowForMember` (no-leak 404 for
 * not-found AND non-member) → `assertWorkflowRunEditAllowed` (403 when a member may not
 * run/edit a private-credential workflow — the SAME edit gate the manual save uses).
 *
 * Status mapping: 401 unauth · 400 bad id / missing-or-untyped operations · 404
 * not-found/non-member · 403 not-editable · 409 STALE_PATCH (stale preview / changed /
 * optimistic conflict) · 422 NOT_APPLYABLE / EXECUTION_FAILED · 200 applied.
 *
 * No-leak: the response carries only `{ ok, applied, currentRevision, appliedOperations }`
 * (op kinds + graph ids + non-secret field keys) or a safe `{ ok:false, code, message,
 * blockedCategories? }`. It NEVER returns `updatedDefinition`, a config value, a
 * secret/credential key, an account role, a connector id, or a raw provider/DB error.
 */

const BodySchema = z.object({
  /** Typed patch operations. Array required (raw model text / a bare string → 400). */
  operations: z.array(z.unknown()),
  /** The revision the patch was built against. Absent → readiness blocks → 422. */
  baseRevision: z.string().optional(),
  /** The revision the user previewed against (defaults to baseRevision in the contract). */
  previewRevision: z.string().optional(),
  /** FUTURE: a recipient/destination change the user explicitly confirmed. */
  recipientChangeConfirmed: z.boolean().optional(),
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

  const parsed = await parseJsonBody(request, BodySchema);
  if (!parsed.ok) return parsed.response;

  // Membership (no-leak 404) → fresh record.
  const wf = await loadWorkflowForMember(id, auth.userId);
  if (!wf.ok) return wf.response;

  // Edit authorization — a member who may not run/edit a private-credential workflow
  // (WF-RUNPERM + connection-sharing) may not apply AI patches to it either.
  const editDenied = await assertWorkflowRunEditAllowed(wf.record, auth.userId);
  if (editDenied) return editDenied;

  // REACT-AGENT-CS-7D — run the ALREADY-authorized, ALREADY-validated deterministic apply
  // THROUGH the React Agent registry (capability `repair_apply`, mode `requires_approval`).
  // Auth, membership, the edit gate, request validation, and ALL patch safety
  // (validateWorkflowPatch → assessApplyReadiness → executeWorkflowPatch → optimistic
  // revision check) stay OWNED by `applyRepairPatch` / the route — the seam only validates
  // scope + capability + intent and emits ONE `react_agent.repair_apply` audit row
  // (success | failed). It adds NO model call, NO credit gate, and NO new apply behavior.
  // `proposedPatchRef` is the opaque CS-7b ref over the SAME { workflowId, baseRevision,
  // operations } the preview row used, so an apply correlates to its proposal. No raw
  // operations / config / patch body enters the audit (metadata-free at the seam).
  const baseRevision = parsed.data.baseRevision ?? null;
  const proposedPatchRef = baseRevision
    ? repairPatchRef({ workflowId: id, baseRevision, operations: parsed.data.operations as PatchOperation[] })
    : null;

  const outcome = await reactAgentService.runAuthorizedCapability({
    scope: { userId: auth.userId, accountId: wf.record.accountId, workflowId: id },
    intent: "apply_repair",
    capabilityId: "repair_apply",
    auditRecorder: reactAgentAuditRecorder,
    classifyResult: (r) => (r.ok ? "success" : "failed"),
    deriveProposedPatchRef: () => proposedPatchRef,
    exec: () =>
      applyRepairPatch({
        record: wf.record,
        workflowId: id,
        operations: parsed.data.operations,
        baseRevision: parsed.data.baseRevision ?? null,
        ...(parsed.data.previewRevision !== undefined ? { previewRevision: parsed.data.previewRevision } : {}),
        ...(parsed.data.recipientChangeConfirmed !== undefined
          ? { recipientChangeConfirmed: parsed.data.recipientChangeConfirmed }
          : {}),
      }),
  });
  if (!outcome.ok) {
    // Unreachable on the wired path (route guarantees a valid scope + the apply_repair
    // capability/intent). NOTHING applied; mapped to the route's existing NOT_APPLYABLE
    // failure shape so the response contract is unchanged.
    return NextResponse.json(
      { ok: false, applied: false, code: "NOT_APPLYABLE", message: "This change can't be applied." },
      { status: 422 },
    );
  }
  const result = outcome.result;

  if (result.ok) {
    return NextResponse.json({
      ok: true,
      applied: true,
      currentRevision: result.currentRevision,
      appliedOperations: result.appliedOperations,
    });
  }

  const status = result.code === "STALE_PATCH" ? 409 : 422;
  return NextResponse.json(
    {
      ok: false,
      applied: false,
      code: result.code,
      message: result.message,
      ...(result.blockedCategories ? { blockedCategories: result.blockedCategories } : {}),
    },
    { status },
  );
}
