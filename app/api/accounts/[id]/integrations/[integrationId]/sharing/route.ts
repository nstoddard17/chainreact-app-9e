import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { setIntegrationSharingScope } from "@/services/integrations/connectionSharing";
import { INTEGRATION_SHARING_SCOPE_VALUES } from "@/core/integrations/sharingScope";
import { sharingFailureResponse } from "./_shared";

/**
 * POST /api/accounts/[id]/integrations/[integrationId]/sharing
 * (Slice 4.CONN-SHARE / CS-2)
 *
 * Sets the explicit sharing scope of ONE personal connection. Thin: authenticate
 * the session → validate the requested scope → call the service → map typed
 * failures. The service (`setIntegrationSharingScope`) is the single
 * authorization chokepoint (flag → frozen → exact (account, id) row scope →
 * membership → disconnected guard → provider class → connector/admin authz) and
 * the only writer of `integration_sharing_scope`. The route never touches a
 * service-role client and never sees a token, provider account id, or raw error.
 *
 * Request body: `{ scope: "private_to_connector" | "shared_with_account" }`. The
 * account id + integration id come from the path; the caller id comes from the
 * verified session — never from request input — so a caller can only act as
 * themselves.
 *
 * No-leak: not_enabled / not_found / cross-account / non-member / disconnected
 * all collapse to a generic typed code; the success body is only
 * `{ scope, shared, changed }` (a safe enum + booleans).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; integrationId: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;

  // Validate the requested scope BEFORE any service call — reject anything that
  // is not one of the two known values with a generic 400 (no enumeration hint).
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const scope = (body as { scope?: unknown } | null)?.scope;
  if (
    typeof scope !== "string" ||
    !(INTEGRATION_SHARING_SCOPE_VALUES as readonly string[]).includes(scope)
  ) {
    return NextResponse.json(
      { error: "Invalid sharing scope.", code: "INVALID_SHARING_SCOPE" },
      { status: 400 },
    );
  }

  const { id: accountId, integrationId } = await params;
  const result = await setIntegrationSharingScope({
    accountId,
    integrationId,
    callerUserId: auth.userId,
    scope: scope as (typeof INTEGRATION_SHARING_SCOPE_VALUES)[number],
  });
  if (!result.ok) return sharingFailureResponse(result.reason);

  return NextResponse.json({
    scope: result.scope,
    shared: result.scope === "shared_with_account",
    changed: result.changed,
  });
}
