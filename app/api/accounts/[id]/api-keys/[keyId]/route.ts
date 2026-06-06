import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { revokeApiKey } from "@/services/apiKeys/management";

/**
 * DELETE /api/accounts/[id]/api-keys/[keyId] (Slice 4.API-KEYS-FOUNDATION-3 / FK-2).
 *
 * Soft-revoke a key (owner/admin). Account-scoped + idempotent: a key id that does
 * not belong to this account returns the SAME 404 as a nonexistent one (no
 * cross-account existence leak); an already-revoked key returns 200 (idempotent).
 * Refuses on a frozen / pending-deletion account. No `key_hash` or raw key is ever
 * returned. No OAuth/integration token is touched.
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
  { params }: { params: Promise<{ id: string; keyId: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId, keyId } = await params;

  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin"]);
  if (!role.ok) return roleGateFailure(role.reason);

  const result = await revokeApiKey({ accountId, keyId });
  if (!result.ok) {
    if (result.reason === "account_frozen") {
      return NextResponse.json(
        { error: "This account is pending deletion.", code: "ACCOUNT_PENDING_DELETION" },
        { status: 403 },
      );
    }
    // not_found — same response for cross-account + nonexistent (no leak).
    return NextResponse.json(
      { error: "No such API key.", code: "API_KEY_NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, alreadyRevoked: result.alreadyRevoked });
}
