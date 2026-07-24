import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { isResourceLinksUiEnabled } from "@/services/resourceLinks/flags";
import { archiveVehicleLink } from "@/services/resourceLinks/vehicleLinkService";

/**
 * DELETE /api/accounts/[id]/vehicle-links/[linkId] (5.TRUCK-BRIDGE-1 CS-4).
 *
 * Removes a vehicle link by ARCHIVING it (owner/admin). The row survives so a
 * historical run that used the link stays explainable, and because both unique
 * indexes are partial on `archived_at IS NULL`, the pair is immediately free to
 * be re-linked.
 *
 * A `linkId` belonging to another account, an already-archived link, and an id
 * that never existed all return the SAME 404. That is the point: the response
 * reveals nothing about another account's data — not the target, not the
 * labels, not even whether the id exists.
 *
 * Flag OFF ⇒ 404 before the role gate, so a disabled surface cannot probe
 * membership or link existence.
 */

function notFound(): NextResponse {
  return NextResponse.json({ error: "not_found", code: "NOT_FOUND" }, { status: 404 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; linkId: string }> },
): Promise<Response> {
  if (!isResourceLinksUiEnabled()) return notFound();

  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId, linkId } = await params;

  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin"]);
  if (!role.ok) {
    return NextResponse.json(
      role.reason === "not_member"
        ? { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" }
        : {
            error: "Only account owners and admins can change vehicle links.",
            code: "FORBIDDEN",
          },
      { status: 403 },
    );
  }

  const result = await archiveVehicleLink({
    accountId,
    actingUserId: auth.userId,
    linkId,
  });
  if (result.ok) return NextResponse.json({ archived: true });

  switch (result.reason) {
    case "account_frozen":
      return NextResponse.json(
        { error: "This account is pending deletion.", code: "ACCOUNT_PENDING_DELETION" },
        { status: 403 },
      );
    case "not_member":
    case "forbidden":
      return NextResponse.json(
        { error: "Only account owners and admins can change vehicle links.", code: "FORBIDDEN" },
        { status: 403 },
      );
    case "not_found":
      return notFound();
  }
}
