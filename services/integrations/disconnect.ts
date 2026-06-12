import {
  getByIdForAccountServiceRole,
  disconnectByIdServiceRole,
  countActiveByAccountProviderServiceRole,
  type IntegrationRecord,
} from "@/repositories/integrations";
import * as accountsRepo from "@/repositories/accounts";
import { getRoleServiceRole } from "@/repositories/accountMemberships";
import * as workflowsRepo from "@/repositories/workflows";
import type { WorkflowState } from "@/contracts/workflow";
import {
  selectWorkflowsToDisable,
  LifecycleError,
  type WorkflowDependencyView,
} from "@/core/workflows/lifecycle";
import { LifecycleOrchestrator } from "@/services/workflows/lifecycleOrchestrator";
import { isAccountCredentialProvider } from "@/core/integrations/credentialSharing";
import { decryptToken } from "@/core/encryption/tokens";
import { revokeProviderToken } from "@/services/oauth/dispatcher";

/**
 * Connected-app disconnect service core (Slice 4.APPS-DISCONNECT / CD-1 + CD-2).
 *
 * Backend-only. No UI; CD-2 adds the two routes that call this. The service is
 * the single authorized chokepoint for both the advisory impact read and the
 * destructive disconnect of ONE active integration row.
 *
 * `resolveAndAuthorize` is the shared gate for BOTH entry points (frozen →
 * row-scope → role+provenance), so the advisory GET and the DELETE expose
 * EXACTLY the same authorization surface — a caller who can't disconnect also
 * can't learn the impact, and every "can't see it" case collapses to a single
 * `not_found` (no existence / ownership inference).
 *
 * Disconnect order (each step idempotent / best-effort so a retry never corrupts
 * state): soft-disconnect (sets `disconnected_at`, clears nullable token columns)
 * → cascade dependent ACTIVE/PAUSED workflows to `disabled(integration_revoked)`
 * ONLY when this was the last active row for the provider → best-effort provider
 * revoke (never blocks, never leaks a raw error). Draft / disabled /
 * eligible_to_resume / deleted are never touched; nothing is ever auto-resumed.
 *
 * No-leak: no token, scope, account metadata, display name, or raw provider /
 * decrypt error ever appears in a return value or the structured audit events
 * (ids + counts + provider slug only).
 */

export type DisconnectFailureReason =
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

/** A safe, account-membership-visible summary of one affected workflow. */
export interface AffectedWorkflowSummary {
  id: string;
  name: string;
}

export type WorkflowImpactResult =
  | {
      ok: true;
      /**
       * Count of ACTIVE/PAUSED workflows that would be disabled if this
       * integration is disconnected. Zero when another active connection for the
       * same provider remains on the account (disconnect would disable nothing).
       */
      affectedWorkflowCount: number;
      workflows: readonly AffectedWorkflowSummary[];
    }
  | { ok: false; reason: DisconnectFailureReason };

interface DisconnectInput {
  accountId: string;
  integrationId: string;
  callerUserId: string;
}

function audit(event: string, payload: Record<string, string | number>): void {
  // Structured-log audit (the V2 convention — no audit table). Ids/counts/
  // provider only; NEVER a token, scope, metadata, display name, or error body.
  console.info(JSON.stringify({ event, ...payload }));
}

/**
 * Shared frozen + row-resolution + authorization gate for both entry points.
 * Returns the resolved row on success, or a typed reason that the caller maps to
 * a result / HTTP status.
 *
 * Authorization: account/service (shared) providers ⇒ owner/admin only;
 * personal-credential providers ⇒ owner/admin OR the original connector
 * (`connected_by_user_id === caller`). A non-member can't even learn the row
 * exists ⇒ `not_found` (same as a cross-account / unknown id).
 */
async function resolveAndAuthorize(
  input: DisconnectInput,
): Promise<{ ok: true; row: IntegrationRecord } | { ok: false; reason: DisconnectFailureReason }> {
  const status = await accountsRepo.getDeletionStatusServiceRole(input.accountId);
  if (status === "pending_deletion") {
    return { ok: false, reason: "account_frozen" };
  }

  // Exact (id, account_id) scope ⇒ cross-account / unknown id is null.
  const row = await getByIdForAccountServiceRole(input.accountId, input.integrationId);
  if (!row) return { ok: false, reason: "not_found" };

  // Non-members can't infer the row exists ⇒ not_found (no existence leak).
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

  return { ok: true, row };
}

/**
 * Advisory, READ-ONLY pre-disconnect impact (CD-2). Same authorization gate as
 * `disconnectIntegration`, so only a caller who could disconnect learns the
 * count. Mutates nothing.
 *
 * Counts ACTIVE/PAUSED workflows whose definition references the provider — the
 * exact set the disconnect would disable — and reports 0 when another active
 * connection for the provider remains (a sibling row would still resolve those
 * workflows, so disconnecting THIS one disables nothing). Returns only safe,
 * account-membership-visible fields (workflow id + name); never config, node
 * data, tokens, provider metadata, or creator identity.
 */
export async function getIntegrationWorkflowImpact(
  input: DisconnectInput,
): Promise<WorkflowImpactResult> {
  const gate = await resolveAndAuthorize(input);
  if (!gate.ok) return gate;

  // At advisory time THIS row is still active and INCLUDED in the count. If more
  // than one active row exists, disconnecting this one leaves a sibling ⇒ no
  // cascade ⇒ zero affected. (DELETE counts the same thing AFTER the soft-
  // disconnect, where the threshold is `=== 0` because this row is excluded.)
  const activeCount = await countActiveByAccountProviderServiceRole(
    input.accountId,
    gate.row.provider,
  );
  if (activeCount > 1) {
    return { ok: true, affectedWorkflowCount: 0, workflows: [] };
  }

  const dependents = await selectProviderDependentWorkflows(input.accountId, gate.row.provider);
  return {
    ok: true,
    affectedWorkflowCount: dependents.length,
    workflows: dependents.map((wf) => ({ id: wf.id, name: wf.name })),
  };
}

export async function disconnectIntegration(input: DisconnectInput): Promise<DisconnectResult> {
  const gate = await resolveAndAuthorize(input);
  if (!gate.ok) return gate;
  const row = gate.row;

  // Soft-disconnect. Idempotent: a replay flips nothing and returns early.
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

  // Cascade — only when no other active row for the provider remains.
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

  // Best-effort provider revoke. Decrypt the in-memory token (read before the
  // soft-disconnect); never log it; swallow ALL errors (provider outage,
  // unsupported provider, decrypt failure) so a disconnect always completes.
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

interface ProviderDependentWorkflow {
  id: string;
  name: string;
  state: WorkflowState;
}

/**
 * The single provider-scoped dependency scan shared by the advisory impact read
 * and the disconnect cascade. Lists the account's workflows (excludes soft-
 * deleted), then runs the pure `selectWorkflowsToDisable` predicate — which
 * itself keeps ONLY `active` / `paused` workflows. Draft / disabled /
 * eligible_to_resume never qualify; deleted is already excluded by
 * `listByAccount`. Returns id + name + state (no config, node data, or PII).
 */
async function selectProviderDependentWorkflows(
  accountId: string,
  provider: string,
): Promise<ProviderDependentWorkflow[]> {
  const workflows = await workflowsRepo.listByAccount(accountId);
  const views: WorkflowDependencyView[] = workflows.map((wf) => ({
    workflowId: wf.id,
    state: wf.state,
    requiredIntegrationIds: new Set(
      wf.draftDefinition.nodes.map((n) => n.provider).filter((p): p is string => !!p),
    ),
  }));
  const ids = new Set(selectWorkflowsToDisable(views, new Set([provider])));
  return workflows
    .filter((wf) => ids.has(wf.id))
    .map((wf) => ({ id: wf.id, name: wf.name, state: wf.state }));
}

/**
 * Disable every ACTIVE/PAUSED workflow on the account that depends on `provider`,
 * with reason `integration_revoked`, via the lifecycle orchestrator. Per-workflow
 * disable failures (a concurrent transition / already moved) are swallowed: the
 * disable is idempotent and best-effort, mirroring the orchestrator's own
 * conflict semantics. Returns the count actually transitioned.
 */
async function disableProviderDependentWorkflows(
  accountId: string,
  provider: string,
): Promise<number> {
  const targets = await selectProviderDependentWorkflows(accountId, provider);
  if (targets.length === 0) return 0;

  const orchestrator = new LifecycleOrchestrator();
  let disabled = 0;
  for (const wf of targets) {
    try {
      await orchestrator.disable({ workflowId: wf.id, reason: "integration_revoked" });
      disabled++;
    } catch (err) {
      // Concurrent transition (LIFECYCLE_CONFLICT) or a state that no longer
      // permits disable (INVALID_TRANSITION) — skip; the cascade is best-effort.
      if (!(err instanceof LifecycleError)) throw err;
    }
  }
  return disabled;
}
