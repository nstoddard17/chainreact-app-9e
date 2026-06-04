import { NextResponse } from "next/server";
import * as accountsRepo from "@/repositories/accounts";
import {
  CreateFolderRequestSchema,
  ReorderFoldersRequestSchema,
} from "@/contracts/folders";
import {
  createFolder,
  listFolders,
  reorderFolders,
} from "@/services/workflowFolders/folderService";
import {
  folderErrorResponse,
  parseJsonBody,
  requireUserWithAccount,
  toWorkflowFolder,
} from "./_shared";

/**
 * GET   /api/folders        — list the active account's live folders.
 * POST  /api/folders        — create a folder in the active account.
 * PATCH /api/folders        — reorder a sibling group (last-write-wins).
 *
 * Account-scoped via requireUserWithAccount. Membership-based authorization —
 * roles do NOT gate folders (locked decision). Thin handlers per
 * project-structure-and-module-boundaries.md §5.
 */

export async function GET() {
  const auth = await requireUserWithAccount();
  if (!auth.ok) return auth.response;

  const folders = await listFolders(auth.accountId);
  return NextResponse.json({ folders: folders.map(toWorkflowFolder) });
}

export async function POST(request: Request) {
  const auth = await requireUserWithAccount();
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody(request, CreateFolderRequestSchema);
  if (!parsed.ok) return parsed.response;

  // Tier limit needs the account type (RLS-readable by members).
  const account = await accountsRepo.getById(auth.accountId);
  if (!account) {
    return NextResponse.json({ error: "Account not found.", code: "ACCOUNT_NOT_FOUND" }, { status: 404 });
  }

  const result = await createFolder({
    accountId: auth.accountId,
    accountType: account.type,
    userId: auth.userId,
    name: parsed.data.name,
    parentFolderId: parsed.data.parentFolderId ?? null,
  });
  if (!result.ok) return folderErrorResponse(result);
  return NextResponse.json(toWorkflowFolder(result.data), { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireUserWithAccount();
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody(request, ReorderFoldersRequestSchema);
  if (!parsed.ok) return parsed.response;

  const result = await reorderFolders({
    accountId: auth.accountId,
    parentFolderId: parsed.data.parentFolderId,
    orderedIds: parsed.data.orderedIds,
  });
  if (!result.ok) return folderErrorResponse(result);
  return NextResponse.json({ ok: true, count: result.data.count });
}
