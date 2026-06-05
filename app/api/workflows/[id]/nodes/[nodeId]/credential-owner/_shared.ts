import { NextResponse } from "next/server";
import type { MembershipRole } from "@/contracts/accounts";
import * as workflowsRepo from "@/repositories/workflows";
import {
  requireUser,
  requireWorkflowAccountMember,
  workflowNotFoundResponse,
} from "@/app/api/workflows/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import type { ReassignmentReason } from "@/services/teamCredentials/reassignmentService";

/**
 * Shared auth + error mapping for the per-node credential-owner routes
 * (4.TEAM-WORKFLOWS-CREDENTIAL-SHARING-4 / CS-3).
 *
 * `resolveCaller` authenticates, loads the workflow by id, and authorizes the
 * caller as a MEMBER of the workflow's account (TW-1 pattern — a non-member, a
 * missing/deleted workflow, and an unauthenticated caller all collapse to the
 * SAME 404, never leaking that the workflow exists). It also resolves the
 * caller's role so the service can apply the owner/admin-or-creator rules.
 *
 * No response from these routes ever carries a token, provider account label, or
 * email — only `{ ok, status }` or a typed error code.
 */

export interface ResolvedCaller {
  userId: string;
  accountId: string;
  role: MembershipRole;
}

export async function resolveCaller(
  workflowId: string,
): Promise<{ ok: true; caller: ResolvedCaller } | { ok: false; response: NextResponse }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, response: auth.response };

  const record = await workflowsRepo.getById(workflowId);
  if (!record || record.state === "deleted") {
    return { ok: false, response: workflowNotFoundResponse() };
  }

  const member = await requireWorkflowAccountMember(auth.userId, record.accountId);
  if (!member.ok) return { ok: false, response: member.response };

  const role = await requireAccountRole(auth.userId, record.accountId, [
    "owner",
    "admin",
    "member",
  ]);
  // role.ok implies membership; the only failure here would race the membership
  // check above — collapse to the same 404 (never reveal the workflow).
  if (!role.ok) return { ok: false, response: workflowNotFoundResponse() };

  return { ok: true, caller: { userId: auth.userId, accountId: record.accountId, role: role.role } };
}

function json(error: string, code: string, status: number): NextResponse {
  return NextResponse.json({ error, code }, { status });
}

export function reassignmentErrorResponse(reason: ReassignmentReason): NextResponse {
  switch (reason) {
    case "feature_disabled":
      // Hide the endpoint when the feature is off — same 404 shape as a missing
      // workflow, so flag state is not an existence oracle.
      return workflowNotFoundResponse();
    case "workflow_not_found":
      return workflowNotFoundResponse();
    case "node_not_found":
      return json("That step is not part of this workflow.", "NODE_NOT_FOUND", 404);
    case "not_applicable":
      return json(
        "This step uses a shared team connection — it can't be reassigned.",
        "NOT_APPLICABLE",
        400,
      );
    case "forbidden":
      return json("You don't have permission to do that.", "FORBIDDEN", 403);
    case "target_not_member":
      return json("That member is not part of this account.", "TARGET_NOT_MEMBER", 400);
    case "target_not_connected":
      return json("That member hasn't connected this app yet.", "TARGET_NOT_CONNECTED", 400);
    case "no_op":
      return json("That member already runs this step.", "NO_OP", 409);
    case "duplicate":
      return json(
        "This step already has a pending or active reassignment.",
        "DUPLICATE_REASSIGNMENT",
        409,
      );
    case "grant_not_found":
      return json("No reassignment was found for this step.", "GRANT_NOT_FOUND", 404);
    case "not_target":
      return json("Only the assigned member can respond to this request.", "NOT_TARGET", 403);
    case "account_frozen":
      return json("This account is pending deletion.", "ACCOUNT_PENDING_DELETION", 403);
  }
}
