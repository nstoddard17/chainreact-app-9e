import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";
import * as integrationsRepo from "@/repositories/integrations";

/**
 * Server-owned connection + trigger binding collector (WORKFLOW-LIVE-TEST-3 §3).
 *
 * Resolves, from the SAVED workflow and the account's own integrations, exactly which
 * connections a live test would execute under. The result is frozen onto the session at
 * preparation and re-collected + compared at start and at authorization — so a swapped,
 * disconnected, or foreign connection between disclosure and execution invalidates the consent
 * instead of silently running under something the user never reviewed.
 *
 * TRUST BOUNDARY: everything here is server-derived. Node providers come from the saved
 * definition; whether a provider needs a connection comes from the discovery registry
 * (`requiresIntegration`); the integration rows come from `getActiveForExecution`, which is
 * account-scoped by construction — a connection belonging to another account can never resolve.
 * Client-posted connection ids are ignored by every caller.
 *
 * SCOPE (documented v1 limits, not accidents):
 *   - Bindings resolve per PROVIDER via the account-level lookup (`providerAccountId: null`) —
 *     the same default the engine uses outside per-node credential plans. Per-node
 *     credential-owner overrides (workflow_node_credentials) affect WHICH row personal-credential
 *     providers resolve at run time; the live-test route additionally requires the caller to
 *     pass `assertWorkflowRunEditAllowed` (creator-pin), so a live test always runs under the
 *     same identity a Run-Manually would.
 *   - `connectionIds` is DEDUPED + SORTED — a deterministic set, safe to diff and to hash.
 */

export interface ResolvedConnectionBinding {
  readonly provider: string;
  /** Integration row id — an opaque V2 id, never a provider token or account label. */
  readonly integrationId: string;
  /** Node ids that execute under this connection (trigger included). */
  readonly nodeIds: readonly string[];
}

export interface TriggerBindingInfo {
  readonly nodeId: string;
  readonly provider: string;
  readonly eventType: string;
}

export type CollectBindingsResult =
  | {
      ok: true;
      trigger: TriggerBindingInfo;
      bindings: readonly ResolvedConnectionBinding[];
      /** Deduped, sorted integration ids — the set the fingerprint and the session store. */
      connectionIds: readonly string[];
    }
  | { ok: false; reason: "no_trigger" }
  /** A required provider has no active connection on this account. */
  | { ok: false; reason: "integration_unavailable"; provider: string };

export async function collectConnectionBindings(input: {
  accountId: string;
  definition: WorkflowDefinition;
}): Promise<CollectBindingsResult> {
  const trigger = input.definition.nodes.find((n) => n.kind === "trigger");
  if (!trigger) return { ok: false, reason: "no_trigger" };

  // provider → node ids that need it (only nodes whose metadata says requiresIntegration).
  const providerNodes = new Map<string, string[]>();
  for (const node of input.definition.nodes) {
    if (!node.type) continue;
    const key = `${node.provider}:${node.type}`;
    const meta = node.kind === "trigger" ? getTriggerMeta(key) : getActionMeta(key);
    // Unregistered node types are readiness's problem (they fail validation upstream); native /
    // no-integration nodes bind nothing.
    if (!meta?.requiresIntegration) continue;
    const list = providerNodes.get(node.provider) ?? [];
    list.push(node.id);
    providerNodes.set(node.provider, list);
  }

  const bindings: ResolvedConnectionBinding[] = [];
  for (const [provider, nodeIds] of [...providerNodes.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const integration = await integrationsRepo.getActiveForExecution(
      input.accountId,
      provider,
      null,
    );
    if (!integration) return { ok: false, reason: "integration_unavailable", provider };
    bindings.push({ provider, integrationId: integration.id, nodeIds });
  }

  const connectionIds = [...new Set(bindings.map((b) => b.integrationId))].sort();

  return {
    ok: true,
    trigger: { nodeId: trigger.id, provider: trigger.provider, eventType: trigger.type },
    bindings,
    connectionIds,
  };
}

/** Set equality over two deduped-sorted id arrays. */
export function connectionIdsEqual(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}
