import { isPrivateCredentialProvider } from "@/core/integrations/workflowCredentialScope";
import { resolveNodeOwner, type NodeOwnerResolution } from "@/core/integrations/sharingEligibility";
import { loadAcceptedNodeOwners } from "@/services/teamCredentials/nodeCredentialOwners";
import { listByWorkflowServiceRole } from "@/repositories/workflowNodeConnectorBindings";
import { listSharedConnectorUserIdsServiceRole } from "@/repositories/integrations";

/**
 * Shared workflow credential plan (Slice 4.CONN-SHARE / CS-4b).
 *
 * THE single computation the run/edit GATE and the execution ENGINE both consume,
 * so they can never drift. For every PERSONAL-provider node it resolves the
 * effective owner via the locked precedence (accepted grant → valid binding →
 * single-sharer → creator; see `resolveNodeOwner`) and whether the node is
 * team-runnable.
 *
 * - The GATE allows a non-creator iff `allTeamRunnable` (every personal node
 *   resolves to a specific shared connector).
 * - The ENGINE sets each node's credential-resolution context to
 *   `ownerByNode.get(node.id) ?? creator` — the SAME owner the gate validated.
 *
 * ONLY called when `ENABLE_CONNECTION_SHARING` is ON (the caller checks the flag);
 * the flag-OFF path keeps the exact pre-CS-4b behavior and never reaches here.
 *
 * No-leak: returns user ids for INTERNAL resolution only (the engine pins by user;
 * the gate reads booleans). It is never serialized to a client — the run/edit DTO
 * exposes only `viewerCanRunEdit`. Reads select no token/scope/label/metadata.
 */

export interface WorkflowCredentialPlan {
  /** nodeId → effective owner user id (PERSONAL-provider nodes only). */
  readonly ownerByNode: ReadonlyMap<string, string>;
  /** nodeId → full resolution detail (PERSONAL-provider nodes only). */
  readonly resolutions: ReadonlyMap<string, NodeOwnerResolution>;
  /** Every personal-provider node resolves to a specific shared connector. */
  readonly allTeamRunnable: boolean;
}

interface PlanInputNode {
  readonly id: string;
  readonly provider: string;
}

/**
 * Build the plan for a workflow's nodes. Gathers — once — the accepted per-node
 * grants (flag-gated inside `loadAcceptedNodeOwners`), the node connector
 * bindings, and the per-provider shared-connector sets, then applies the pure
 * precedence per personal node.
 */
export async function buildWorkflowCredentialPlan(input: {
  workflowId: string;
  accountId: string;
  createdByUserId: string;
  nodes: readonly PlanInputNode[];
}): Promise<WorkflowCredentialPlan> {
  const personalNodes = input.nodes.filter(
    (n) => n.provider && isPrivateCredentialProvider(n.provider),
  );
  if (personalNodes.length === 0) {
    return { ownerByNode: new Map(), resolutions: new Map(), allTeamRunnable: true };
  }

  const distinctProviders = [...new Set(personalNodes.map((n) => n.provider))];

  const [acceptedOwners, bindings, sharedSetEntries] = await Promise.all([
    loadAcceptedNodeOwners(input.workflowId),
    listByWorkflowServiceRole(input.workflowId),
    Promise.all(
      distinctProviders.map(
        async (provider) =>
          [provider, await listSharedConnectorUserIdsServiceRole(input.accountId, provider)] as const,
      ),
    ),
  ]);

  const sharedByProvider = new Map(sharedSetEntries);
  // Binding is per-node; only honor it when its provider still matches the node.
  const bindingByNode = new Map(bindings.map((b) => [b.nodeId, b]));

  const ownerByNode = new Map<string, string>();
  const resolutions = new Map<string, NodeOwnerResolution>();
  let allTeamRunnable = true;

  for (const node of personalNodes) {
    const binding = bindingByNode.get(node.id);
    const bindingConnector =
      binding && binding.provider === node.provider ? binding.connectorUserId : null;

    const resolution = resolveNodeOwner({
      creatorUserId: input.createdByUserId,
      acceptedGrantOwner: acceptedOwners.get(node.id) ?? null,
      bindingConnector,
      sharedConnectors: sharedByProvider.get(node.provider) ?? new Set<string>(),
    });
    ownerByNode.set(node.id, resolution.owner);
    resolutions.set(node.id, resolution);
    if (!resolution.teamRunnable) allTeamRunnable = false;
  }

  return { ownerByNode, resolutions, allTeamRunnable };
}
