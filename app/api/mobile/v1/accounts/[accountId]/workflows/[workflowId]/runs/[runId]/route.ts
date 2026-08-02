import type { NextRequest } from "next/server";
import { MobileRunDetailSchema } from "@chainreact/mobile-contracts";
import {
  requireMobileUser,
  requireMobileAccountMember,
  mobileNotFoundResponse,
  sendMobileJson,
} from "../../../../../../_shared";
import { verifyWorkflowInAccount, getMobileRunDetail } from "@/services/mobile/runs";

/**
 * GET /api/mobile/v1/accounts/{accountId}/workflows/{workflowId}/runs/{runId}
 * — redacted run detail, ANY status (MOBILE-COMPANION-M1-MOBILE-READ-API-1).
 * A queued/running run id (e.g. from a future run-now) is fetchable
 * immediately. STRICTER than web: step outputs never appear — not even the
 * requester's own test runs; trigger events / fatal errors were never even
 * selected from the database. Missing / cross-account / cross-workflow runs
 * collapse to one 404.
 */
export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ accountId: string; workflowId: string; runId: string }>;
  },
) {
  const gate = await requireMobileUser(request);
  if (!gate.ok) return gate.response;
  const { accountId, workflowId, runId } = await context.params;
  const scope = await requireMobileAccountMember(gate.user.userId, accountId);
  if (!scope.ok) return scope.response;

  const workflow = await verifyWorkflowInAccount(scope.account.accountId, workflowId);
  if (workflow === null) return mobileNotFoundResponse("WORKFLOW_NOT_FOUND");

  const detail = await getMobileRunDetail(scope.account.accountId, workflow, runId);
  if (detail === null) return mobileNotFoundResponse("WORKFLOW_NOT_FOUND");
  return sendMobileJson(MobileRunDetailSchema, detail);
}
