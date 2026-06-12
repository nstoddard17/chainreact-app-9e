import { NextResponse } from "next/server";
import type { MembershipRole } from "@/contracts/accounts";
import * as workflowsRepo from "@/repositories/workflows";
import {
  requireUser,
  requireWorkflowAccountMember,
  workflowNotFoundResponse,
} from "@/app/api/workflows/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import type { ConnectorBindingReason } from "@/services/integrations/connectionBinding";

/**
 * Shared auth + error mapping for the node connector-binding routes
 * (Slice 4.CONN-SHARE / CS-4a). Mirrors the credential-owner route `_shared.ts`.
 *
 * `resolveCaller` authenticates, loads the workflow, and authorizes the caller as
 * a MEMBER of the workflow's account — a non-member, a missing/deleted workflow,
 * and an unauthenticated caller all collapse to the SAME 404 (no existence leak).
 * It also resolves the caller's role for the service's editor gate.
 *
 * No response ever carries a token, provider account label, email, scope, or
 * account metadata — only `{ ok }` / safe display views or a typed error code.
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

  const role = await requireAccountRole(auth.userId, record.accountId, ["owner", "admin", "member"]);
  if (!role.ok) return { ok: false, response: workflowNotFoundResponse() };

  return { ok: true, caller: { userId: auth.userId, accountId: record.accountId, role: role.role } };
}

function json(error: string, code: string, status: number): NextResponse {
  return NextResponse.json({ error, code }, { status });
}

export function connectorBindingErrorResponse(reason: ConnectorBindingReason): NextResponse {
  switch (reason) {
    case "not_enabled":
      // Hide the endpoint when the feature is off — same 404 shape as a missing
      // workflow, so flag state is not an existence oracle.
      return workflowNotFoundResponse();
    case "workflow_not_found":
      return workflowNotFoundResponse();
    case "node_not_found":
      return json("That step is not part of this workflow.", "NODE_NOT_FOUND", 404);
    case "not_applicable":
      return json(
        "This step uses a shared team connection — it can't be bound to a connector.",
        "NOT_APPLICABLE",
        400,
      );
    case "account_frozen":
      return json("This account is pending deletion.", "ACCOUNT_PENDING_DELETION", 403);
    case "forbidden":
      return json("You don't have permission to do that.", "FORBIDDEN", 403);
    case "connector_not_member":
      return json("That member is not part of this account.", "CONNECTOR_NOT_MEMBER", 400);
    case "connector_not_connected":
      return json("That member hasn't connected this app yet.", "CONNECTOR_NOT_CONNECTED", 400);
    case "connector_not_shared":
      return json(
        "That member hasn't shared this connection with the team.",
        "CONNECTOR_NOT_SHARED",
        400,
      );
  }
}
