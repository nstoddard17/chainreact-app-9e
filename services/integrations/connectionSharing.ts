import {
  getByIdForAccountServiceRole,
  setSharingScopeByIdServiceRole,
} from "@/repositories/integrations";
import * as accountsRepo from "@/repositories/accounts";
import { getRoleServiceRole } from "@/repositories/accountMemberships";
import {
  effectiveIntegrationSharingScope,
  isProviderShareable,
  type IntegrationSharingScope,
} from "@/core/integrations/sharingScope";
import { isConnectionSharingEnabled } from "./connectionSharingFlags";

/**
 * Explicit private-connection sharing service (Slice 4.CONN-SHARE / CS-2).
 *
 * Backend-only, single authorized chokepoint for flipping a PERSONAL connection
 * between `private_to_connector` and `shared_with_account`. The route layer is
 * thin: authenticate → call this → map a typed reason. Mirrors the disconnect
 * service's resolve→authorize→typed-reason→no-leak-audit shape.
 *
 * BEHAVIOR-INERT beyond the column write: this slice writes ONLY
 * `integration_sharing_scope`. Nothing downstream reads it yet — the run/edit
 * gate, execution resolver, workflow DTO booleans, Apps UI, builder, Disconnect,
 * Reconnect, and workflow_node_credentials are all untouched. CS-3+ wire it.
 *
 * Authorization (locked model — plan §0.4/§0.5):
 *   - SHARE (`shared_with_account`): the CONNECTOR ONLY
 *     (`connected_by_user_id === caller`). Owner/admin may NOT silently share a
 *     member's personal external identity (impersonation) ⇒ `forbidden`.
 *   - UNSHARE (`private_to_connector`): the connector, OR owner/admin as a FRAMED
 *     admin safety/removal action (audit-logged via a distinct event). A plain
 *     non-connector member ⇒ `forbidden`. Unshare is a restriction, never a way
 *     to toggle someone's identity INTO shared.
 *   - Account/service providers are shared by classification ⇒
 *     `account_provider_not_shareable` (nothing for this feature to do).
 *   - Non-member / cross-account / unknown / disconnected ⇒ `not_found` (no
 *     existence or ownership inference).
 *
 * Flag gate runs FIRST and does zero I/O when OFF, so a disabled feature mutates
 * nothing and leaks nothing (every caller gets the same `not_enabled`).
 *
 * No-leak: returns only a safe scope enum + booleans; never a token, scope list,
 * provider_account_id, email, account metadata, or connector id. Audit events
 * carry ids + provider slug (+ actor role on the admin path) only — never a user
 * id, token, or raw error.
 */

export type SetSharingFailureReason =
  | "not_enabled"
  | "account_frozen"
  | "not_found"
  | "forbidden"
  | "account_provider_not_shareable";

export type SetSharingResult =
  | { ok: true; scope: IntegrationSharingScope; changed: boolean }
  | { ok: false; reason: SetSharingFailureReason };

export interface SetSharingInput {
  accountId: string;
  integrationId: string;
  callerUserId: string;
  scope: IntegrationSharingScope;
}

function audit(event: string, payload: Record<string, string | number>): void {
  // Structured-log audit (the V2 convention — no audit table). Ids/provider/role
  // only; NEVER a token, scope, metadata, display name, connector id, or error.
  console.info(JSON.stringify({ event, ...payload }));
}

/**
 * Set the sharing scope on one personal connection. See the module doc for the
 * full authorization + no-leak contract.
 */
export async function setIntegrationSharingScope(
  input: SetSharingInput,
): Promise<SetSharingResult> {
  // 0. Temporary dev guard. OFF ⇒ no DB call, no mutation, uniform reason.
  if (!isConnectionSharingEnabled()) {
    return { ok: false, reason: "not_enabled" };
  }

  // 1. Frozen account fails safe (mirrors disconnect / member-management).
  const status = await accountsRepo.getDeletionStatusServiceRole(input.accountId);
  if (status === "pending_deletion") {
    return { ok: false, reason: "account_frozen" };
  }

  // 2. Exact (id, account_id) scope ⇒ cross-account / unknown id is null.
  const row = await getByIdForAccountServiceRole(input.accountId, input.integrationId);
  if (!row) return { ok: false, reason: "not_found" };

  // 3. Non-members can't infer the row exists ⇒ not_found (no existence leak).
  const callerRole = await getRoleServiceRole(input.accountId, input.callerUserId);
  if (callerRole === null) return { ok: false, reason: "not_found" };

  // 4. A disconnected row carries no usable credential and is never mutated.
  //    Collapse to not_found so its existence/state is not revealed.
  if (row.disconnectedAt !== null) return { ok: false, reason: "not_found" };

  // 5. Account/service providers are account-shared by classification — there is
  //    nothing for explicit sharing to flip. (Provider class is not sensitive;
  //    this is reached only by a verified member, after the not_found gate.)
  if (!isProviderShareable(row.provider)) {
    return { ok: false, reason: "account_provider_not_shareable" };
  }

  // 6. Authorize by direction.
  const isConnector =
    row.connectedByUserId !== null && row.connectedByUserId === input.callerUserId;
  const isOwnerAdmin = callerRole === "owner" || callerRole === "admin";

  if (input.scope === "shared_with_account") {
    // SHARE: connector only. Owner/admin may NOT silently share a member's identity.
    if (!isConnector) return { ok: false, reason: "forbidden" };
  } else {
    // UNSHARE: connector, OR owner/admin as a framed admin safety action.
    if (!isConnector && !isOwnerAdmin) return { ok: false, reason: "forbidden" };
  }

  // 7. Mutate. shared_with_account writes the literal; private_to_connector
  //    clears to NULL (the derived default). The repo guards disconnected_at IS
  //    NULL, so a row disconnected mid-flight yields updated:false ⇒ not_found.
  const targetColumn = input.scope === "shared_with_account" ? "shared_with_account" : null;
  const before = effectiveIntegrationSharingScope(row.provider, row.integrationSharingScope);
  const { updated } = await setSharingScopeByIdServiceRole({
    integrationId: input.integrationId,
    scope: targetColumn,
  });
  if (!updated) return { ok: false, reason: "not_found" };

  const changed = before !== input.scope;

  // 8. Audit. Distinct event for the owner/admin safety unshare (the framed,
  //    audit-logged admin action) vs the connector's own toggle.
  const adminSafetyUnshare = input.scope === "private_to_connector" && !isConnector && isOwnerAdmin;
  if (adminSafetyUnshare) {
    audit("account.integration.sharing.admin_unshared", {
      accountId: input.accountId,
      integrationId: input.integrationId,
      provider: row.provider,
      actorRole: callerRole,
    });
  } else {
    audit(
      input.scope === "shared_with_account"
        ? "account.integration.sharing.shared"
        : "account.integration.sharing.unshared",
      {
        accountId: input.accountId,
        integrationId: input.integrationId,
        provider: row.provider,
      },
    );
  }

  return { ok: true, scope: input.scope, changed };
}
