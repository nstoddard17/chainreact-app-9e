import type { NextRequest } from "next/server";
import { MobileWorkflowDetailSchema } from "@chainreact/mobile-contracts";
import {
  requireMobileUser,
  requireMobileAccountMember,
  mobileNotFoundResponse,
  sendMobileJson,
} from "../../../../_shared";
import { getMobileWorkflowDetail } from "@/services/mobile/workflows";

/**
 * GET /api/mobile/v1/accounts/{accountId}/workflows/{workflowId} —
 * LIGHTWEIGHT detail (MOBILE-COMPANION-M1-MOBILE-READ-API-1): summary + node
 * labeling only. The graph (draftDefinition/edges/config) never crosses; the
 * strict contract rejects it structurally. Missing / deleted / cross-account
 * → the same 404.
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

  const detail = await getMobileWorkflowDetail(scope.account.accountId, workflowId);
  if (detail === null) return mobileNotFoundResponse("WORKFLOW_NOT_FOUND");
  return sendMobileJson(MobileWorkflowDetailSchema, detail);
}
