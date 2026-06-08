import { NextResponse } from "next/server";
import * as workflowsRepo from "@/repositories/workflows";
import { buildWorkflowExport } from "@/services/workflows/exportWorkflow";
import {
  requireUser,
  requireWorkflowAccountMember,
  workflowNotFoundResponse,
} from "../../_shared";

/**
 * GET /api/workflows/[id]/export (Slice 4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-3 / CS-BD-4A).
 *
 * Returns a CREDENTIAL-FREE JSON snapshot of a single workflow's graph so a member can save their
 * work (e.g. before a destructive Business → Team downgrade) and re-import it later (import is a
 * separate, not-yet-built slice). Mirrors the GET /api/workflows/[id] authorization exactly:
 *   - auth → 401;
 *   - account membership (workflow's own account) → non-member collapses to 404 (no existence leak);
 *   - soft-deleted workflow → 404 (same hidden-marker rule as the detail route).
 *
 * The payload is built from the workflow NAME + the SANITIZED definition only (see
 * services/workflows/exportWorkflow.ts) — no tokens, secrets, provider account labels/emails,
 * credential-owner ids, integration ids, Stripe ids, or user ids ever appear. Served as a JSON
 * attachment download.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const record = await workflowsRepo.getById(id);
  if (!record || record.state === "deleted") {
    return workflowNotFoundResponse();
  }
  const authorized = await requireWorkflowAccountMember(auth.userId, record.accountId);
  if (!authorized.ok) return authorized.response;

  const exported = buildWorkflowExport(record, new Date().toISOString());
  const filename = `workflow-${record.id}.json`;
  return NextResponse.json(exported, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
