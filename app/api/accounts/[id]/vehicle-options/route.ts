import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { isResourceLinksUiEnabled } from "@/services/resourceLinks/flags";
import {
  isVehicleOptionSide,
  listVehicleOptions,
} from "@/services/resourceLinks/vehicleOptions";

/**
 * GET /api/accounts/[id]/vehicle-options?provider=motive|fleetio&q= (CS-4).
 *
 * Backs the Vehicle Links screen's two pickers with ONE bounded page of the
 * ACCOUNT's vehicles. Read-only.
 *
 * Why not `/api/options/[source]`: that endpoint resolves an integration
 * through the workflow-keyed credential decision and, with no `workflowId`,
 * falls back to the caller's PERSONAL account. This screen needs the caller's
 * ACTIVE account. The service dispatches the EXISTING, unmodified
 * `motive:vehicles` / `fleetio:vehicles` resolvers — no resolver is added or
 * changed, and `OptionsResolverContext` is untouched (plan Q3).
 *
 * `provider` is validated against a two-value allow-list, so this is not a
 * generic resolver proxy — an arbitrary `<provider>:<resource>` source cannot
 * be reached through it.
 *
 * Any member may read (the same people who may view the links). The response
 * carries only `{ status, items, hasMore }`; a provider failure collapses to
 * `status: "error"` with no message, so no provider host, status code, or body
 * reaches the browser, and no credential is ever serialized.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isResourceLinksUiEnabled()) {
    return NextResponse.json({ error: "not_found", code: "NOT_FOUND" }, { status: 404 });
  }

  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId } = await params;

  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin", "member"]);
  if (!role.ok) {
    return NextResponse.json(
      { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const side = url.searchParams.get("provider") ?? "";
  if (!isVehicleOptionSide(side)) {
    return NextResponse.json(
      { error: "Unknown vehicle source.", code: "INVALID_PROVIDER" },
      { status: 400 },
    );
  }

  const result = await listVehicleOptions({
    accountId,
    userId: auth.userId,
    side,
    q: url.searchParams.get("q") ?? "",
  });
  return NextResponse.json(result);
}
