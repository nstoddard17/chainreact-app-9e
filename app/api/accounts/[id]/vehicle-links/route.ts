import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { isResourceLinksUiEnabled } from "@/services/resourceLinks/flags";
import {
  listVehicleLinks,
  createVehicleLink,
  type CreateVehicleLinkResult,
} from "@/services/resourceLinks/vehicleLinkService";

/**
 * /api/accounts/[id]/vehicle-links (5.TRUCK-BRIDGE-1 CS-4).
 *   GET  — this account's ACTIVE Motive→Fleetio vehicle links (any member).
 *   POST — confirm a manual pairing (owner/admin).
 *
 * Thin by contract (project-structure §5): flag → auth → account role → service
 * → HTTP. Every policy decision (owner/admin, freeze, source/target conflicts,
 * replacement, the row→view projection) lives in the service, and the service
 * re-checks the role itself, so this file owns nothing but transport.
 *
 * `accountId` comes from the PATH and is authorized by `requireAccountRole`
 * against the verified session user. It is never trusted as ownership on its
 * own — a caller naming another account's id gets the same 403 they would get
 * for any account they are not a member of, and the service's repository calls
 * carry a mandatory `account_id` predicate underneath that.
 *
 * Flag OFF ⇒ 404 for BOTH verbs, before the role gate — so a disabled surface
 * cannot be used to probe membership or link existence.
 *
 * No provider secret can appear in any response: the service returns the
 * `VehicleLinkView` projection (vehicle ids + display snapshots + one resolved
 * co-member label), and the backing table stores no credentials at all.
 */

function notFound(): NextResponse {
  return NextResponse.json({ error: "not_found", code: "NOT_FOUND" }, { status: 404 });
}

function roleGateFailure(reason: "not_member" | "forbidden"): NextResponse {
  return NextResponse.json(
    reason === "not_member"
      ? { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" }
      : { error: "Only account owners and admins can change vehicle links.", code: "FORBIDDEN" },
    { status: 403 },
  );
}

function createFailure(result: Extract<CreateVehicleLinkResult, { ok: false }>): NextResponse {
  switch (result.reason) {
    case "not_member":
    case "forbidden":
      return roleGateFailure(result.reason);
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
          conflict: result.conflict ?? null,
        },
        { status: 409 },
      );
    case "target_already_linked":
      return NextResponse.json(
        {
          error: "That Fleetio vehicle is already linked to a different Motive vehicle.",
          code: "TARGET_ALREADY_LINKED",
          conflict: result.conflict ?? null,
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isResourceLinksUiEnabled()) return notFound();

  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId } = await params;

  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin", "member"]);
  if (!role.ok) return roleGateFailure(role.reason);

  const result = await listVehicleLinks({ accountId, actingUserId: auth.userId });
  if (!result.ok) return roleGateFailure("not_member");

  // `canManage` drives the UI's affordances; the server re-checks on every
  // mutation regardless, so a tampered client gains nothing.
  return NextResponse.json({
    links: result.links,
    canManage: role.role === "owner" || role.role === "admin",
  });
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
  if (!role.ok) return roleGateFailure(role.reason);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body.", code: "INVALID_INPUT" },
      { status: 400 },
    );
  }

  const result = await createVehicleLink({ accountId, actingUserId: auth.userId, body });
  if (!result.ok) return createFailure(result);
  return NextResponse.json({ link: result.link }, { status: 201 });
}
