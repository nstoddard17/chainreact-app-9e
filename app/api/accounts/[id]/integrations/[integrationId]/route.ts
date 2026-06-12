import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { disconnectIntegration } from "@/services/integrations/disconnect";
import { isIntegrationDisconnectEnabled } from "@/services/integrations/disconnectFlags";
import { disconnectFailureResponse, notFoundResponse } from "./_shared";

/**
 * DELETE /api/accounts/[id]/integrations/[integrationId]
 * (Slice 4.APPS-DISCONNECT / CD-2)
 *
 * Disconnects ONE active integration row. Thin: flag-gate → authenticate the
 * session → call the service → map typed failures. The service
 * (`disconnectIntegration`) is the single authorization chokepoint (frozen →
 * exact (account, id) row scope → account-role + provenance) and owns the
 * soft-disconnect + cascade + best-effort revoke. The route never touches a
 * service-role client and never sees a token or a raw provider error.
 *
 * Feature flag: OFF ⇒ a generic 404 BEFORE any auth or service work, so the
 * endpoint exposes no production behavior (and reveals nothing) while dark.
 *
 * No-leak: non-member / cross-account / unknown id all collapse to the service's
 * `not_found` ⇒ a single 404 INTEGRATION_NOT_FOUND. Provider revoke failure does
 * NOT fail the request — the local disconnect already succeeded; `providerRevoked`
 * simply reports false.
 *
 * Response (200): `{ disconnected, alreadyDisconnected, providerRevoked, workflowsDisabled }`.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; integrationId: string }> },
): Promise<Response> {
  if (!isIntegrationDisconnectEnabled()) return notFoundResponse();

  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;

  const { id: accountId, integrationId } = await params;
  const result = await disconnectIntegration({
    accountId,
    integrationId,
    callerUserId: auth.userId,
  });
  if (!result.ok) return disconnectFailureResponse(result.reason);

  return NextResponse.json({
    // End state — the row is disconnected whether we did it now or it already was.
    disconnected: true,
    alreadyDisconnected: result.alreadyDisconnected,
    providerRevoked: result.providerRevoked,
    workflowsDisabled: result.disabledWorkflowCount,
  });
}
