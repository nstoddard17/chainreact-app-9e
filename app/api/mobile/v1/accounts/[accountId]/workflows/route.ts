import type { NextRequest } from "next/server";
import {
  MobileWorkflowListResponseSchema,
} from "@chainreact/mobile-contracts";
import { WorkflowStateSchema } from "@/contracts/workflow";
import {
  requireMobileUser,
  requireMobileAccountMember,
  mobileErrorResponse,
  sendMobileJson,
} from "../../../_shared";
import {
  listMobileWorkflows,
  InvalidMobileCursorError,
} from "@/services/mobile/workflows";

/**
 * GET /api/mobile/v1/accounts/{accountId}/workflows — cursor-paginated
 * mobile workflow summaries (MOBILE-COMPANION-M1-MOBILE-READ-API-1).
 * Query: `cursor`, `limit` (clamped 1–50, default 25), `state` (exact enum).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ accountId: string }> },
) {
  const gate = await requireMobileUser(request);
  if (!gate.ok) return gate.response;
  const { accountId } = await context.params;
  const scope = await requireMobileAccountMember(gate.user.userId, accountId);
  if (!scope.ok) return scope.response;

  const url = request.nextUrl;
  const rawState = url.searchParams.get("state");
  const state = rawState === null ? undefined : WorkflowStateSchema.safeParse(rawState);
  if (state !== undefined && !state.success) {
    return mobileErrorResponse(400, "BAD_REQUEST", "Unknown workflow state filter.");
  }
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? undefined : Number(rawLimit);

  try {
    const page = await listMobileWorkflows(scope.account.accountId, {
      limit,
      cursor: url.searchParams.get("cursor") ?? undefined,
      state: state?.data,
    });
    return sendMobileJson(MobileWorkflowListResponseSchema, page);
  } catch (err) {
    if (err instanceof InvalidMobileCursorError) {
      return mobileErrorResponse(400, "INVALID_CURSOR", "Invalid cursor.");
    }
    throw err;
  }
}
