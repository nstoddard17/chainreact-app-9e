import { NextResponse } from "next/server";
import { z } from "zod";
import { applyRepairPatch } from "@/services/ai/repair/applyRepairPatch";
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

  const result = await applyRepairPatch({
    record: wf.record,
    workflowId: id,
    operations: parsed.data.operations,
    baseRevision: parsed.data.baseRevision ?? null,
    ...(parsed.data.previewRevision !== undefined ? { previewRevision: parsed.data.previewRevision } : {}),
    ...(parsed.data.recipientChangeConfirmed !== undefined
      ? { recipientChangeConfirmed: parsed.data.recipientChangeConfirmed }
      : {}),
  });

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
