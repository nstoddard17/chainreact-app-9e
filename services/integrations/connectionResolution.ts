import { isPrivateCredentialProvider } from "@/core/integrations/workflowCredentialScope";
import { resolveNodeOwner, type NodeOwnerResolution } from "@/core/integrations/sharingEligibility";
import {
  loadAcceptedNodeOwners,
  loadAcceptedNodeOwnersBatch,
  type AcceptedNodeOwners,
} from "@/services/teamCredentials/nodeCredentialOwners";
import {
  listByWorkflowServiceRole,
  listByWorkflowsServiceRole,
  type WorkflowNodeConnectorBindingRecord,
} from "@/repositories/workflowNodeConnectorBindings";
import {
  listSharedConnectorUserIdsServiceRole,
  listSharedConnectorsByProviderServiceRole,
} from "@/repositories/integrations";

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

const EMPTY_PLAN: WorkflowCredentialPlan = {
  ownerByNode: new Map(),
  resolutions: new Map(),
  allTeamRunnable: true,
};

/**
 * PURE per-node resolution from pre-gathered data — the single source of the
 * gate/executor/detail/list decision. No I/O: the caller supplies the accepted
 * grants, node bindings, and per-provider shared-connector sets (gathered either
 * per-workflow by `buildWorkflowCredentialPlan` or batched by
 * `buildWorkflowCredentialPlansBatch`). Same `resolveNodeOwner` precedence either
 * way, so the single and batched paths can never drift.
 */
function computeCredentialPlanFromData(input: {
  createdByUserId: string;
  personalNodes: readonly PlanInputNode[];
  acceptedOwners: AcceptedNodeOwners;
  bindingByNode: ReadonlyMap<string, WorkflowNodeConnectorBindingRecord>;
  sharedByProvider: ReadonlyMap<string, ReadonlySet<string>>;
}): WorkflowCredentialPlan {
  const ownerByNode = new Map<string, string>();
  const resolutions = new Map<string, NodeOwnerResolution>();
  let allTeamRunnable = true;

  for (const node of input.personalNodes) {
    const binding = input.bindingByNode.get(node.id);
    // Binding is per-node; only honor it when its provider still matches the node.
    const bindingConnector =
      binding && binding.provider === node.provider ? binding.connectorUserId : null;

    const resolution = resolveNodeOwner({
      creatorUserId: input.createdByUserId,
      acceptedGrantOwner: input.acceptedOwners.get(node.id) ?? null,
      bindingConnector,
      sharedConnectors: input.sharedByProvider.get(node.provider) ?? new Set<string>(),
    });
    ownerByNode.set(node.id, resolution.owner);
    resolutions.set(node.id, resolution);
    if (!resolution.teamRunnable) allTeamRunnable = false;
  }

  return { ownerByNode, resolutions, allTeamRunnable };
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
  if (personalNodes.length === 0) return EMPTY_PLAN;

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

  return computeCredentialPlanFromData({
    createdByUserId: input.createdByUserId,
    personalNodes,
    acceptedOwners,
    bindingByNode: new Map(bindings.map((b) => [b.nodeId, b])),
    sharedByProvider: new Map(sharedSetEntries),
  });
}

/**
 * Batched plan builder for the workflows LIST/dashboard (CS-5b). Resolves the
 * SAME `allTeamRunnable` decision as the single `buildWorkflowCredentialPlan`, for
 * ALL records of one account, in **bounded queries** — at most THREE reads total
 * regardless of how many workflows are shown:
 *   1. shared-connector sets for every distinct private provider (one `IN` query)
 *   2. accepted node-credential grants for every workflow (one `IN` query, flag-gated)
 *   3. node connector bindings for every workflow (one `IN` query)
 * Records with no private-provider nodes get the trivially-runnable plan with NO
 * query attributed to them. Returns a map workflowId → plan for the supplied records.
 *
 * No-leak: identical to the single path — user ids are used only for in-memory
 * resolution; nothing here is serialized to a client.
 */
export async function buildWorkflowCredentialPlansBatch(input: {
  accountId: string;
  records: ReadonlyArray<{
    id: string;
    createdByUserId: string;
    nodes: readonly PlanInputNode[];
  }>;
}): Promise<Map<string, WorkflowCredentialPlan>> {
  const result = new Map<string, WorkflowCredentialPlan>();
  const personalByWorkflow = new Map<string, PlanInputNode[]>();
  const allProviders = new Set<string>();

  for (const rec of input.records) {
    const personal = rec.nodes.filter((n) => n.provider && isPrivateCredentialProvider(n.provider));
    if (personal.length === 0) {
      result.set(rec.id, EMPTY_PLAN); // no private providers → team-runnable, no query
      continue;
    }
    personalByWorkflow.set(rec.id, personal);
    for (const n of personal) allProviders.add(n.provider);
  }
  if (personalByWorkflow.size === 0) return result;

  const workflowIds = [...personalByWorkflow.keys()];
  const [sharedByProvider, acceptedByWorkflow, bindingsByWorkflow] = await Promise.all([
    listSharedConnectorsByProviderServiceRole(input.accountId, [...allProviders]),
    loadAcceptedNodeOwnersBatch(workflowIds),
    listByWorkflowsServiceRole(workflowIds),
  ]);

  for (const [workflowId, personalNodes] of personalByWorkflow) {
    const rec = input.records.find((r) => r.id === workflowId)!;
    const bindings = bindingsByWorkflow.get(workflowId) ?? [];
    result.set(
      workflowId,
      computeCredentialPlanFromData({
        createdByUserId: rec.createdByUserId,
        personalNodes,
        acceptedOwners: acceptedByWorkflow.get(workflowId) ?? new Map<string, string>(),
        bindingByNode: new Map(bindings.map((b) => [b.nodeId, b])),
        sharedByProvider,
      }),
    );
  }
  return result;
}
