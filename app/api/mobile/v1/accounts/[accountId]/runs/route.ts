import type { NextRequest } from "next/server";
import {
  MobileRunListResponseSchema,
  MobileRunStatusSchema,
} from "@chainreact/mobile-contracts";
import {
  requireMobileUser,
  requireMobileAccountMember,
  mobileErrorResponse,
  sendMobileJson,
} from "../../../_shared";
import { listMobileRuns } from "@/services/mobile/runs";
import { InvalidMobileCursorError } from "@/services/mobile/workflows";

/**
 * GET /api/mobile/v1/accounts/{accountId}/runs — account-wide run feed
 * (MOBILE-COMPANION-M1-MOBILE-READ-API-1). EXPLICIT account scope — never
 * personal-pinned. Includes queued/running. Query: `cursor`, `limit`
 * (clamped 1–100, default 25), `status`, `workflowId`.
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
      workflowId: url.searchParams.get("workflowId") ?? undefined,
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
