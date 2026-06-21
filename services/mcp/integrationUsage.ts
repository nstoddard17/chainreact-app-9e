import { getByIdForAccountServiceRole } from "@/repositories/integrations";
import { getRoleServiceRole } from "@/repositories/accountMemberships";
import { isConnectionSharingEnabled } from "@/services/integrations/connectionSharingFlags";
import {
  decideIntegrationUsage,
  type IntegrationUsagePurpose,
} from "@/core/integrations/integrationUsagePolicy";
import type { McpIntegrationStatus } from "./tools/serialize";
import { mcpIntegrationStatus } from "./tools/serialize";

/**
 * Integration-usage authorization for public MCP + future write/run MCP tools
 * (Slice 4.PUBLIC-MCP-USAGE-1).
 *
 * The reusable permission gate every MCP tool that touches a provider connection
 * MUST pass before acting. It composes, in order:
 *   1. EXISTENCE + ACCOUNT SCOPE — `getByIdForAccountServiceRole(accountId, id)`
 *      filters on (id, account_id), so an integration from ANOTHER account resolves
 *      to null → `not_found` (opaque; no cross-account existence oracle).
 *   2. MEMBERSHIP — the actor (the MCP token minter) must STILL be a member of the
 *      account (`getRoleServiceRole`). Checked BEFORE the usage policy, so an
 *      offboarded actor is denied as `not_a_member`, never reaching the policy.
 *   3. USAGE POLICY — `decideIntegrationUsage` (pure): account/service usable by
 *      members; member-connected identities usable only by the connector (or via the
 *      flag-gated explicit `shared_with_account`).
 *
 * Account ownership of an integration does NOT imply every member / token may use
 * it: a co-member's Outlook/Gmail/calendar identity is private by default and is
 * denied with `integration_not_allowed_for_actor` (typed) here.
 *
 * No-leak: the success shape carries only id/provider/displayName/status; the deny
 * shapes carry an enum reason + a safe static detail. `connected_by_user_id`, OAuth
 * scopes, token/encrypted columns, provider payloads never appear in the result.
 */

export type CanUseIntegrationFailureReason =
  | "not_found"
  | "not_a_member"
  | "integration_not_allowed_for_actor";

export interface CanUseIntegrationOk {
  ok: true;
  /** Safe subset — never tokens/scopes/metadata/provenance. */
  integration: {
    id: string;
    provider: string;
    displayName: string | null;
    status: McpIntegrationStatus;
  };
}

export interface CanUseIntegrationDenied {
  ok: false;
  reason: CanUseIntegrationFailureReason;
  /** Safe, id-free human-readable detail (present for the actor-deny case). */
  detail?: string;
}

export type CanActorUseIntegrationResult = CanUseIntegrationOk | CanUseIntegrationDenied;

export interface CanActorUseIntegrationInput {
  actorUserId: string;
  /** The MCP token's account (the only account the actor may act within). */
  accountId: string;
  integrationId: string;
  purpose: IntegrationUsagePurpose;
}

export async function canActorUseIntegrationForMcp(
  input: CanActorUseIntegrationInput,
): Promise<CanActorUseIntegrationResult> {
  // 1. Existence + account scope (cross-account id → null → opaque not_found).
  const integration = await getByIdForAccountServiceRole(input.accountId, input.integrationId);
  if (!integration) return { ok: false, reason: "not_found" };

  // 2. Membership re-check — actor must still belong to the account.
  const role = await getRoleServiceRole(input.accountId, input.actorUserId);
  if (role === null) return { ok: false, reason: "not_a_member" };

  // 3. Identity-usage policy for the requested purpose.
  const decision = decideIntegrationUsage({
    provider: integration.provider,
    connectedByUserId: integration.connectedByUserId,
    sharingScope: integration.integrationSharingScope,
    actorUserId: input.actorUserId,
    purpose: input.purpose,
    connectionSharingEnabled: isConnectionSharingEnabled(),
  });
  if (!decision.allowed) {
    return { ok: false, reason: decision.reason, detail: decision.detail };
  }

  return {
    ok: true,
    integration: {
      id: integration.id,
      provider: integration.provider,
      displayName: integration.displayName,
      status: mcpIntegrationStatus(integration),
    },
  };
}
