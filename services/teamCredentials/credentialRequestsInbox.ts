import * as workflowsRepo from "@/repositories/workflows";
import { listMemberIdentities } from "@/repositories/accountMemberships";
import { listPendingForCredentialOwnerServiceRole } from "@/repositories/workflowNodeCredentials";
import { isNodeCredentialReassignmentEnabled } from "./flags";

/**
 * Consent inbox service (Slice 4.TEAM-WORKFLOWS-CREDENTIAL-SHARING-8 / CS-7).
 *
 * Surfaces the PENDING per-node credential-reassignment requests awaiting the
 * caller's consent, so the target member can discover + accept / decline them
 * (accept/decline themselves still go through the existing CS-3 routes). This is
 * read-only — it changes no grant state.
 *
 * No new notification type / migration: a CS-3 request already inserts a pending
 * `workflow_node_credentials` row, so the "inbox item" is that row. This service
 * is the self-scoped reader.
 *
 * No-leak contract — the view carries ONLY:
 *   - the workflow id + name and node id (so the target knows which step),
 *   - the provider TYPE (e.g. `gmail`) — NEVER a provider account label / email /
 *     token / scope,
 *   - the requester's account display name (already co-member-visible via the
 *     members roster), falling back to a generic label; never the requester's
 *     provider identity.
 *
 * Feature-flag gated: when `ENABLE_NODE_CREDENTIAL_REASSIGNMENT` is OFF the inbox
 * is empty (the whole feature is hidden), matching the routes' 404-when-off
 * posture without being an existence oracle here (an empty list is safe).
 */

export interface CredentialRequestView {
  /** Workflow the requested step belongs to. */
  workflowId: string;
  /** Node id of the requested step within that workflow. */
  nodeId: string;
  /** Provider TYPE (e.g. `gmail`) — not a provider account label/email. */
  provider: string;
  /** Workflow display name (so the target knows which automation). */
  workflowName: string;
  /** Requester's account display name, or a generic fallback. Never provider identity. */
  requestedByLabel: string;
  /** ISO-8601 timestamp the request was made. */
  requestedAt: string;
}

export async function listIncomingCredentialRequests(input: {
  accountId: string;
  userId: string;
}): Promise<CredentialRequestView[]> {
  if (!isNodeCredentialReassignmentEnabled()) return [];

  const grants = await listPendingForCredentialOwnerServiceRole(input.accountId, input.userId);
  if (grants.length === 0) return [];

  // Safe requester identity: the membership-gated RPC the members roster already
  // uses. We surface display NAME only (never the requester's provider identity).
  const identities = await listMemberIdentities(input.accountId);
  const nameByUser = new Map(
    identities.map((i) => [i.userId, i.displayName?.trim() || null] as const),
  );

  // Resolve each distinct workflow's name once; drop soft-deleted workflows (a
  // hard delete cascades the grant away, so only a soft-delete can leave one).
  const workflowIds = [...new Set(grants.map((g) => g.workflowId))];
  const workflowById = new Map<string, { name: string; deleted: boolean }>();
  await Promise.all(
    workflowIds.map(async (id) => {
      const wf = await workflowsRepo.getByIdServiceRole(id);
      if (wf) workflowById.set(id, { name: wf.name, deleted: wf.state === "deleted" });
    }),
  );

  const views: CredentialRequestView[] = [];
  for (const g of grants) {
    const wf = workflowById.get(g.workflowId);
    if (!wf || wf.deleted) continue;
    const requestedByLabel =
      (g.requestedByUserId ? nameByUser.get(g.requestedByUserId) : null) || "A teammate";
    views.push({
      workflowId: g.workflowId,
      nodeId: g.nodeId,
      provider: g.provider,
      workflowName: wf.name,
      requestedByLabel,
      requestedAt: g.requestedAt,
    });
  }
  return views;
}
