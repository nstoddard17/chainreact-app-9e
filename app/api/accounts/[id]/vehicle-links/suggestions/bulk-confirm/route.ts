import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { isResourceLinksUiEnabled } from "@/services/resourceLinks/flags";
import { bulkConfirmVinMatches } from "@/services/resourceLinks/vehicleSuggestions";

/**
 * POST /api/accounts/[id]/vehicle-links/suggestions/bulk-confirm (CS-5).
 *
 * Confirm every bulk-eligible EXACT-VIN match in one owner/admin action.
 *
 * Two independent gates, both default OFF:
 *   1. `ENABLE_RESOURCE_LINKS_UI` — the surface itself (404 when off).
 *   2. `ENABLE_VEHICLE_VIN_BULK_CONFIRM` — the multi-write shortcut. Off until
 *      a real Fleetio account has been observed populating `vin` on
 *      `GET /vehicles`; the development database has no connected Fleetio
 *      integration, so that premise is untested. Returns 403 `NOT_ENABLED`.
 *
 * Individual confirmation of a VIN-tier suggestion is unaffected by gate 2 — a
 * human reading one row's evidence and clicking is safe regardless of how
 * well-populated VIN is across the fleet.
 *
 * The body is empty on purpose: the server recomputes eligibility itself, so a
 * client cannot hand it a list of pairs to write.
 */
export async function POST(
  _request: Request,
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
            error: "Only account owners and admins can confirm vehicle links.",
            code: "FORBIDDEN",
          },
      { status: 403 },
    );
  }

  const result = await bulkConfirmVinMatches({ accountId, actingUserId: auth.userId });
  if (result.ok) {
    return NextResponse.json({ confirmed: result.confirmed, skipped: result.skipped });
  }

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
    case "not_enabled":
      return NextResponse.json(
        {
          error:
            "Confirming VIN matches in bulk isn't available yet. Confirm the matches you want one at a time.",
          code: "NOT_ENABLED",
        },
        { status: 403 },
      );
    case "unavailable":
      return NextResponse.json(
        {
          error: "Your vehicle lists couldn't be loaded, so nothing was confirmed. Try again.",
          code: "LISTS_UNAVAILABLE",
        },
        { status: 503 },
      );
  }
}
