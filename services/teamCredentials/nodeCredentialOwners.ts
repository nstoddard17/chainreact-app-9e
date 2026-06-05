import { isNodeCredentialReassignmentEnabled } from "./flags";
import {
  listAcceptedByWorkflowServiceRole,
  getForNodeServiceRole,
} from "@/repositories/workflowNodeCredentials";
import { isPersonalCredentialProvider } from "@/core/integrations/credentialSharing";

/**
 * Per-node credential-owner resolution for execution
 * (Slice 4.TEAM-WORKFLOWS-CREDENTIAL-SHARING-3 / CS-2).
 *
 * The engine sets the credential-resolution context (read by `refreshAndRetry`)
 * to the EFFECTIVE OWNER of each node — the user whose personal connection that
 * node runs under. Before CS-2 that was always `workflow.created_by_user_id`
 * (the 22B creator pin). CS-2 lets a personal-provider node instead run under an
 * ACCEPTED per-node owner from `workflow_node_credentials`, gated by the
 * `ENABLE_NODE_CREDENTIAL_REASSIGNMENT` flag.
 *
 * Provenance / billing attribution (the handler's `userId`) is NOT affected —
 * only credential resolution. There is no runtime fallback: if a node's accepted
 * owner has no active connection, `refreshAndRetry` (pinned to that owner via the
 * context) throws the existing clear owner-must-connect error. The only fallback
 * to the creator is the static one below — when NO accepted row exists for a node.
 */

/** nodeId → accepted credential-owner userId, for one workflow/run. */
export type AcceptedNodeOwners = ReadonlyMap<string, string>;

const EMPTY: AcceptedNodeOwners = new Map<string, string>();

/**
 * Batch-load a workflow's ACCEPTED node-credential owners ONCE per run.
 *
 * Flag OFF → returns the shared empty map and makes NO DB call, so flag-OFF
 * execution is byte-for-byte the pre-CS-2 creator-pin path. Avoids per-node
 * lookups: the engine consults the returned map in memory for every node.
 */
export async function loadAcceptedNodeOwners(
  workflowId: string,
): Promise<AcceptedNodeOwners> {
  if (!isNodeCredentialReassignmentEnabled()) return EMPTY;
  const rows = await listAcceptedByWorkflowServiceRole(workflowId);
  if (rows.length === 0) return EMPTY;
  const map = new Map<string, string>();
  for (const r of rows) map.set(r.nodeId, r.credentialOwnerUserId);
  return map;
}

/**
 * The effective credential owner whose personal connection a node runs under.
 *
 * - Account/service providers: ALWAYS the creator value — `refreshAndRetry`
 *   ignores the context for them (account-shared), so behavior is unchanged. Any
 *   accepted row for such a provider is deliberately ignored.
 * - Personal providers: the accepted node owner if one exists, else the creator.
 * - Missing / blank provider or nodeId: the creator (never crash; preserve today).
 *
 * Pure — no I/O. When `acceptedOwners` is empty (flag OFF, or no accepted rows)
 * this always returns the creator, i.e. the pre-CS-2 (22B) behavior.
 */
export function effectiveCredentialOwner(input: {
  provider: string | null | undefined;
  nodeId: string | null | undefined;
  creatorUserId: string;
  acceptedOwners: AcceptedNodeOwners;
}): string {
  const { provider, nodeId, creatorUserId, acceptedOwners } = input;
  if (!provider || !nodeId) return creatorUserId;
  if (!isPersonalCredentialProvider(provider)) return creatorUserId;
  return acceptedOwners.get(nodeId) ?? creatorUserId;
}

/**
 * Resolve the ACCEPTED credential owner for a SINGLE node (CS-4 — builder/options
 * path), or null when none / flag OFF.
 *
 * Flag OFF or no `nodeId` → null with NO DB call. Only an `accepted` grant
 * overrides; a `pending` grant does NOT change options resolution (the assigned
 * member only becomes effective on accept, mirroring CS-2 execution). Returns the
 * owner's user id only — the caller pins the lookup to it; no label/email is ever
 * read or returned.
 */
export async function resolveEffectiveNodeOwner(
  workflowId: string,
  nodeId: string | null | undefined,
): Promise<string | null> {
  if (!isNodeCredentialReassignmentEnabled()) return null;
  if (!nodeId) return null;
  const grant = await getForNodeServiceRole(workflowId, nodeId);
  return grant && grant.status === "accepted" ? grant.credentialOwnerUserId : null;
}
