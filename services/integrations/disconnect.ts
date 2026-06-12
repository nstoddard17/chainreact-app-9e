import {
  getByIdForAccountServiceRole,
  disconnectByIdServiceRole,
  countActiveByAccountProviderServiceRole,
} from "@/repositories/integrations";
import * as accountsRepo from "@/repositories/accounts";
import { getRoleServiceRole } from "@/repositories/accountMemberships";
import * as workflowsRepo from "@/repositories/workflows";
import {
  selectWorkflowsToDisable,
  LifecycleError,
  type WorkflowDependencyView,
} from "@/core/workflows/lifecycle";
import { LifecycleOrchestrator } from "@/services/workflows/lifecycleOrchestrator";
import { isAccountCredentialProvider } from "@/core/integrations/credentialSharing";
import { decryptToken } from "@/core/encryption/tokens";
import { revokeProviderToken } from "@/services/oauth/dispatcher";
import { isIntegrationDisconnectEnabled } from "./disconnectFlags";

/**
 * Connected-app disconnect service core (Slice 4.APPS-DISCONNECT / CD-1).
 *
 * Backend-only. No route / UI in this slice; the DELETE route + the apps-page
 * control land in CD-3 / CD-4. The service is the single authorized chokepoint
 * for tearing down ONE active integration row.
 *
 * Order (each step is idempotent / best-effort so a retry never corrupts state):
 *   1. Feature flag gate — OFF ⇒ `feature_disabled`, nothing touched.
 *   2. Frozen-account refusal (mirrors member management).
 *   3. Resolve the row by (accountId, integrationId), service-role. Unknown /
 *      cross-account ⇒ `not_found` (no existence leak).
 *   4. Authz: account/service (shared) providers ⇒ owner/admin only; personal-
 *      credential providers ⇒ owner/admin OR the original connector
 *      (`connected_by_user_id === caller`). Non-member ⇒ `not_found`.
 *   5. Soft-disconnect (sets `disconnected_at`, clears nullable token columns).
 *      Already-disconnected ⇒ idempotent no-op, returns early.
 *   6. Cascade — only when this was the LAST active row for the provider on the
 *      account: dependent ACTIVE/PAUSED workflows ⇒ `disabled(integration_revoked)`.
 *      Draft / disabled / eligible_to_resume / deleted are never touched. Never
 *      auto-resumes — reconnect later flows through the existing
 *      `eligible_to_resume` path.
 *   7. Best-effort provider token revoke (decrypt in-memory token, never logged).
 *      Failure NEVER blocks the disconnect and NEVER surfaces a raw provider error.
 *
 * No-leak: no token, scope, account metadata, display name, or raw provider /
 * decrypt error ever appears in the return value or the structured audit events
 * (which carry only ids + counts + provider slug).
 */

export type DisconnectFailureReason =
  | "feature_disabled"
  | "account_frozen"
  | "not_found"
  | "forbidden";

export type DisconnectResult =
  | {
      ok: true;
      /** Workflows transitioned to `disabled(integration_revoked)` by this call. */
      disabledWorkflowCount: number;
      /** True when the provider revoke call returned without throwing. */
      providerRevoked: boolean;
      /** True when the row was already disconnected (idempotent replay). */
      alreadyDisconnected: boolean;
    }
  | { ok: false; reason: DisconnectFailureReason };

function audit(event: string, payload: Record<string, string | number>): void {
  // Structured-log audit (the V2 convention — no audit table). Ids/counts/
  // provider only; NEVER a token, scope, metadata, display name, or error body.
  console.info(JSON.stringify({ event, ...payload }));
}

export async function disconnectIntegration(input: {
  accountId: string;
  integrationId: string;
  callerUserId: string;
}): Promise<DisconnectResult> {
  // 1. Flag gate — inert in production until explicitly enabled.
  if (!isIntegrationDisconnectEnabled()) {
    return { ok: false, reason: "feature_disabled" };
  }

  // 2. Frozen account refuses (purge owns teardown there). Mirrors member mgmt.
  const status = await accountsRepo.getDeletionStatusServiceRole(input.accountId);
  if (status === "pending_deletion") {
    return { ok: false, reason: "account_frozen" };
  }

  // 3. Resolve the row (exact account scope ⇒ cross-account/unknown is null).
  const row = await getByIdForAccountServiceRole(input.accountId, input.integrationId);
  if (!row) return { ok: false, reason: "not_found" };

  // 4. Authz. Non-members can't even learn the row exists ⇒ not_found.
  const callerRole = await getRoleServiceRole(input.accountId, input.callerUserId);
  if (callerRole === null) return { ok: false, reason: "not_found" };
  const isOwnerAdmin = callerRole === "owner" || callerRole === "admin";

  if (isAccountCredentialProvider(row.provider)) {
    // Shared org resource — disconnecting affects every member ⇒ owner/admin only.
    if (!isOwnerAdmin) return { ok: false, reason: "forbidden" };
  } else {
    // Personal credential — owner/admin OR the member who connected it.
    const isConnector =
      row.connectedByUserId !== null && row.connectedByUserId === input.callerUserId;
    if (!isOwnerAdmin && !isConnector) return { ok: false, reason: "forbidden" };
  }

  // 5. Soft-disconnect. Idempotent: a replay flips nothing and returns early.
  const { disconnected } = await disconnectByIdServiceRole({
    integrationId: input.integrationId,
  });
  if (!disconnected) {
    audit("account.integration.disconnect.already_disconnected", {
      accountId: input.accountId,
      integrationId: input.integrationId,
      provider: row.provider,
    });
    return { ok: true, disabledWorkflowCount: 0, providerRevoked: false, alreadyDisconnected: true };
  }
  audit("account.integration.disconnect.local_disconnected", {
    accountId: input.accountId,
    integrationId: input.integrationId,
    provider: row.provider,
  });

  // 6. Cascade — only when no other active row for the provider remains.
  let disabledWorkflowCount = 0;
  const remainingActive = await countActiveByAccountProviderServiceRole(
    input.accountId,
    row.provider,
  );
  if (remainingActive === 0) {
    disabledWorkflowCount = await disableProviderDependentWorkflows(
      input.accountId,
      row.provider,
    );
    if (disabledWorkflowCount > 0) {
      audit("account.integration.disconnect.workflows_disabled", {
        accountId: input.accountId,
        provider: row.provider,
        count: disabledWorkflowCount,
      });
    }
  }

  // 7. Best-effort provider revoke. Decrypt the in-memory token (read before the
  //    soft-disconnect); never log it; swallow ALL errors (provider outage,
  //    unsupported provider, decrypt failure) so a disconnect always completes.
  let providerRevoked = false;
  try {
    const accessToken = decryptToken(row.accessTokenEncrypted);
    await revokeProviderToken(row.provider, accessToken);
    providerRevoked = true;
    audit("account.integration.disconnect.provider_revoked", {
      accountId: input.accountId,
      provider: row.provider,
    });
  } catch {
    // Raw provider / decrypt error is intentionally discarded — never surfaced.
    audit("account.integration.disconnect.provider_revoke_failed", {
      accountId: input.accountId,
      provider: row.provider,
    });
  }

  return { ok: true, disabledWorkflowCount, providerRevoked, alreadyDisconnected: false };
}

/**
 * Disable every ACTIVE/PAUSED workflow on the account whose definition references
 * `provider`, with reason `integration_revoked`. Reuses the pure
 * `selectWorkflowsToDisable` predicate (which itself excludes draft / disabled /
 * eligible_to_resume), and `listByAccount` excludes soft-deleted workflows — so
 * draft / disabled / deleted are never touched. Per-workflow disable failures
 * (a concurrent transition / already moved) are swallowed: the disable is
 * idempotent and best-effort, mirroring the lifecycle orchestrator's own
 * conflict semantics. Returns the count actually transitioned.
 */
async function disableProviderDependentWorkflows(
  accountId: string,
  provider: string,
): Promise<number> {
  const workflows = await workflowsRepo.listByAccount(accountId);
  const views: WorkflowDependencyView[] = workflows.map((wf) => ({
    workflowId: wf.id,
    state: wf.state,
    requiredIntegrationIds: new Set(
      wf.draftDefinition.nodes.map((n) => n.provider).filter((p): p is string => !!p),
    ),
  }));
  const toDisable = selectWorkflowsToDisable(views, new Set([provider]));
  if (toDisable.length === 0) return 0;

  const orchestrator = new LifecycleOrchestrator();
  let disabled = 0;
  for (const workflowId of toDisable) {
    try {
      await orchestrator.disable({ workflowId, reason: "integration_revoked" });
      disabled++;
    } catch (err) {
      // Concurrent transition (LIFECYCLE_CONFLICT) or a state that no longer
      // permits disable (INVALID_TRANSITION) — skip; the cascade is best-effort.
      if (!(err instanceof LifecycleError)) throw err;
    }
  }
  return disabled;
}
