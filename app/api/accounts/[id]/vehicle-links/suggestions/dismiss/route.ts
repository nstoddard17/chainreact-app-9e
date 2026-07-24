import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { isResourceLinksUiEnabled } from "@/services/resourceLinks/flags";
import { dismissSuggestion } from "@/services/resourceLinks/vehicleSuggestions";

/**
 * POST /api/accounts/[id]/vehicle-links/suggestions/dismiss (CS-5).
 *
 * Record that a human REJECTED a proposed pairing (owner/admin), so it stops
 * coming back on every page load. A dismissal is never stored as a link — it
 * lands in `account_resource_link_dismissals` and is read only by the Suggested
 * tab; nothing on the execution path can see it.
 *
 * The body carries the evidence fingerprint the user actually saw, so the
 * dismissal pins the CLAIM rather than just the pair: if the reason for the
 * suggestion later changes materially, it legitimately returns.
 *
 * Flag OFF ⇒ 404 before the role gate.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isResourceLinksUiEnabled()) {
    return NextResponse.json({ error: "not_found", code: "NOT_FOUND" }, { status: 404 });
  }

  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId } = await params;

  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin"]);
  if (!role.ok) {
    return NextResponse.json(
      role.reason === "not_member"
        ? { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" }
        : {
            error: "Only account owners and admins can dismiss suggestions.",
            code: "FORBIDDEN",
          },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body.", code: "INVALID_INPUT" },
      { status: 400 },
    );
  }

  const result = await dismissSuggestion({ accountId, actingUserId: auth.userId, body });
  if (result.ok) return NextResponse.json({ dismissed: true });

  switch (result.reason) {
    case "not_member":
      return NextResponse.json(
        { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" },
        { status: 403 },
      );
    case "forbidden":
      return NextResponse.json(
        { error: "Only account owners and admins can dismiss suggestions.", code: "FORBIDDEN" },
        { status: 403 },
      );
    case "account_frozen":
      return NextResponse.json(
        { error: "This account is pending deletion.", code: "ACCOUNT_PENDING_DELETION" },
        { status: 403 },
      );
    case "invalid_input":
      return NextResponse.json(
        { error: "That suggestion could not be dismissed.", code: "INVALID_INPUT" },
        { status: 400 },
      );
  }
}
