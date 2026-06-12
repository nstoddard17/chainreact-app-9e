import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { getIntegrationWorkflowImpact } from "@/services/integrations/disconnect";
import { disconnectFailureResponse } from "../_shared";

/**
 * GET /api/accounts/[id]/integrations/[integrationId]/workflow-impact
 * (Slice 4.APPS-DISCONNECT / CD-2; live in CD-LIVE)
 *
 * Advisory, READ-ONLY pre-disconnect check: how many of the account's
 * ACTIVE/PAUSED workflows would be disabled if this integration is disconnected.
 * The disconnect UI fetches this to show a non-blocking warning before confirming.
 *
 * Authorization MIRRORS the DELETE exactly — same service gate
 * (`getIntegrationWorkflowImpact` → `resolveAndAuthorize`: frozen → exact
 * (account, id) row scope → account-role + provenance). A caller who could not
 * disconnect can not learn the impact; every "can't see it" case is a uniform
 * 404 (no existence / ownership leak).
 *
 * Safe payload only: `{ affectedWorkflowCount, workflows: [{ id, name }] }`.
 * Workflow id + name are already visible to any account member; NO config, node
 * data, tokens, provider metadata, scopes, or creator identity are exposed.
 * `affectedWorkflowCount` is 0 when another active connection for the provider
 * remains (disconnect would disable nothing).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; integrationId: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;

  const { id: accountId, integrationId } = await params;
  const result = await getIntegrationWorkflowImpact({
    accountId,
    integrationId,
    callerUserId: auth.userId,
  });
  if (!result.ok) return disconnectFailureResponse(result.reason);

  return NextResponse.json({
    affectedWorkflowCount: result.affectedWorkflowCount,
    workflows: result.workflows,
  });
}
