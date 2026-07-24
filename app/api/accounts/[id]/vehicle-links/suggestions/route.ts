import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { isResourceLinksUiEnabled } from "@/services/resourceLinks/flags";
import {
  confirmSuggestion,
  type ConfirmSuggestionResult,
} from "@/services/resourceLinks/vehicleSuggestions";

/**
 * POST /api/accounts/[id]/vehicle-links/suggestions (5.TRUCK-BRIDGE-1 CS-5).
 *
 * Confirm ONE proposed Motive→Fleetio pairing (owner/admin). Thin: flag → auth →
 * role → service → HTTP. Every decision — re-deriving the evidence tier,
 * conflict handling, the row→view projection — lives in the service.
 *
 * There is deliberately no GET: the Suggested tab is computed by the server
 * component on page load, and each recomputation costs two provider list calls.
 * The client updates its own rows from these mutation responses instead.
 *
 * Flag OFF ⇒ 404 before the role gate, so a disabled surface cannot probe
 * membership or fleet contents.
 */

function notFound(): NextResponse {
  return NextResponse.json({ error: "not_found", code: "NOT_FOUND" }, { status: 404 });
}

function failure(result: Extract<ConfirmSuggestionResult, { ok: false }>): NextResponse {
  switch (result.reason) {
    case "not_member":
      return NextResponse.json(
        { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" },
        { status: 403 },
      );
    case "forbidden":
      return NextResponse.json(
        { error: "Only account owners and admins can confirm vehicle links.", code: "FORBIDDEN" },
        { status: 403 },
      );
    case "account_frozen":
      return NextResponse.json(
        { error: "This account is pending deletion.", code: "ACCOUNT_PENDING_DELETION" },
        { status: 403 },
      );
    case "invalid_input":
      return NextResponse.json(
        { error: "Choose both a Motive vehicle and a Fleetio vehicle.", code: "INVALID_INPUT" },
        { status: 400 },
      );
    case "source_already_linked":
      return NextResponse.json(
        {
          error: "That Motive vehicle is already linked to a Fleetio vehicle.",
          code: "SOURCE_ALREADY_LINKED",
        },
        { status: 409 },
      );
    case "target_already_linked":
      return NextResponse.json(
        {
          error: "That Fleetio vehicle is already linked to a different Motive vehicle.",
          code: "TARGET_ALREADY_LINKED",
        },
        { status: 409 },
      );
    case "conflict":
      return NextResponse.json(
        {
          error: "Someone changed this vehicle's link at the same time. Reload and try again.",
          code: "LINK_CONFLICT",
        },
        { status: 409 },
      );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isResourceLinksUiEnabled()) return notFound();

  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId } = await params;

  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin"]);
  if (!role.ok) {
    return NextResponse.json(
      role.reason === "not_member"
        ? { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" }
        : {
            error: "Only account owners and admins can confirm vehicle links.",
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

  const result = await confirmSuggestion({ accountId, actingUserId: auth.userId, body });
  if (!result.ok) return failure(result);
  return NextResponse.json({ link: result.link }, { status: 201 });
}
