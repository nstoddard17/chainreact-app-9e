import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import * as workflowsRepo from "@/repositories/workflows";
import { buildAccountWorkflowsExport } from "@/services/workflows/exportWorkflow";

/**
 * GET /api/accounts/[id]/workflows/export (Slice 4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-4 /
 * CS-BD-4B).
 *
 * Returns a CREDENTIAL-FREE JSON snapshot of ALL active (non-deleted) workflows in an account, so
 * a Business owner can save their work before a destructive Business → Team downgrade (import is a
 * separate, not-yet-built slice; this is not wired to the downgrade UI yet).
 *
 * Authorization mirrors GET /api/accounts/[id]/members — any account member may read (owner /
 * admin / member); a non-member (or a missing account) collapses to 403 NOT_ACCOUNT_MEMBER (no
 * existence oracle). Read-only. `listByAccount` is the session (RLS) client + excludes soft-deleted
 * rows, so the export is doubly scoped to the caller's account and never includes trashed workflows.
 *
 * Every workflow is run through the same sanitizer as the single-workflow export — no tokens,
 * secrets, provider account labels/emails, credential-owner ids, integration ids, Stripe ids, or
 * user ids ever appear. Folder hierarchy is omitted (downgrade flattens it). Over the per-export
 * cap it returns a typed 413 telling the user to export individually. Served as a JSON attachment.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId } = await params;

  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin", "member"]);
  if (!role.ok) {
    return NextResponse.json(
      { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" },
      { status: 403 },
    );
  }

  const records = await workflowsRepo.listByAccount(accountId); // excludes soft-deleted
  const built = buildAccountWorkflowsExport(accountId, records, new Date().toISOString());
  if (!built.ok) {
    return NextResponse.json(
      {
        error: "Too many workflows to export at once. Export workflows individually instead.",
        code: "TOO_MANY_WORKFLOWS",
        count: built.count,
        limit: built.limit,
      },
      { status: 413 },
    );
  }

  const filename = `chainreact-workflows-${accountId}.json`;
  return NextResponse.json(built.export, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
