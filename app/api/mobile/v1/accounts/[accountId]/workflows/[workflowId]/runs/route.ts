import type { NextRequest } from "next/server";
import {
  MobileRunListResponseSchema,
  MobileRunStatusSchema,
} from "@chainreact/mobile-contracts";
import {
  requireMobileUser,
  requireMobileAccountMember,
  mobileNotFoundResponse,
  mobileErrorResponse,
  sendMobileJson,
} from "../../../../../_shared";
import { listMobileRuns, verifyWorkflowInAccount } from "@/services/mobile/runs";
import { InvalidMobileCursorError } from "@/services/mobile/workflows";

/**
 * GET /api/mobile/v1/accounts/{accountId}/workflows/{workflowId}/runs —
 * per-workflow run history (MOBILE-COMPANION-M1-MOBILE-READ-API-1). Verifies
 * account membership AND workflow-in-account before reading; includes
 * queued/running. Same summary vocabulary + cursor as the account feed.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ accountId: string; workflowId: string }> },
) {
  const gate = await requireMobileUser(request);
  if (!gate.ok) return gate.response;
  const { accountId, workflowId } = await context.params;
  const scope = await requireMobileAccountMember(gate.user.userId, accountId);
  if (!scope.ok) return scope.response;

  const workflow = await verifyWorkflowInAccount(scope.account.accountId, workflowId);
  if (workflow === null) return mobileNotFoundResponse("WORKFLOW_NOT_FOUND");

  const url = request.nextUrl;
  const rawStatus = url.searchParams.get("status");
  const status = rawStatus === null ? undefined : MobileRunStatusSchema.safeParse(rawStatus);
  if (status !== undefined && !status.success) {
    return mobileErrorResponse(400, "BAD_REQUEST", "Unknown run status filter.");
  }
  const rawLimit = url.searchParams.get("limit");

  try {
    const page = await listMobileRuns(scope.account.accountId, {
      limit: rawLimit === null ? undefined : Number(rawLimit),
      cursor: url.searchParams.get("cursor") ?? undefined,
      workflowId: workflow.id,
      status: status?.data,
    });
    return sendMobileJson(MobileRunListResponseSchema, page);
  } catch (err) {
    if (err instanceof InvalidMobileCursorError) {
      return mobileErrorResponse(400, "INVALID_CURSOR", "Invalid cursor.");
    }
    throw err;
  }
}
