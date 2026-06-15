import { NextResponse } from "next/server";
import { z } from "zod";
import { assessRepairApplyReadiness } from "@/services/ai/repair/assessRepairApplyReadiness";
import {
  loadWorkflowForMember,
  parseJsonBody,
  requireUser,
} from "@/app/api/workflows/_shared";

/**
 * POST /api/workflows/[id]/ai/repair/apply-readiness — AI-REPAIR-3B.
 *
 * DRY-RUN readiness endpoint ONLY — the server-side skeleton a future AI-REPAIR-3
 * Apply UI will call. It proves the backend apply path: (1) authenticate the user,
 * (2) authorize workflow access, (3) load the FRESH workflow definition, (4) re-run
 * deterministic patch validation against it, (5) run `assessApplyReadiness`, and
 * (6) reject unsafe/stale/blocked patches with user-safe reasons — WITHOUT writing
 * anything.
 *
 * It does NOT persist, save, mutate `draftDefinition`, run, or activate/deactivate a
 * workflow — neither the route nor `assessRepairApplyReadiness` imports any such path.
 * It is NOT wired into the builder UI (no Apply button); it exists for tests + a
 * future UI. A blocked/unsafe/stale patch returns 200 with `applyable:false` + safe
 * block reasons (the readiness verdict IS the answer); HTTP errors are reserved for
 * auth (401), authorization / not-found (404), and malformed requests (400).
 *
 * No-leak: the response carries only `{ applyable, readiness, currentRevision }` —
 * operation kinds + safe block codes/messages + the public `updatedAt` token. Raw
 * validation errors, config values, secret/credential keys, tokens, account roles,
 * connector ids, and provider errors never appear.
 */

const BodySchema = z.object({
  /** Typed patch operations. Array required (raw model text / a bare string → 400). */
  operations: z.array(z.unknown()),
  /** The revision the patch was built against. Absent → readiness blocks MISSING_BASE_REVISION. */
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

  // Workflow-owning account + membership (no-leak 404). Loads the FRESH record.
  const wf = await loadWorkflowForMember(id, auth.userId);
  if (!wf.ok) return wf.response;

  const { readiness, currentRevision } = assessRepairApplyReadiness({
    record: wf.record,
    workflowId: id,
    operations: parsed.data.operations,
    baseRevision: parsed.data.baseRevision ?? null,
    ...(parsed.data.previewRevision !== undefined ? { previewRevision: parsed.data.previewRevision } : {}),
    ...(parsed.data.recipientChangeConfirmed !== undefined
      ? { recipientChangeConfirmed: parsed.data.recipientChangeConfirmed }
      : {}),
  });

  return NextResponse.json({
    ok: true,
    mode: "dry-run",
    applyable: readiness.applyable,
    readiness,
    currentRevision,
  });
}
