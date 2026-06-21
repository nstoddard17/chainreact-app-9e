import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { revokeMcpToken } from "@/services/mcp/tokens";

/**
 * DELETE /api/accounts/[id]/mcp-tokens/[tokenId] (Slice 4.PUBLIC-MCP-9).
 *
 * Soft-revoke an MCP token (owner/admin). Account-scoped + idempotent: a token id
 * that does not belong to this account returns the SAME 404 as a nonexistent one
 * (no cross-account existence leak); an already-revoked token returns 200
 * (idempotent). Refuses on a frozen / pending-deletion account. No `token_hash` or
 * raw token is ever returned. A revoked token stops authenticating at the public
 * MCP endpoint immediately (the verify prefix lookup filters `revoked_at IS NULL`).
 */

function roleGateFailure(reason: "not_member" | "forbidden"): NextResponse {
  return NextResponse.json(
    reason === "not_member"
      ? { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" }
      : { error: "Insufficient permissions.", code: "FORBIDDEN" },
    { status: 403 },
  );
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; tokenId: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId, tokenId } = await params;

  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin"]);
  if (!role.ok) return roleGateFailure(role.reason);

  const result = await revokeMcpToken({ accountId, tokenId });
  if (!result.ok) {
    if (result.reason === "account_frozen") {
      return NextResponse.json(
        { error: "This account is pending deletion.", code: "ACCOUNT_PENDING_DELETION" },
        { status: 403 },
      );
    }
    // not_found — same response for cross-account + nonexistent (no leak).
    return NextResponse.json(
      { error: "No such MCP token.", code: "MCP_TOKEN_NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, alreadyRevoked: result.alreadyRevoked });
}
